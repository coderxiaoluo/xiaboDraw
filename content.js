const imageCache = new Map();
const RATIO_OPTIONS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
let hoverHideTimer = null;

const state = {
  settings: null,
  hoverImage: null,
  panelImage: null,
  panelOpen: false,
  currentJob: null,
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
        <button class="pg-icon-button" id="pg-open-options" type="button" aria-label="打开设置" title="打开设置">⚙</button>
        <button class="pg-icon-button" id="pg-close" type="button" aria-label="关闭" title="关闭">✕</button>
      </div>
    </div>

    <div class="pg-result-bar">
      <div class="pg-preview"><img id="pg-preview-image" alt="selected image preview" /></div>
      <div class="pg-title">
        <strong id="pg-image-title">当前图片</strong>
        <span class="pg-image-url" id="pg-image-url" title="">等待选择图片</span>
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
        <textarea class="pg-textarea" id="pg-prompt-input" placeholder="上传图片自动解析 AI 绘图提示词，支持手动编辑、增减画面描述"></textarea>
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
        <div class="pg-actions pg-actions-fixed">
          <button class="pg-action pg-action-generate" id="pg-generate" type="button">立刻生图</button>
        </div>
      </div>

      <div class="pg-inline-preview" id="pg-inline-preview">
        <div class="pg-inline-stack" id="pg-inline-grid"></div>
      </div>
    </section>

    <p class="pg-credit">© 2026 嘉文钱. Licensed under MIT</p>
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
  close: panel.querySelector("#pg-close"),
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
  inlineGrid: panel.querySelector("#pg-inline-grid")
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
    analyzeCurrentImage({ force: true }).catch(handleRuntimeError);
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

async function openPanelForImage(image) {
  hideHoverButton();
  state.panelImage = image;
  state.panelOpen = true;
  panel.classList.add("pg-open");

  const imageUrl = image?.currentSrc || image?.src || "";
  els.previewImage.src = imageUrl;
  els.imageTitle.textContent = image?.alt?.trim() || "网页图片";
  els.imageUrl.textContent = imageUrl || "等待选择图片";
  els.imageUrl.title = imageUrl || "";
  state.currentJob = null;
  renderInlineImages([]);

  try {
    state.settings = await sendMessage({ type: "get-settings" });
  } catch (error) {
    handleRuntimeError(error);
    return;
  }

  const cached = imageCache.get(imageUrl);
  if (cached) {
    hydratePanelData(cached);
    return;
  }

  state.panelData = createEmptyPanelData();
  state.panelData.detail = "full";
  state.panelData.aspectRatio = state.settings?.aspectRatio || "1:1";
  renderRatioSelect();
  syncGenerationVisibility();
  syncPromptControls();
  setStatus("等待识别...");

  if (state.settings?.autoAnalyze) {
    await analyzeCurrentImage({ force: false });
  }
}

function closePanel() {
  state.panelOpen = false;
  panel.classList.remove("pg-open");
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
    const imageDataUrl = await captureImageDataUrl(state.panelImage);
    const screenshotCrop = getImageViewportCrop(state.panelImage);
    const result = await sendMessage({
      type: "analyze-image",
      payload: {
        imageUrl,
        imageDataUrl,
        screenshotCrop,
        pageUrl: location.href,
        alt: state.panelImage.alt || ""
      }
    });

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

    imageCache.set(imageUrl, cached);
    hydratePanelData(cached);
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

  await runAction("generate", "正在生图，结果会显示在当前弹窗...", async () => {
    const result = await sendMessage({
      type: "generate-image",
      payload: {
        prompt,
        aspectRatio: state.panelData.aspectRatio || state.settings?.aspectRatio || "1:1",
        count: state.settings?.imageCount || 1,
        openViewer: false
      }
    });

    state.currentJob = {
      images: result.images || []
    };

    renderInlineImages(state.currentJob.images);
    setStatus("生图完成，预览已更新。", "success");
  });
}

function persistPanelImageCache() {
  if (!state.panelImage) return;
  const imageUrl = state.panelImage.currentSrc || state.panelImage.src;
  if (!imageUrl) return;
  imageCache.set(imageUrl, structuredClone(state.panelData));
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
}

function syncGenerationVisibility() {
  const enabled = Boolean(state.settings?.imageGenerationEnabled);
  els.generateSection?.classList.toggle("pg-hidden", !enabled);
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
