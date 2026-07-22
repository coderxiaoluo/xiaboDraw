if (window.__XIAOBO_DRAW_CONTENT__) {
  // 防止扩展图标补注入时重复初始化
} else {
window.__XIAOBO_DRAW_CONTENT__ = true;

const imageCache = new Map();
const RATIO_OPTIONS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const DEFAULT_PREVIEW_LOGO = chrome.runtime.getURL("icons/icon-128.png");
const MAX_REFERENCE_IMAGES = 6;
let hoverHideTimer = null;

const state = {
  settings: null,
  hoverImage: null,
  panelImage: null,
  panelOpen: false,
  panelPinned: false,
  panelDrag: null,
  currentJob: null,
  historyId: null,
  referenceImages: [],
  panelData: createEmptyPanelData(),
  actionState: {
    analyze: false,
    generate: false
  }
};

const hoverTrigger = document.createElement("button");
hoverTrigger.id = "pg-hover-trigger";
hoverTrigger.type = "button";
hoverTrigger.title = "分析图片并生成提示词";
hoverTrigger.innerHTML = `<img class="pg-hover-icon" src="${chrome.runtime.getURL("icons/icon-32.png")}" alt="小波绘词" width="20" height="20" draggable="false" />`;

const panel = document.createElement("aside");
panel.id = "pg-panel";
panel.innerHTML = `
  <div class="pg-shell">
    <div class="pg-header">
      <div class="pg-title">
        <strong class="pg-brand">小波绘词</strong>
      </div>
      <div class="pg-header-actions">
        <button class="pg-icon-button" id="pg-pin" type="button" aria-label="置顶面板" title="置顶后可拖动面板" aria-pressed="false">📌</button>
        <button class="pg-icon-button" id="pg-open-history" type="button" aria-label="打开历史" title="历史记录">🕑</button>
        <button class="pg-icon-button" id="pg-open-options" type="button" aria-label="打开设置" title="打开设置">⚙</button>
        <button class="pg-icon-button" id="pg-close" type="button" aria-label="关闭" title="关闭">✕</button>
      </div>
    </div>

    <div class="pg-result-bar" id="pg-drop-zone">
      <div class="pg-preview"><img id="pg-preview-image" class="is-logo" src="${chrome.runtime.getURL("icons/icon-128.png")}" alt="小波绘词" /></div>
      <div class="pg-title pg-source-meta">
        <strong id="pg-image-title">当前图片</strong>
        <span class="pg-image-url" id="pg-image-url" title="">等待选择图片</span>
        <div class="pg-source-actions">
          <button class="pg-chip" id="pg-upload-image" type="button">上传图片</button>
          <button class="pg-chip" id="pg-paste-image" type="button">粘贴图片</button>
          <input id="pg-file-input" type="file" accept="image/*" multiple hidden />
        </div>
      </div>
    </div>

    <section class="pg-section pg-section-prompt">
      <div class="pg-section-head">
        <strong>提示词</strong>
        <div class="pg-chip-group">
          <button class="pg-chip" id="pg-detail-short" type="button">精简版</button>
          <button class="pg-chip is-active" id="pg-detail-full" type="button">完整版</button>
          <button class="pg-chip" id="pg-toggle-translation" type="button">翻译</button>
          <button class="pg-chip" id="pg-toggle-structure" type="button">查看结构</button>
        </div>
      </div>

      <div class="pg-editor">
        <textarea class="pg-textarea" id="pg-prompt-input" placeholder="输入提示词；图生图可添加多张参考图，并用 @图1 @图2 引用"></textarea>
        <div class="pg-at-menu pg-hidden" id="pg-at-menu" role="listbox"></div>
        <span class="pg-char-count" id="pg-char-count">0 字</span>
      </div>
      <div class="pg-structure pg-hidden" id="pg-structure">
        <div class="pg-structure-grid" id="pg-structure-grid"></div>
      </div>
      <div class="pg-meta">
        <span class="pg-status" id="pg-status">就绪</span>
      </div>

      <div class="pg-actions pg-actions-fixed">
        <button class="pg-action pg-action-secondary" id="pg-copy" type="button">复制提示词</button>
        <button class="pg-action pg-action-primary" id="pg-analyze" type="button">重新识别</button>
      </div>
    </section>

    <section class="pg-section" id="pg-generate-section">
      <div class="pg-section-head">
        <strong class="pg-section-title"><span class="pg-section-icon" aria-hidden="true">✎</span>立刻生图</strong>
      </div>

      <div class="pg-generate-row">
        <label class="pg-select-wrap">
          <span>图片比例</span>
          <div class="pg-ratio-select" id="pg-ratio-select-root">
            <select id="pg-ratio-select" hidden></select>
            <button type="button" class="pg-ratio-trigger" id="pg-ratio-trigger" aria-haspopup="listbox" aria-expanded="false">
              <span id="pg-ratio-value">1:1</span>
              <span class="pg-ratio-chevron" aria-hidden="true"></span>
            </button>
            <ul class="pg-ratio-menu" id="pg-ratio-menu" role="listbox" hidden></ul>
          </div>
        </label>
        <label class="pg-toggle-row" id="pg-img2img-row">
          <input id="pg-img2img" type="checkbox" checked />
          <span>参考原图（图生图）</span>
        </label>
        <div class="pg-ref-block" id="pg-ref-block">
          <div class="pg-ref-head">
            <span>参考图（最多 ${MAX_REFERENCE_IMAGES} 张，输入 @图1 引用）</span>
            <button class="pg-chip" id="pg-add-ref" type="button">添加参考图</button>
            <input id="pg-ref-file" type="file" accept="image/*" multiple hidden />
          </div>
          <div class="pg-ref-list" id="pg-ref-list"></div>
        </div>
        <div class="pg-actions pg-actions-fixed">
          <button class="pg-action pg-action-generate" id="pg-generate" type="button">立刻生图</button>
        </div>
      </div>

      <div class="pg-inline-preview" id="pg-inline-preview">
        <div class="pg-inline-stack" id="pg-inline-grid"></div>
      </div>
    </section>

    <p class="pg-credit">© 2026 xiaobo</p>
  </div>
`;

document.documentElement.append(hoverTrigger, panel);

const els = {
  previewImage: panel.querySelector("#pg-preview-image"),
  imageTitle: panel.querySelector("#pg-image-title"),
  imageUrl: panel.querySelector("#pg-image-url"),
  input: panel.querySelector("#pg-prompt-input"),
  status: panel.querySelector("#pg-status"),
  charCount: panel.querySelector("#pg-char-count"),
  analyze: panel.querySelector("#pg-analyze"),
  copy: panel.querySelector("#pg-copy"),
  generate: panel.querySelector("#pg-generate"),
  img2img: panel.querySelector("#pg-img2img"),
  img2imgRow: panel.querySelector("#pg-img2img-row"),
  refBlock: panel.querySelector("#pg-ref-block"),
  refList: panel.querySelector("#pg-ref-list"),
  addRef: panel.querySelector("#pg-add-ref"),
  refFile: panel.querySelector("#pg-ref-file"),
  atMenu: panel.querySelector("#pg-at-menu"),
  close: panel.querySelector("#pg-close"),
  pin: panel.querySelector("#pg-pin"),
  header: panel.querySelector(".pg-header"),
  openHistory: panel.querySelector("#pg-open-history"),
  openOptions: panel.querySelector("#pg-open-options"),
  detailShort: panel.querySelector("#pg-detail-short"),
  detailFull: panel.querySelector("#pg-detail-full"),
  toggleTranslation: panel.querySelector("#pg-toggle-translation"),
  toggleStructure: panel.querySelector("#pg-toggle-structure"),
  structure: panel.querySelector("#pg-structure"),
  structureGrid: panel.querySelector("#pg-structure-grid"),
  generateSection: panel.querySelector("#pg-generate-section"),
  ratioSelect: panel.querySelector("#pg-ratio-select"),
  ratioRoot: panel.querySelector("#pg-ratio-select-root"),
  ratioTrigger: panel.querySelector("#pg-ratio-trigger"),
  ratioValue: panel.querySelector("#pg-ratio-value"),
  ratioMenu: panel.querySelector("#pg-ratio-menu"),
  inlinePreview: panel.querySelector("#pg-inline-preview"),
  inlineGrid: panel.querySelector("#pg-inline-grid"),
  dropZone: panel.querySelector("#pg-drop-zone"),
  uploadImage: panel.querySelector("#pg-upload-image"),
  pasteImage: panel.querySelector("#pg-paste-image"),
  fileInput: panel.querySelector("#pg-file-input")
};

init();

async function init() {
  try {
    const response = await sendMessage({ type: "get-settings" });
    state.settings = response;
    state.panelData.detail = "full";
    state.panelData.aspectRatio = state.settings.aspectRatio || "1:1";
    renderRatioSelect();
    syncGenerationVisibility();
    syncPromptControls();
  } catch (error) {
    // 扩展刚注入时若上下文失效，仍绑定事件，后续操作会提示刷新
    console.info("[小波绘词]", error?.message || error);
  } finally {
    bindEvents();
    bindRuntimeMessages();
    renderReferenceImages();
    syncImg2ImgAvailability();
  }
}

function createEmptyPanelData() {
  return {
    title: "",
    detail: "full",
    language: "zh",
    aspectRatio: "1:1",
    prompts: {
      short: {
        en: "",
        zh: ""
      },
      full: {
        en: "",
        zh: ""
      }
    },
    structuredPrompt: null,
    analysis: null,
    structureOpen: false
  };
}

function bindEvents() {
  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("scroll", updateHoverButtonPosition, true);
  window.addEventListener("resize", updateHoverButtonPosition);

  hoverTrigger.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.hoverImage) return;
    try {
      await openPanelForImage(state.hoverImage);
    } catch (error) {
      handleRuntimeError(error);
    }
  });

  els.close.addEventListener("click", closePanel);
  els.pin?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePanelPin();
  });
  els.header?.addEventListener("pointerdown", handlePanelHeaderPointerDown);
  window.addEventListener("pointermove", handlePanelPointerMove);
  window.addEventListener("pointerup", handlePanelPointerUp);
  window.addEventListener("pointercancel", handlePanelPointerUp);
  window.addEventListener("resize", clampPinnedPanelPosition);
  els.openHistory?.addEventListener("click", async () => {
    try {
      await sendMessage({ type: "open-history" });
    } catch (error) {
      handleRuntimeError(error);
    }
  });
  els.openOptions.addEventListener("click", async () => {
    try {
      await sendMessage({ type: "open-options" });
    } catch (error) {
      handleRuntimeError(error);
    }
  });

  els.input.addEventListener("input", () => {
    state.panelData.prompts[state.panelData.detail][getCurrentLanguage()] = els.input.value;
    updateMeta();
    persistPanelImageCache();
  });

  els.detailShort.addEventListener("click", () => switchDetail("short"));
  els.detailFull.addEventListener("click", () => switchDetail("full"));
  els.toggleTranslation.addEventListener("click", togglePromptLanguage);
  els.toggleStructure.addEventListener("click", toggleStructureView);
  els.analyze.addEventListener("click", () => {
    if (!state.panelImage) {
      setStatus("请上传/粘贴图片，或点击网页图片进行识别。", "error");
      return;
    }
    analyzeCurrentImage({ force: true }).catch(handleRuntimeError);
  });

  els.uploadImage?.addEventListener("click", () => {
    els.fileInput?.click();
  });

  els.fileInput?.addEventListener("change", async () => {
    const files = Array.from(els.fileInput.files || []);
    els.fileInput.value = "";
    if (!files.length) return;
    try {
      await loadLocalImageFiles(files, { autoAnalyze: false });
    } catch (error) {
      handleRuntimeError(error);
    }
  });

  els.pasteImage?.addEventListener("click", () => {
    pasteImageFromClipboard().catch(handleRuntimeError);
  });

  panel.addEventListener("paste", (event) => {
    if (!state.panelOpen) return;
    const files = getImageFilesFromClipboardEvent(event);
    if (!files.length) return;
    event.preventDefault();
    loadLocalImageFiles(files, { autoAnalyze: false }).catch(handleRuntimeError);
  });

  els.dropZone?.addEventListener("dragenter", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragover");
  });
  els.dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragover");
  });
  els.dropZone?.addEventListener("dragleave", (event) => {
    if (event.target === els.dropZone) {
      els.dropZone.classList.remove("is-dragover");
    }
  });
  els.dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragover");
    const files = getImageFilesFromDataTransfer(event.dataTransfer);
    if (!files.length) {
      setStatus("请拖入图片文件。", "error");
      return;
    }
    loadLocalImageFiles(files, { autoAnalyze: false }).catch(handleRuntimeError);
  });

  els.ratioSelect.addEventListener("change", () => {
    state.panelData.aspectRatio = els.ratioSelect.value;
    syncRatioSelectUI();
    persistPanelImageCache();
    setStatus(`生图比例已切换为 ${state.panelData.aspectRatio}`);
  });

  els.ratioTrigger?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleRatioMenu();
  });

  els.ratioMenu?.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    const nextValue = option.dataset.value;
    if (!nextValue) return;
    els.ratioSelect.value = nextValue;
    els.ratioSelect.dispatchEvent(new Event("change", { bubbles: true }));
    closeRatioMenu();
  });

  document.addEventListener("click", (event) => {
    if (!els.ratioRoot?.contains(event.target)) closeRatioMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRatioMenu();
  });

  els.copy.addEventListener("click", async () => {
    const text = getCurrentPrompt().trim();
    if (!text) {
      setStatus("没有可复制的提示词。", "error");
      return;
    }
    await navigator.clipboard.writeText(text);
    setStatus("提示词已复制。", "success");
  });

  els.generate.addEventListener("click", () => {
    generateFromCurrentPrompt().catch(handleRuntimeError);
  });
  els.img2img?.addEventListener("change", () => {
    if (els.img2img) els.img2img.dataset.userTouched = "1";
    syncImg2ImgAvailability();
  });
  els.addRef?.addEventListener("click", () => els.refFile?.click());
  els.refFile?.addEventListener("change", async () => {
    const files = Array.from(els.refFile.files || []);
    els.refFile.value = "";
    for (const file of files) {
      try {
        await addReferenceImageFromFile(file);
      } catch (error) {
        handleRuntimeError(error);
      }
    }
  });
  els.refList?.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-role='remove-ref']");
    if (!removeBtn) return;
    removeReferenceImage(Number(removeBtn.dataset.index));
  });
  els.input?.addEventListener("input", handlePromptInputForAtMention);
  els.input?.addEventListener("keydown", handlePromptKeydownForAtMention);
  els.atMenu?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-role='at-option']");
    if (!option) return;
    insertAtMention(option.dataset.label || "");
  });
  document.addEventListener("click", (event) => {
    if (!els.atMenu || els.atMenu.classList.contains("pg-hidden")) return;
    if (els.atMenu.contains(event.target) || els.input?.contains(event.target)) return;
    hideAtMenu();
  });
  els.inlineGrid.addEventListener("click", handleInlinePreviewClick);
}

