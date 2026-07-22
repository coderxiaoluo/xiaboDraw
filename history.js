const listEl = document.getElementById("history-list");
const countEl = document.getElementById("history-count");
const emptyEl = document.getElementById("history-empty");
const detailEl = document.getElementById("history-detail");
const statusEl = document.getElementById("status");
const detailTitle = document.getElementById("detail-title");
const detailMeta = document.getElementById("detail-meta");
const detailSource = document.getElementById("detail-source");
const detailSourceEmpty = document.getElementById("detail-source-empty");
const detailSourceUrl = document.getElementById("detail-source-url");
const detailPrompt = document.getElementById("detail-prompt");
const detailGenerated = document.getElementById("detail-generated");
const detailGeneratedCount = document.getElementById("detail-generated-count");
const refreshButton = document.getElementById("refresh-history");
const clearButton = document.getElementById("clear-history");
const copyPromptButton = document.getElementById("copy-prompt");
const deleteRecordButton = document.getElementById("delete-record");

let records = [];
let selectedId = "";
let selectedRecord = null;

init();

async function init() {
  refreshButton.addEventListener("click", () => loadHistory());
  clearButton.addEventListener("click", clearAll);
  copyPromptButton.addEventListener("click", copyPrompt);
  deleteRecordButton.addEventListener("click", deleteSelected);
  detailGenerated.addEventListener("click", handleGeneratedClick);
  await loadHistory();
}

async function loadHistory(preferredId = selectedId) {
  try {
    setStatus("正在读取历史...");
    records = await sendMessage({ type: "list-history" });
    countEl.textContent = `${records.length} 条`;
    renderList();

    const nextId =
      (preferredId && records.some((item) => item.id === preferredId) && preferredId) ||
      records[0]?.id ||
      "";

    if (nextId) {
      await selectRecord(nextId);
    } else {
      selectedId = "";
      selectedRecord = null;
      emptyEl.classList.remove("is-hidden");
      detailEl.classList.add("is-hidden");
    }

    setStatus(records.length ? `已载入 ${records.length} 条历史。` : "暂无历史记录。");
  } catch (error) {
    setStatus(error.message || "读取历史失败。");
  }
}