function renderRatioSelect() {
  const current = state.panelData.aspectRatio || "1:1";
  els.ratioSelect.innerHTML = RATIO_OPTIONS.map((ratio) => {
    const selected = ratio === current ? " selected" : "";
    return `<option value="${ratio}"${selected}>${ratio}</option>`;
  }).join("");

  if (els.ratioMenu) {
    els.ratioMenu.innerHTML = RATIO_OPTIONS.map(
      (ratio) =>
        `<li role="option" data-value="${ratio}" aria-selected="${ratio === current ? "true" : "false"}">${ratio}</li>`
    ).join("");
  }

  syncRatioSelectUI();
}

function syncRatioSelectUI() {
  const value = els.ratioSelect?.value || "1:1";
  if (els.ratioValue) els.ratioValue.textContent = value;
  els.ratioMenu?.querySelectorAll('[role="option"]').forEach((item) => {
    item.setAttribute("aria-selected", item.dataset.value === value ? "true" : "false");
  });
}

function toggleRatioMenu() {
  if (!els.ratioMenu || !els.ratioRoot || !els.ratioTrigger) return;
  if (els.ratioMenu.hidden) {
    els.ratioMenu.hidden = false;
    els.ratioTrigger.setAttribute("aria-expanded", "true");
    els.ratioRoot.classList.add("is-open");
  } else {
    closeRatioMenu();
  }
}

function closeRatioMenu() {
  if (!els.ratioMenu || !els.ratioRoot || !els.ratioTrigger) return;
  els.ratioMenu.hidden = true;
  els.ratioTrigger.setAttribute("aria-expanded", "false");
  els.ratioRoot.classList.remove("is-open");
}
function handleInlinePreviewClick(event) {
  const action = event.target.closest("[data-role]");
  if (!action) return;

  const role = action.dataset.role;
  const index = Number(action.dataset.index);
  if (!Number.isFinite(index)) return;

  const src = getImageDataUrl(index);
  if (!src) return;

  if (role === "download") {
    triggerDownload(src, `image-lens-${index + 1}.png`);
    return;
  }

  if (role === "viewer") {
    const image = state.currentJob?.images?.[index];
    sendMessage({
      type: "open-viewer",
      payload: {
        prompt: getCurrentPrompt().trim(),
        images: image ? [image] : []
      }
    }).catch((error) => {
      setStatus(error.message || "打开新页面失败。", "error");
    });
  }
}

function handlePointerMove(event) {
  // 面板打开时隐藏网页悬停按钮，避免挡操作
  if (state.panelOpen) {
    clearHoverHideTimer();
    hoverTrigger.style.display = "none";
    return;
  }

  // 鼠标在悬停按钮上时保持显示，避免闪烁消失
  if (event.target === hoverTrigger || hoverTrigger.contains(event.target)) {
    clearHoverHideTimer();
    return;
  }

  const image = event.target instanceof Element ? findEligibleImage(event.target) : null;
  if (!image) {
    scheduleHideHoverButton();
    return;
  }

  // 忽略我们自己注入的图标图片
  if (image.classList?.contains("pg-hover-icon") || panel.contains(image)) {
    scheduleHideHoverButton();
    return;
  }

  clearHoverHideTimer();
  state.hoverImage = image;
  updateHoverButtonPosition();
}

function findEligibleImage(startNode) {
  const image = startNode.closest?.("img");
  if (!image || image === hoverTrigger.querySelector("img")) return null;
  if (image.classList.contains("pg-hover-icon")) return null;
  if (panel.contains(image)) return null;

  const rect = image.getBoundingClientRect();
  const src = image.currentSrc || image.src;
  if (!src || rect.width < 96 || rect.height < 96) return null;
  return image;
}

function updateHoverButtonPosition() {
  if (state.panelOpen) {
    hoverTrigger.style.display = "none";
    return;
  }

  if (!state.hoverImage || !document.documentElement.contains(state.hoverImage)) {
    hideHoverButton();
    return;
  }

  const rect = state.hoverImage.getBoundingClientRect();
  if (rect.width < 96 || rect.height < 96 || rect.bottom < 0 || rect.top > window.innerHeight) {
    hideHoverButton();
    return;
  }

  const top = Math.min(Math.max(10, rect.top + 8), window.innerHeight - 44);
  const left = Math.min(Math.max(10, rect.left + 8), window.innerWidth - 44);

  hoverTrigger.style.display = "flex";
  hoverTrigger.style.top = `${top}px`;
  hoverTrigger.style.left = `${left}px`;
}

function scheduleHideHoverButton() {
  clearHoverHideTimer();
  hoverHideTimer = setTimeout(() => {
    if (hoverTrigger.matches(":hover")) return;
    hideHoverButton();
  }, 160);
}

function clearHoverHideTimer() {
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
}

function hideHoverButton() {
  clearHoverHideTimer();
  state.hoverImage = null;
  hoverTrigger.style.display = "none";
}

function bindRuntimeMessages() {
  if (!chrome?.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "open-panel") return undefined;

    openBlankPanel()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({ ok: false, error: error?.message || "打开面板失败。" });
      });
    return true;
  });
}

async function openBlankPanel() {
  hideHoverButton();
  state.panelImage = null;
  state.panelOpen = true;
  state.currentJob = null;
  state.historyId = null;
  if (els.img2img) delete els.img2img.dataset.userTouched;
  clearReferenceImages();
  panel.classList.add("pg-open");

  els.previewImage.src = DEFAULT_PREVIEW_LOGO;
  els.previewImage.alt = "小波绘词";
  els.previewImage.classList.add("is-logo");
  els.imageTitle.textContent = "直接生图";
  els.imageUrl.textContent = "输入提示词后即可生成，无需先识别图片";
  els.imageUrl.title = "";
  renderInlineImages([]);

  try {
    state.settings = await sendMessage({ type: "get-settings" });
  } catch (error) {
    handleRuntimeError(error);
  }

  state.panelData = createEmptyPanelData();
  state.panelData.detail = "full";
  state.panelData.title = "直接生图";
  state.panelData.aspectRatio = state.settings?.aspectRatio || "1:1";
  renderRatioSelect();
  syncGenerationVisibility();
  syncPromptControls();
  syncAnalyzeAvailability();
  setStatus("可直接输入提示词生图，也可上传/粘贴图片后识别；图生图可添加多张参考并用 @图1 引用。");
  els.input?.focus();
}

async function openPanelForImage(image) {
  hideHoverButton();
  state.panelImage = image;
  state.panelOpen = true;
  panel.classList.add("pg-open");

  const imageUrl = image?.currentSrc || image?.src || "";
  const title = image?.alt?.trim() || "网页图片";
  els.previewImage.src = imageUrl;
  els.previewImage.alt = title;
  els.previewImage.classList.remove("is-logo");
  els.imageTitle.textContent = title;
  els.imageUrl.textContent = imageUrl || "等待选择图片";
  els.imageUrl.title = imageUrl || "";

  try {
    state.settings = await sendMessage({ type: "get-settings" });
  } catch (error) {
    handleRuntimeError(error);
    return;
  }

  await addWebpageImageAsReference(image);

  els.imageUrl.textContent = imageUrl
    ? `${truncateMiddle(imageUrl, 42)} · 参考 ${state.referenceImages.length}/${MAX_REFERENCE_IMAGES}`
    : `参考 ${state.referenceImages.length}/${MAX_REFERENCE_IMAGES}`;

  const hasPrompt = Boolean(getCurrentPrompt().trim());
  const cached = imageCache.get(imageUrl);

  if (cached && !hasPrompt) {
    hydratePanelData(cached);
    syncAnalyzeAvailability();
    setStatus("已载入网页图片（使用缓存提示词）。可继续添加参考图，确认后点「重新识别」。");
    return;
  }

  if (!hasPrompt) {
    state.currentJob = null;
    state.historyId = null;
    state.panelData = createEmptyPanelData();
    state.panelData.detail = "full";
    state.panelData.aspectRatio = state.settings?.aspectRatio || "1:1";
    renderRatioSelect();
    syncGenerationVisibility();
    syncPromptControls();
  }

  syncAnalyzeAvailability();
  setStatus(
    `已载入网页图片，参考图 ${state.referenceImages.length}/${MAX_REFERENCE_IMAGES}。可继续点选/上传/粘贴，确认后点「重新识别」。`
  );
}