function renderList() {
  if (!records.length) {
    listEl.innerHTML = `<p class="hint" style="padding:12px">暂无记录</p>`;
    return;
  }

  listEl.innerHTML = records
    .map((item) => {
      const thumb = item.sourceThumbDataUrl || "";
      const thumbHtml = thumb
        ? `<img src="${escapeAttr(thumb)}" alt="" />`
        : `<span class="thumb-fallback" aria-hidden="true"></span>`;
      const active = item.id === selectedId ? " is-active" : "";
      const generatedLabel = item.hasGeneratedImages ? ` · 生成 ${item.generatedCount} 张` : "";
      return `
        <button class="history-item${active}" type="button" data-id="${escapeHtml(item.id)}">
          ${thumbHtml}
          <span>
            <strong>${escapeHtml(item.title || "图片提示词")}</strong>
            <span>${escapeHtml(formatTime(item.updatedAt))}${escapeHtml(generatedLabel)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  listEl.querySelectorAll(".history-item").forEach((button) => {
    button.addEventListener("click", () => {
      selectRecord(button.dataset.id).catch((error) => setStatus(error.message || "读取失败。"));
    });
  });
}

async function selectRecord(id) {
  const record = await sendMessage({
    type: "get-history",
    payload: { id }
  });

  if (!record) {
    setStatus("记录不存在，可能已被删除。");
    await loadHistory("");
    return;
  }

  selectedId = record.id;
  selectedRecord = record;
  emptyEl.classList.add("is-hidden");
  detailEl.classList.remove("is-hidden");
  renderList();
  renderDetail(record);
}

function renderDetail(record) {
  detailTitle.textContent = record.title || "图片提示词";
  detailMeta.textContent = `${formatTime(record.updatedAt)} · 比例 ${record.aspectRatio || "1:1"}`;
  detailSourceUrl.textContent =
    !record.sourceImageUrl || record.sourceImageUrl === "local-image"
      ? "本地/粘贴图片"
      : record.sourceImageUrl;
  detailPrompt.textContent = getPromptText(record) || "（无提示词）";
  renderSourcePreview(record).catch(() => {
    setSourcePreview("", "暂无源图预览");
  });

  const images = Array.isArray(record.generatedImages) ? record.generatedImages : [];
  detailGeneratedCount.textContent = `${images.length} 张`;
  if (!images.length) {
    detailGenerated.innerHTML = `<p class="hint">这条记录还没有生成图片。</p>`;
    return;
  }

  detailGenerated.innerHTML = images
    .map((image, index) => {
      const src = `data:${image.mimeType || "image/png"};base64,${image.base64Data}`;
      return `
        <article class="generated-card">
          <img src="${src}" alt="generated ${index + 1}" />
          <div class="card-actions">
            <button type="button" data-role="download" data-index="${index}">下载</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function renderSourcePreview(record) {
  setSourcePreview("", "正在加载源图预览...");

  let preview = String(record.sourceThumbDataUrl || "").trim();
  if (!preview.startsWith("data:image/") && String(record.sourceImageUrl || "").startsWith("data:image/")) {
    preview = record.sourceImageUrl;
  }

  if (!preview.startsWith("data:image/") && /^https?:\/\//i.test(record.sourceImageUrl || "")) {
    try {
      const result = await sendMessage({
        type: "resolve-image-preview",
        payload: { imageUrl: record.sourceImageUrl }
      });
      preview = String(result?.dataUrl || "").trim();
      if (preview.startsWith("data:image/") && record.id) {
        await sendMessage({
          type: "save-history",
          payload: {
            id: record.id,
            sourceThumbDataUrl: preview
          }
        });
        record.sourceThumbDataUrl = preview;
        const listItem = records.find((item) => item.id === record.id);
        if (listItem) listItem.sourceThumbDataUrl = preview;
        renderList();
      }
    } catch (_error) {
      preview = "";
    }
  }

  if (preview.startsWith("data:image/")) {
    setSourcePreview(preview);
    return;
  }

  setSourcePreview("", "暂无源图预览（跨域防盗链或原图已失效）");
}

function setSourcePreview(src, emptyText = "暂无源图预览") {
  const hasPreview = Boolean(src);
  detailSource.src = src || "";
  detailSource.classList.toggle("is-hidden", !hasPreview);
  if (detailSourceEmpty) {
    detailSourceEmpty.textContent = emptyText;
    detailSourceEmpty.classList.toggle("is-hidden", hasPreview);
  }
}

function getPromptText(record) {
  return (
    record.promptSnapshot ||
    record.prompts?.full?.zh ||
    record.prompts?.full?.en ||
    record.prompts?.short?.zh ||
    record.prompts?.short?.en ||
    ""
  );
}

async function copyPrompt() {
  const text = getPromptText(selectedRecord || {}).trim();
  if (!text) {
    setStatus("没有可复制的提示词。");
    return;
  }
  await navigator.clipboard.writeText(text);
  setStatus("提示词已复制。");
}

async function deleteSelected() {
  if (!selectedId) return;
  if (!window.confirm("确定删除这条历史记录？")) return;

  try {
    await sendMessage({
      type: "delete-history",
      payload: { id: selectedId }
    });
    setStatus("已删除。");
    await loadHistory("");
  } catch (error) {
    setStatus(error.message || "删除失败。");
  }
}

async function clearAll() {
  if (!records.length) return;
  if (!window.confirm("确定清空全部历史记录？此操作不可恢复。")) return;

  try {
    await sendMessage({ type: "clear-history" });
    setStatus("已清空全部历史。");
    await loadHistory("");
  } catch (error) {
    setStatus(error.message || "清空失败。");
  }
}

function handleGeneratedClick(event) {
  const button = event.target.closest("button[data-role='download']");
  if (!button || !selectedRecord) return;
  const index = Number(button.dataset.index);
  const image = selectedRecord.generatedImages?.[index];
  if (!image?.base64Data) return;
  const src = `data:${image.mimeType || "image/png"};base64,${image.base64Data}`;
  triggerDownload(src, `xiaobo-history-${selectedRecord.id}-${index + 1}.png`);
}

function triggerDownload(src, filename) {
  const link = document.createElement("a");
  link.href = src;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

function formatTime(value) {
  const date = new Date(Number(value) || 0);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, "&#96;");
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "请求失败。");
  }
  return response.data;
}