async function addWebpageImageAsReference(image) {
  if (state.referenceImages.length >= MAX_REFERENCE_IMAGES) {
    setStatus(`参考图已满（最多 ${MAX_REFERENCE_IMAGES} 张），请先删除后再添加。`, "error");
    return;
  }

  const src = String(image?.currentSrc || image?.src || "").trim();
  let dataUrl = "";

  if (src.startsWith("data:image/")) {
    dataUrl = src;
  } else {
    try {
      dataUrl = await captureImageDataUrl(image);
    } catch (_error) {
      dataUrl = "";
    }
  }

  if (!dataUrl && /^https?:\/\//i.test(src)) {
    try {
      const result = await sendMessage({
        type: "resolve-image-preview",
        payload: {
          imageUrl: src,
          pageUrl: location.href
        }
      });
      dataUrl = String(result?.dataUrl || "");
    } catch (_error) {
      dataUrl = "";
    }
  }

  if (dataUrl.startsWith("data:image/")) {
    await addReferenceImageFromDataUrl(dataUrl, { prepend: false, silent: true });
    return;
  }

  await syncMainImageIntoReferences();
}

async function loadLocalImageFile(file, { autoAnalyze = false } = {}) {
  await loadLocalImageFiles(file ? [file] : [], { autoAnalyze });
}

async function loadLocalImageFiles(files, { autoAnalyze = false } = {}) {
  const list = Array.from(files || []).filter((file) => String(file.type || "").startsWith("image/"));
  if (!list.length) {
    throw new Error("请选择图片文件。");
  }

  if (state.referenceImages.length >= MAX_REFERENCE_IMAGES) {
    throw new Error(`参考图已满（最多 ${MAX_REFERENCE_IMAGES} 张），请先删除后再添加。`);
  }

  const remaining = MAX_REFERENCE_IMAGES - state.referenceImages.length;
  const accepted = list.slice(0, remaining);
  const skipped = list.length - accepted.length;
  let lastDataUrl = "";
  let lastTitle = "";
  let added = 0;

  for (const file of accepted) {
    const dataUrl = await readFileAsDataUrl(file);
    const before = state.referenceImages.length;
    await addReferenceImageFromDataUrl(dataUrl, { prepend: false, silent: true });
    if (state.referenceImages.length > before) {
      added += 1;
      lastDataUrl = dataUrl;
      lastTitle = file.name || `本地图片 ${state.referenceImages.length}`;
    }
  }

  if (!added) {
    setStatus("这些图片已在参考图中，未重复添加。");
    return;
  }

  await setMainPanelFromLocalImage(lastDataUrl, lastTitle, { autoAnalyze });

  const label = `@图${state.referenceImages.length}`;
  let message = added === 1
    ? `已添加参考图 ${label}（${state.referenceImages.length}/${MAX_REFERENCE_IMAGES}）`
    : `已添加 ${added} 张参考图（${state.referenceImages.length}/${MAX_REFERENCE_IMAGES}），最新为 ${label}`;
  if (skipped > 0) {
    message += `；另有 ${skipped} 张因已达上限未加入`;
  }
  setStatus(`${message}。可点击「重新识别」识图，或在提示词中用 @图N 引用。`, "success");
}

async function setMainPanelFromLocalImage(dataUrl, title = "本地图片", { autoAnalyze = false } = {}) {
  if (!String(dataUrl || "").startsWith("data:image/")) {
    throw new Error("无法读取图片数据。");
  }

  const image = await createImageFromDataUrl(dataUrl, title);
  hideHoverButton();
  state.panelImage = image;
  state.panelOpen = true;
  panel.classList.add("pg-open");

  els.previewImage.src = dataUrl;
  els.previewImage.alt = title;
  els.previewImage.classList.remove("is-logo");
  els.imageTitle.textContent = title;
  els.imageUrl.textContent = `本地/粘贴图片 · 参考 ${state.referenceImages.length}/${MAX_REFERENCE_IMAGES}`;
  els.imageUrl.title = title;

  try {
    state.settings = await sendMessage({ type: "get-settings" });
  } catch (error) {
    handleRuntimeError(error);
  }

  const cached = imageCache.get(dataUrl);
  if (cached) {
    hydratePanelData(cached);
    syncAnalyzeAvailability();
    return;
  }

  const hasPrompt = Boolean(getCurrentPrompt().trim());
  if (!hasPrompt) {
    state.currentJob = null;
    state.historyId = null;
    state.panelData = createEmptyPanelData();
    state.panelData.detail = "full";
    state.panelData.title = title.slice(0, 40) || "本地图片";
    state.panelData.aspectRatio = state.settings?.aspectRatio || "1:1";
    renderRatioSelect();
    syncGenerationVisibility();
    syncPromptControls();
  } else {
    state.panelData.title = title.slice(0, 40) || state.panelData.title || "本地图片";
  }

  syncAnalyzeAvailability();

  if (autoAnalyze) {
    await analyzeCurrentImage({ force: true });
  }
}

async function applyLocalImageDataUrl(dataUrl, title = "本地图片", { autoAnalyze = false } = {}) {
  if (state.referenceImages.length >= MAX_REFERENCE_IMAGES) {
    throw new Error(`参考图已满（最多 ${MAX_REFERENCE_IMAGES} 张），请先删除后再添加。`);
  }
  await addReferenceImageFromDataUrl(dataUrl, { prepend: false, silent: true });
  await setMainPanelFromLocalImage(dataUrl, title, { autoAnalyze });
  setStatus(
    `已添加参考图 @图${state.referenceImages.length}（${state.referenceImages.length}/${MAX_REFERENCE_IMAGES}）。`,
    "success"
  );
}

function createImageFromDataUrl(dataUrl, alt = "本地图片") {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.alt = alt;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败，请换一张再试。"));
    image.src = dataUrl;
  });
}

async function pasteImageFromClipboard() {
  if (!navigator.clipboard?.read) {
    setStatus("当前环境不支持读取剪贴板，请使用 Ctrl+V 粘贴到面板。", "error");
    return;
  }

  try {
    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      files.push(
        new File([blob], `paste-${Date.now()}-${files.length + 1}.png`, {
          type: blob.type || "image/png"
        })
      );
    }
    if (!files.length) {
      setStatus("剪贴板里没有图片，请先复制图片后再粘贴。", "error");
      return;
    }
    await loadLocalImageFiles(files, { autoAnalyze: false });
  } catch (error) {
    const message = String(error?.message || error || "");
    if (/denied|permission|not allowed/i.test(message)) {
      setStatus("未获得剪贴板权限，请点击面板后按 Ctrl+V 粘贴图片。", "error");
      return;
    }
    throw error;
  }
}

function getImageFilesFromClipboardEvent(event) {
  const files = [];
  const items = Array.from(event.clipboardData?.items || []);
  for (const item of items) {
    if (item.kind === "file" && String(item.type || "").startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length) return files;
  return getImageFilesFromDataTransfer(event.clipboardData);
}

function getImageFileFromClipboardEvent(event) {
  return getImageFilesFromClipboardEvent(event)[0] || null;
}

function getImageFilesFromDataTransfer(dataTransfer) {
  const files = Array.from(dataTransfer?.files || []).filter((file) =>
    String(file.type || "").startsWith("image/")
  );
  return files;
}

function getImageFileFromDataTransfer(dataTransfer) {
  return getImageFilesFromDataTransfer(dataTransfer)[0] || null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取本地图片失败。"));
    reader.readAsDataURL(file);
  });
}

function closePanel() {
  state.panelOpen = false;
  stopPanelDrag();
  panel.classList.remove("pg-open");
}

function togglePanelPin() {
  state.panelPinned = !state.panelPinned;
  if (state.panelPinned) {
    ensurePanelDragPosition();
    panel.classList.add("is-pinned");
    setStatus("已置顶：拖动标题栏可单独移动面板，页面仍可正常操作。");
  } else {
    stopPanelDrag();
    resetPanelDockPosition();
    panel.classList.remove("is-pinned");
    setStatus("已取消置顶，面板回到右上角。");
  }
  syncPanelPinUI();
}

function syncPanelPinUI() {
  if (!els.pin) return;
  els.pin.classList.toggle("is-active", state.panelPinned);
  els.pin.setAttribute("aria-pressed", state.panelPinned ? "true" : "false");
  els.pin.title = state.panelPinned ? "取消置顶" : "置顶后可拖动面板";
  els.header?.classList.toggle("is-draggable", state.panelPinned);
}

function ensurePanelDragPosition() {
  const rect = panel.getBoundingClientRect();
  panel.style.left = `${Math.round(rect.left)}px`;
  panel.style.top = `${Math.round(rect.top)}px`;
  panel.style.right = "auto";
  clampPinnedPanelPosition();
}

function resetPanelDockPosition() {
  panel.style.left = "";
  panel.style.top = "";
  panel.style.right = "";
}

function clampPinnedPanelPosition() {
  if (!state.panelPinned || !state.panelOpen) return;
  const rect = panel.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const nextLeft = Math.min(maxLeft, Math.max(margin, rect.left));
  const nextTop = Math.min(maxTop, Math.max(margin, rect.top));
  panel.style.left = `${Math.round(nextLeft)}px`;
  panel.style.top = `${Math.round(nextTop)}px`;
  panel.style.right = "auto";
}

function handlePanelHeaderPointerDown(event) {
  if (!state.panelPinned || !state.panelOpen) return;
  if (event.button !== 0) return;
  if (event.target.closest("button, a, input, textarea, select, label")) return;

  const rect = panel.getBoundingClientRect();
  state.panelDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  panel.classList.add("is-dragging");
  els.header?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function handlePanelPointerMove(event) {
  if (!state.panelDrag || event.pointerId !== state.panelDrag.pointerId) return;
  const width = panel.offsetWidth || 360;
  const height = panel.offsetHeight || 200;
  const margin = 8;
  const left = Math.min(
    Math.max(margin, event.clientX - state.panelDrag.offsetX),
    Math.max(margin, window.innerWidth - width - margin)
  );
  const top = Math.min(
    Math.max(margin, event.clientY - state.panelDrag.offsetY),
    Math.max(margin, window.innerHeight - height - margin)
  );
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.right = "auto";
}

function handlePanelPointerUp(event) {
  if (!state.panelDrag) return;
  if (event?.pointerId !== undefined && event.pointerId !== state.panelDrag.pointerId) return;
  stopPanelDrag();
}

function stopPanelDrag() {
  state.panelDrag = null;
  panel.classList.remove("is-dragging");
}

async function analyzeCurrentImage({ force }) {
  if (!state.panelImage) return;

  const imageUrl = state.panelImage.currentSrc || state.panelImage.src;
  if (!imageUrl) return;

  if (!force && imageCache.has(imageUrl)) {
    hydratePanelData(imageCache.get(imageUrl));
    return;
  }

  await runAction("analyze", "正在识别图片内容...", async () => {
    const imageDataUrl = imageUrl.startsWith("data:")
      ? imageUrl
      : await captureImageDataUrl(state.panelImage);
    const screenshotCrop = imageUrl.startsWith("data:")
      ? null
      : getImageViewportCrop(state.panelImage);
    const result = await sendMessage({
      type: "analyze-image",
      payload: {
        imageUrl: imageUrl.startsWith("data:") ? "" : imageUrl,
        imageDataUrl,
        screenshotCrop,
        pageUrl: location.href,
        alt: state.panelImage.alt || ""
      }
    });

    const cacheKey = imageUrl;
    const cached = {
      title: result.title || "图片提示词",
      detail: state.panelData.detail || "full",
      language: state.panelData.language || "zh",
      aspectRatio: state.panelData.aspectRatio || state.settings?.aspectRatio || "1:1",
      structuredPrompt: result.structuredPrompt || null,
      analysis: result.analysis || null,
      structureOpen: state.panelData.structureOpen || false,
      prompts: {
        short: {
          en: result.enPromptShort || "",
          zh: result.zhPromptShort || ""
        },
        full: {
          en: result.enPromptFull || "",
          zh: result.zhPromptFull || ""
        }
      }
    };

    imageCache.set(cacheKey, cached);
    hydratePanelData(cached);
    await persistHistoryAfterAnalyze(
      imageUrl.startsWith("data:") ? "local-image" : imageUrl,
      imageDataUrl
    );
    setStatus("识别完成，已保存到历史。", "success");
  });
}

function switchDetail(detail) {
  state.panelData.detail = detail;
  syncPromptControls();
}

function togglePromptLanguage() {
  const current = state.panelData.language || "zh";
  state.panelData.language = current === "en" ? "zh" : "en";
  syncPromptControls();
  renderStructureView();
  persistPanelImageCache();
}

function hydratePanelData(data) {
  state.panelData = {
    title: data.title || "图片提示词",
    detail: data.detail || "full",
    language: data.language || data.languageByDetail?.[data.detail || "full"] || "zh",
    aspectRatio: data.aspectRatio || state.settings?.aspectRatio || "1:1",
    structuredPrompt: data.structuredPrompt || null,
    analysis: data.analysis || null,
    structureOpen: Boolean(data.structureOpen),
    prompts: {
      short: normalizePromptPair(data.prompts?.short),
      full: normalizePromptPair(data.prompts?.full)
    }
  };

  els.imageTitle.textContent = state.panelData.title || "图片提示词";
  renderRatioSelect();
  syncGenerationVisibility();
  syncPromptControls();
  renderStructureView();
  syncAnalyzeAvailability();
  setStatus("识别完成，可直接编辑。", "success");
}

function syncPromptControls() {
  els.detailShort.classList.toggle("is-active", state.panelData.detail === "short");
  els.detailFull.classList.toggle("is-active", state.panelData.detail === "full");
  els.toggleTranslation.textContent = getCurrentLanguage() === "zh" ? "查看英文" : "查看中文";
  els.toggleStructure.textContent = state.panelData.structureOpen ? "隐藏结构" : "查看结构";
  els.toggleStructure.classList.toggle("is-active", state.panelData.structureOpen);
  els.input.value = getCurrentPrompt();
  updateMeta();
}

function toggleStructureView() {
  state.panelData.structureOpen = !state.panelData.structureOpen;
  syncPromptControls();
  renderStructureView();
  persistPanelImageCache();
}

function getCurrentPrompt() {
  const detail = state.panelData.detail;
  const language = getCurrentLanguage();
  return state.panelData.prompts[detail]?.[language] || "";
}

function getCurrentLanguage() {
  return state.panelData.language || "zh";
}

function normalizePromptPair(value) {
  if (value && typeof value === "object") {
    return {
      en: String(value.en || "").trim(),
      zh: String(value.zh || "").trim()
    };
  }

  return {
    en: "",
    zh: String(value || "").trim()
  };
}

function renderStructureView() {
  const entries = getStructureEntries();
  const visible = state.panelData.structureOpen && entries.length > 0;
  els.structure.classList.toggle("pg-hidden", !visible);

  if (!visible) {
    els.structureGrid.innerHTML = "";
    return;
  }

  els.structureGrid.innerHTML = entries
    .map(
      (entry) => `
        <div class="pg-structure-row">
          <span class="pg-structure-label">${escapeHtml(entry.label)}</span>
          <p class="pg-structure-value">${escapeHtml(entry.value)}</p>
        </div>
      `
    )
    .join("");
}

function getStructureEntries() {
  const language = getCurrentLanguage();
  const prompt = language === "en" ? state.panelData.structuredPrompt?.enFull : state.panelData.structuredPrompt?.zhFull;
  const entries = parseStructuredPrompt(prompt);
  if (entries.length >= 6 && (language === "en" || entriesHaveChinese(entries))) return orderStructureEntries(entries);

  const fullPrompt = state.panelData.prompts.full?.[language] || "";
  const labeledEntries = parseStructuredPrompt(fullPrompt);
  if (labeledEntries.length >= 6 && (language === "en" || entriesHaveChinese(labeledEntries))) {
    return orderStructureEntries(labeledEntries);
  }

  const analysisEntries = buildStructureEntriesFromAnalysis(state.panelData.analysis);
  if (language === "zh" && !entriesHaveChinese(analysisEntries)) return [];
  return analysisEntries;
}

function parseStructuredPrompt(prompt) {
  return String(prompt || "")
    .split(/[;；]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
      if (!match) return null;

      const label = normalizeStructureLabel(match[1]);
      const value = match[2].trim();
      return label && value ? { label, value } : null;
    })
    .filter(Boolean);
}

function normalizeStructureLabel(label) {
  const rawLabel = String(label || "").trim();
  const normalized = rawLabel.toLowerCase().replace(/\s+/g, "");

  if (/^subject|主体/.test(normalized)) return "主体";
  if (/^style|风格/.test(normalized)) return "风格";
  if (/^lighting|光线|光影/.test(normalized)) return "光线";
  if (/^camera|镜头/.test(normalized)) return "镜头";
  if (/^environment|环境/.test(normalized)) return "环境";
  if (/^material|材质/.test(normalized)) return "材质";
  if (/^composition|构图/.test(normalized)) return "构图";
  if (/^rendering|渲染/.test(normalized)) return "渲染";
  return "";
}

function orderStructureEntries(entries) {
  const labelOrder = ["主体", "风格", "光线", "镜头", "环境", "材质", "构图", "渲染"];
  const entryMap = new Map();

  for (const entry of entries) {
    if (!entryMap.has(entry.label)) entryMap.set(entry.label, entry);
  }

  return labelOrder.map((label) => entryMap.get(label)).filter(Boolean);
}

function entriesHaveChinese(entries) {
  return entries.some((entry) => /[\u4e00-\u9fff]/.test(entry.value));
}

function buildStructureEntriesFromAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return [];

  const rows = [
    ["主体", joinValues([analysis.subject?.main, ...(analysis.subject?.attributes || []), analysis.subject?.action])],
    ["风格", joinValues([analysis.style?.medium, analysis.style?.genre, analysis.style?.mood, analysis.style?.referenceLook])],
    ["光线", joinValues([analysis.lighting?.direction, analysis.lighting?.quality, analysis.lighting?.effect, analysis.lighting?.timeOfDay])],
    ["镜头", joinValues([analysis.camera?.focalLength, analysis.camera?.aperture, analysis.camera?.angle, analysis.camera?.shotType, analysis.camera?.depthOfField])],
    ["环境", joinValues([analysis.environment?.sceneType, analysis.environment?.backgroundMaterial, analysis.environment?.spatialRelation])],
    ["材质", joinValues([analysis.material?.surface, analysis.material?.microDetail, ...(analysis.material?.opticalProperties || [])])],
    ["构图", joinValues([analysis.composition?.layout, analysis.composition?.subjectPlacement, analysis.composition?.foreground, analysis.composition?.background, analysis.composition?.leadingLines, analysis.composition?.symmetry])],
    ["渲染", joinValues([analysis.rendering?.colorGrade, ...(analysis.rendering?.deviceLook || []), ...(analysis.rendering?.priorityTerms || [])])]
  ];

  return rows
    .map(([label, value]) => ({ label, value }))
    .filter((entry) => entry.value);
}

function joinValues(values) {
  return values.filter(Boolean).join("，");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function generateFromCurrentPrompt() {
  if (!state.settings?.imageGenerationEnabled) {
    setStatus("生图功能当前已关闭。", "error");
    return;
  }

  const prompt = getCurrentPrompt().trim();
  if (!prompt) {
    setStatus("请先识别或输入提示词。", "error");
    return;
  }

  await syncMainImageIntoReferences();
  const mentionedIndexes = parseAtImageIndexes(prompt);
  const hasAtMentions = mentionedIndexes.length > 0;
  const useReferenceImage = Boolean(els.img2img?.checked) || hasAtMentions;
  const referenceImages = resolveReferenceImagesForPrompt(prompt, useReferenceImage);
  const referenceImageDataUrls = referenceImages.map((item) => item.dataUrl).filter(Boolean);

  if (useReferenceImage && referenceImageDataUrls.length === 0) {
    setStatus("请先添加参考图，或在提示词中用 @图1 引用，或关闭「参考原图」。", "error");
    return;
  }

  if (hasAtMentions && mentionedIndexes.some((index) => index < 1 || index > state.referenceImages.length)) {
    setStatus(`@ 引用超出范围，当前只有 ${state.referenceImages.length} 张参考图。`, "error");
    return;
  }

  const statusText = useReferenceImage
    ? `正在按 ${referenceImageDataUrls.length} 张参考图 + 提示词生成...`
    : "正在生图，结果会显示在当前弹窗...";

  await runAction("generate", statusText, async () => {
    const result = await sendMessage({
      type: "generate-image",
      payload: {
        prompt,
        aspectRatio: state.panelData.aspectRatio || state.settings?.aspectRatio || "1:1",
        count: state.settings?.imageCount || 1,
        openViewer: false,
        useReferenceImage,
        referenceImageDataUrl: referenceImageDataUrls[0] || "",
        referenceImageDataUrls
      }
    });

    state.currentJob = {
      images: result.images || []
    };

    renderInlineImages(state.currentJob.images);
    await persistHistoryAfterGenerate();
    setStatus(
      useReferenceImage
        ? `图生图完成（${referenceImageDataUrls.length} 张参考），已保存到历史。`
        : "生图完成，预览已更新，已保存到历史。",
      "success"
    );
  });
}

function canUseReferenceImage() {
  return state.referenceImages.length > 0 || hasUsablePanelImage();
}

function hasUsablePanelImage() {
  if (!(state.panelImage instanceof HTMLImageElement)) return false;
  const src = String(state.panelImage.currentSrc || state.panelImage.src || "");
  if (!src) return false;
  if (els.previewImage?.classList.contains("is-logo")) return false;
  if (src.includes("/icons/icon-")) return false;
  return true;
}

async function getReferenceImageDataUrl() {
  if (!state.panelImage) return "";
  const src = String(state.panelImage.currentSrc || state.panelImage.src || "");
  if (src.startsWith("data:image/")) return src;
  if (els.previewImage?.src?.startsWith("data:image/")) return els.previewImage.src;
  return captureImageDataUrl(state.panelImage);
}

function parseAtImageIndexes(prompt) {
  const indexes = [];
  const matcher = /@图\s*(\d+)/g;
  let match = matcher.exec(String(prompt || ""));
  while (match) {
    indexes.push(Number(match[1]));
    match = matcher.exec(String(prompt || ""));
  }
  return Array.from(new Set(indexes));
}

function resolveReferenceImagesForPrompt(prompt, useReferenceImage) {
  const mentioned = parseAtImageIndexes(prompt);
  if (mentioned.length > 0) {
    return mentioned
      .map((index) => state.referenceImages[index - 1])
      .filter((item) => item?.dataUrl);
  }
  if (!useReferenceImage) return [];
  return state.referenceImages.filter((item) => item?.dataUrl);
}

async function syncMainImageIntoReferences() {
  if (!hasUsablePanelImage()) return;
  const dataUrl = await getReferenceImageDataUrl();
  if (!dataUrl) return;
  const exists = state.referenceImages.some((item) => item.dataUrl === dataUrl);
  if (exists) return;
  if (state.referenceImages.length >= MAX_REFERENCE_IMAGES) return;
  state.referenceImages.unshift({
    id: crypto.randomUUID(),
    label: "",
    dataUrl
  });
  relabelReferenceImages();
  renderReferenceImages();
}

async function addReferenceImageFromFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }
  if (state.referenceImages.length >= MAX_REFERENCE_IMAGES) {
    throw new Error(`最多添加 ${MAX_REFERENCE_IMAGES} 张参考图。`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  state.referenceImages.push({
    id: crypto.randomUUID(),
    label: "",
    dataUrl
  });
  relabelReferenceImages();
  renderReferenceImages();
  if (els.img2img && !els.img2img.disabled) {
    els.img2img.checked = true;
  }
  syncImg2ImgAvailability();
  setStatus(`已添加参考图，可用 @图${state.referenceImages.length} 引用。`);
}

async function addReferenceImageFromDataUrl(dataUrl, { prepend = false, silent = false } = {}) {
  if (!String(dataUrl || "").startsWith("data:image/")) return false;
  if (state.referenceImages.some((item) => item.dataUrl === dataUrl)) {
    renderReferenceImages();
    syncImg2ImgAvailability();
    return false;
  }
  if (state.referenceImages.length >= MAX_REFERENCE_IMAGES) {
    if (prepend) {
      state.referenceImages.pop();
    } else {
      throw new Error(`最多添加 ${MAX_REFERENCE_IMAGES} 张参考图。`);
    }
  }
  const item = { id: crypto.randomUUID(), label: "", dataUrl };
  if (prepend) state.referenceImages.unshift(item);
  else state.referenceImages.push(item);
  relabelReferenceImages();
  renderReferenceImages();
  if (els.img2img && !els.img2img.disabled) {
    els.img2img.checked = true;
  }
  syncImg2ImgAvailability();
  if (!silent) {
    setStatus(`已添加参考图，可用 @图${state.referenceImages.length} 引用。`);
  }
  return true;
}

function removeReferenceImage(index) {
  if (index < 0 || index >= state.referenceImages.length) return;
  state.referenceImages.splice(index, 1);
  relabelReferenceImages();
  renderReferenceImages();
  syncImg2ImgAvailability();
}

function relabelReferenceImages() {
  state.referenceImages = state.referenceImages.map((item, index) => ({
    ...item,
    label: `图${index + 1}`
  }));
}

function clearReferenceImages() {
  state.referenceImages = [];
  renderReferenceImages();
  hideAtMenu();
  syncImg2ImgAvailability();
}

function renderReferenceImages() {
  if (!els.refList) return;
  if (state.referenceImages.length === 0) {
    els.refList.innerHTML = `<p class="pg-ref-empty">暂无参考图，可点击「添加参考图」或上传/粘贴图片</p>`;
    return;
  }

  els.refList.innerHTML = state.referenceImages
    .map(
      (item, index) => `
      <article class="pg-ref-card" title="在提示词中输入 @${escapeHtml(item.label)}">
        <img src="${escapeAttr(item.dataUrl)}" alt="${escapeHtml(item.label)}" />
        <span class="pg-ref-label">@${escapeHtml(item.label)}</span>
        <button type="button" class="pg-ref-remove" data-role="remove-ref" data-index="${index}" aria-label="移除${escapeHtml(item.label)}">×</button>
      </article>
    `
    )
    .join("");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, "&#96;");
}

function handlePromptInputForAtMention() {
  const cursor = els.input?.selectionStart ?? 0;
  const value = els.input?.value || "";
  const before = value.slice(0, cursor);
  const match = before.match(/@图?$/);
  if (!match || state.referenceImages.length === 0) {
    hideAtMenu();
    return;
  }
  showAtMenu();
}

function handlePromptKeydownForAtMention(event) {
  if (!els.atMenu || els.atMenu.classList.contains("pg-hidden")) return;
  const options = Array.from(els.atMenu.querySelectorAll("[data-role='at-option']"));
  if (!options.length) return;

  const active = els.atMenu.querySelector("[data-role='at-option'].is-active");
  let index = options.indexOf(active);

  if (event.key === "ArrowDown") {
    event.preventDefault();
    index = (index + 1) % options.length;
    options.forEach((item, i) => item.classList.toggle("is-active", i === index));
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    index = (index - 1 + options.length) % options.length;
    options.forEach((item, i) => item.classList.toggle("is-active", i === index));
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    const selected = options[index >= 0 ? index : 0];
    if (!selected) return;
    event.preventDefault();
    insertAtMention(selected.dataset.label || "");
    return;
  }
  if (event.key === "Escape") {
    hideAtMenu();
  }
}

function showAtMenu() {
  if (!els.atMenu) return;
  els.atMenu.innerHTML = state.referenceImages
    .map(
      (item, index) => `
      <button type="button" class="pg-at-option${index === 0 ? " is-active" : ""}" data-role="at-option" data-label="@${escapeHtml(item.label)}">
        <img src="${escapeAttr(item.dataUrl)}" alt="" />
        <span>@${escapeHtml(item.label)}</span>
      </button>
    `
    )
    .join("");
  els.atMenu.classList.remove("pg-hidden");
}

function hideAtMenu() {
  els.atMenu?.classList.add("pg-hidden");
  if (els.atMenu) els.atMenu.innerHTML = "";
}

function insertAtMention(label) {
  if (!els.input || !label) return;
  const value = els.input.value || "";
  const cursor = els.input.selectionStart ?? value.length;
  const before = value.slice(0, cursor).replace(/@图?$/, "");
  const after = value.slice(cursor);
  const next = `${before}${label} ${after}`;
  els.input.value = next;
  state.panelData.prompts[state.panelData.detail][getCurrentLanguage()] = next;
  const nextCursor = (before + label + " ").length;
  els.input.focus();
  els.input.setSelectionRange(nextCursor, nextCursor);
  hideAtMenu();
  updateMeta();
  persistPanelImageCache();
}

function persistPanelImageCache() {
  if (!state.panelImage) return;
  const imageUrl = state.panelImage.currentSrc || state.panelImage.src;
  if (!imageUrl) return;
  imageCache.set(imageUrl, structuredClone(state.panelData));
}

async function persistHistoryAfterAnalyze(imageUrl, preferredDataUrl = "") {
  try {
    const sourceThumbDataUrl = await createHistoryThumbnail(
      state.panelImage,
      els.previewImage?.src || "",
      preferredDataUrl
    );
    const saved = await sendMessage({
      type: "save-history",
      payload: {
        id: state.historyId || undefined,
        title: state.panelData.title || "图片提示词",
        sourceImageUrl: imageUrl || "",
        sourceThumbDataUrl,
        prompts: state.panelData.prompts,
        promptSnapshot: getCurrentPrompt().trim(),
        aspectRatio: state.panelData.aspectRatio || state.settings?.aspectRatio || "1:1",
        generatedImages: state.currentJob?.images || []
      }
    });
    state.historyId = saved?.id || state.historyId;
  } catch (error) {
    console.info("[小波绘词] 保存历史失败", error?.message || error);
  }
}

async function persistHistoryAfterGenerate() {
  try {
    const imageUrl = state.panelImage?.currentSrc || state.panelImage?.src || "";
    const sourceThumbDataUrl = await createHistoryThumbnail(
      state.panelImage,
      els.previewImage?.src || "",
      imageUrl.startsWith("data:") ? imageUrl : ""
    );
    const saved = await sendMessage({
      type: "save-history",
      payload: {
        id: state.historyId || undefined,
        title: state.panelData.title || "图片提示词",
        sourceImageUrl: imageUrl.startsWith("data:") ? "local-image" : imageUrl,
        sourceThumbDataUrl,
        prompts: state.panelData.prompts,
        promptSnapshot: getCurrentPrompt().trim(),
        aspectRatio: state.panelData.aspectRatio || state.settings?.aspectRatio || "1:1",
        generatedImages: state.currentJob?.images || []
      }
    });
    state.historyId = saved?.id || state.historyId;
  } catch (error) {
    console.info("[小波绘词] 保存历史失败", error?.message || error);
  }
}

async function createHistoryThumbnail(image, fallbackSrc = "", preferredDataUrl = "") {
  const maxEdge = 320;
  const preferred = String(preferredDataUrl || "").trim();
  if (preferred.startsWith("data:image/")) {
    const resized = await resizeDataUrlThumbnail(preferred, maxEdge);
    if (resized) return resized;
  }

  try {
    if (image instanceof HTMLImageElement) {
      const width = Number(image.naturalWidth || image.width) || 0;
      const height = Number(image.naturalHeight || image.height) || 0;
      if (width > 0 && height > 0) {
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
          return canvas.toDataURL("image/jpeg", 0.72);
        }
      }
    }
  } catch (_error) {
    // 跨域可能污染 canvas，继续走 fallback
  }

  const src = String(fallbackSrc || image?.currentSrc || image?.src || "").trim();
  if (src.startsWith("data:image/")) {
    return (await resizeDataUrlThumbnail(src, maxEdge)) || src;
  }

  if (/^https?:\/\//i.test(src)) {
    try {
      const result = await sendMessage({
        type: "resolve-image-preview",
        payload: {
          imageUrl: src,
          pageUrl: location.href
        }
      });
      if (result?.dataUrl?.startsWith("data:image/")) return result.dataUrl;
    } catch (_error) {
      // ignore
    }
  }

  return "";
}

function resizeDataUrlThumbnail(dataUrl, maxEdge = 320) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const width = Number(image.naturalWidth || image.width) || 0;
        const height = Number(image.naturalHeight || image.height) || 0;
        if (width <= 0 || height <= 0) {
          resolve(dataUrl);
          return;
        }
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch (_error) {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve("");
    image.src = dataUrl;
  });
}

function renderInlineImages(images) {
  if (!images || images.length === 0) {
    els.inlinePreview.classList.remove("is-visible");
    els.inlineGrid.innerHTML = "";
    return;
  }

  els.inlinePreview.classList.add("is-visible");
  els.inlineGrid.innerHTML = images
    .map((image, index) => {
      const src = `data:${image.mimeType || "image/png"};base64,${image.base64Data}`;
      return `
        <article class="pg-preview-card">
          <div class="pg-preview-frame">
            <img src="${src}" alt="generated preview ${index + 1}" />
            <div class="pg-preview-overlay">
              <button class="pg-preview-action" data-role="download" data-index="${index}" type="button">下载图片</button>
              <button class="pg-preview-action" data-role="viewer" data-index="${index}" type="button">新页面打开</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function getImageDataUrl(index) {
  const image = state.currentJob?.images?.[index];
  if (!image) return "";
  return `data:${image.mimeType || "image/png"};base64,${image.base64Data}`;
}

function triggerDownload(src, filename) {
  const link = document.createElement("a");
  link.href = src;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function updateMeta() {
  const text = els.input.value || "";
  els.charCount.textContent = `${text.length} 字`;
}

async function runAction(actionName, statusText, task) {
  if (state.actionState[actionName]) return;

  state.actionState[actionName] = true;
  syncActionState();
  setStatus(statusText, "working");

  try {
    await task();
  } catch (error) {
    setStatus(error.message || "发生错误，请稍后重试。", "error");
  } finally {
    state.actionState[actionName] = false;
    syncActionState();
    updateMeta();
  }
}

function syncActionState() {
  els.analyze.classList.toggle("is-busy", state.actionState.analyze);
  els.generate.classList.toggle("is-busy", state.actionState.generate);
  syncAnalyzeAvailability();
}

function syncAnalyzeAvailability() {
  const canAnalyze = Boolean(state.panelImage);
  els.analyze.disabled = !canAnalyze;
  els.analyze.title = canAnalyze ? "重新识别当前图片" : "请先上传、粘贴或选择网页图片";
  els.analyze.classList.toggle("is-disabled", !canAnalyze);
  syncImg2ImgAvailability();
}

function syncGenerationVisibility() {
  const enabled = Boolean(state.settings?.imageGenerationEnabled);
  els.generateSection?.classList.toggle("pg-hidden", !enabled);
  syncImg2ImgAvailability();
}

function syncImg2ImgAvailability() {
  const available = canUseReferenceImage();
  if (els.img2img) {
    els.img2img.disabled = !available;
    if (!available) {
      els.img2img.checked = false;
    } else if (!els.img2img.dataset.userTouched) {
      els.img2img.checked = true;
    }
  }
  els.img2imgRow?.classList.toggle("is-disabled", !available);
  els.img2imgRow?.setAttribute(
    "title",
    available
      ? "开启后将参考图与提示词一起发送；也可用 @图1 精确引用"
      : "请先添加参考图，或上传/选择图片"
  );
}

function setStatus(text, tone = "") {
  els.status.textContent = text;
  if (tone) {
    els.status.dataset.tone = tone;
  } else {
    delete els.status.dataset.tone;
  }
}

function handleRuntimeError(error) {
  const message = String(error?.message || error || "发生错误，请稍后重试。");
  if (state.panelOpen) {
    setStatus(message, "error");
    return;
  }
  // 面板未打开时只做提示，避免 Uncaught (in promise) 被 Chrome 记成扩展错误
  console.info("[小波绘词]", message);
}

function isExtensionContextInvalidated(error) {
  const message = String(error?.message || error || "");
  return !chrome?.runtime?.id || /Extension context invalidated|插件已重新加载/i.test(message);
}

function truncateMiddle(text, maxLength) {
  if (text.length <= maxLength) return text;
  const head = Math.ceil(maxLength / 2) - 2;
  const tail = Math.floor(maxLength / 2) - 1;
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

async function captureImageDataUrl(image) {
  if (!(image instanceof HTMLImageElement)) return "";

  const src = image.currentSrc || image.src || "";
  if (src.startsWith("data:")) return src;

  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const width = Number(image.naturalWidth || image.width) || 0;
      const height = Number(image.naturalHeight || image.height) || 0;
      if (width > 0 && height > 0) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(image, 0, 0, width, height);
          const blob = await canvas.convertToBlob({
            type: "image/png"
          });
          return await blobToDataUrl(blob);
        }
      }
    }
  } catch (_error) {
    // Cross-origin images may taint the canvas. Fallback to URL fetch in the background worker.
  }

  try {
    const response = await fetch(src, {
      credentials: "include"
    });
    if (response.ok) {
      const blob = await response.blob();
      return await blobToDataUrl(blob);
    }
  } catch (_error) {
    // Some sites still block content-script fetches. The background worker keeps the final fallback path.
  }

  return "";
}

function getImageViewportCrop(image) {
  if (!(image instanceof HTMLImageElement)) return null;

  const rect = image.getBoundingClientRect();
  const x = Math.max(0, rect.left);
  const y = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);

  if (width <= 1 || height <= 1) return null;

  return {
    x,
    y,
    width,
    height,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function sendMessage(message) {
  if (!chrome?.runtime?.id) {
    throw new Error("插件已重新加载，请刷新当前页面后再试。");
  }

  let response;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      throw new Error("插件已重新加载，请刷新当前页面后再试。");
    }
    throw error;
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Extension request failed.");
  }
  return response.data;
}

} // end __XIAOBO_DRAW_CONTENT__ guard
