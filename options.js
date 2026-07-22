const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const docButton = document.getElementById("open-doc");
const historyButton = document.getElementById("open-history");
const promptProviderField = document.querySelector('[name="promptProvider"]');
const imageProviderField = document.querySelector('[name="imageProvider"]');
const imageGenerationEnabledField = document.querySelector('[name="imageGenerationEnabled"]');
const imageSettingsGroup = document.getElementById("image-settings-group");
const promptModelHelp = document.getElementById("prompt-model-help");
const imageModelHelp = document.getElementById("image-model-help");
const promptBaseUrlHelp = document.getElementById("prompt-base-url-help");
const imageBaseUrlHelp = document.getElementById("image-base-url-help");

const PROVIDER_OPTIONS = [
  {
    value: "gemini",
    label: "Gemini",
    description: "Google 官方 Gemini / 兼容代理"
  },
  {
    value: "openai-compatible",
    label: "OpenAI Compatible",
    description: "OpenAI 官方或中转站 /v1"
  },
  {
    value: "volcengine",
    label: "火山引擎",
    description: "豆包视觉 / Seedream 生图"
  }
];

const PROVIDER_DOCS = {
  gemini: "https://ai.google.dev/gemini-api/docs/image-generation",
  "openai-compatible": "https://developers.openai.com/api/docs",
  volcengine: "https://www.volcengine.com/docs/82379/1541523"
};

let currentSettings = null;
let promptProfileDrafts = {};
let imageProfileDrafts = {};

init();

async function init() {
  enhanceProviderSelects();

  if (!hasExtensionRuntime()) {
    setStandaloneMode();
    return;
  }

  try {
    const settings = await sendMessage({ type: "get-settings" });
    currentSettings = settings;
    promptProfileDrafts = cloneProfiles(settings.promptProviderProfiles);
    imageProfileDrafts = cloneProfiles(settings.imageProviderProfiles);
    hydrateForm(settings);
    statusEl.textContent = "设置已载入。";
  } catch (error) {
    statusEl.textContent = error.message || "读取设置失败。";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!hasExtensionRuntime()) {
    statusEl.textContent = "请从 Chrome 扩展的设置页打开，不要直接打开本地 options.html 文件。";
    return;
  }

  updatePromptDraftFromForm();
  updateImageDraftFromForm();

  const payload = {
    promptProvider: promptProviderField?.value || "gemini",
    imageProvider: imageProviderField?.value || "gemini",
    apiMode: "direct",
    promptApiKey: getField("promptApiKey")?.value || "",
    promptModel: getField("promptModel")?.value || "",
    promptBaseUrl: getField("promptBaseUrl")?.value || "",
    autoAnalyze: getField("autoAnalyze")?.checked || false,
    imageGenerationEnabled: getField("imageGenerationEnabled")?.checked || false,
    imageApiKey: getField("imageApiKey")?.value || "",
    imageModel: getField("imageModel")?.value || "",
    imageBaseUrl: getField("imageBaseUrl")?.value || "",
    customProxyUrl: "",
    customProxyToken: ""
  };

  try {
    statusEl.textContent = "保存中...";
    const saved = await sendMessage({ type: "save-settings", payload });
    currentSettings = saved;
    promptProfileDrafts = cloneProfiles(saved.promptProviderProfiles);
    imageProfileDrafts = cloneProfiles(saved.imageProviderProfiles);
    hydrateForm(saved);
    statusEl.textContent = "设置已保存。";
  } catch (error) {
    statusEl.textContent = error.message || "保存失败。";
  }
});

imageGenerationEnabledField?.addEventListener("change", syncImageSettingsVisibility);
promptProviderField?.addEventListener("change", handlePromptProviderChange);
imageProviderField?.addEventListener("change", handleImageProviderChange);

docButton.addEventListener("click", () => {
  const provider = promptProviderField?.value || "gemini";
  const url = PROVIDER_DOCS[provider] || PROVIDER_DOCS.gemini;
  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener");
});

historyButton?.addEventListener("click", async () => {
  if (!hasExtensionRuntime()) {
    statusEl.textContent = "请从 Chrome 扩展的设置页打开，不要直接打开本地 options.html 文件。";
    return;
  }

  try {
    await sendMessage({ type: "open-history" });
    statusEl.textContent = "已打开历史记录页。";
  } catch (error) {
    statusEl.textContent = error.message || "打开历史失败。";
  }
});

function hydrateForm(settings) {
  if (promptProviderField) {
    promptProviderField.value = settings.promptProvider || "gemini";
    syncProviderSelectUI(promptProviderField);
  }
  if (imageProviderField) {
    imageProviderField.value = settings.imageProvider || "gemini";
    syncProviderSelectUI(imageProviderField);
  }

  hydratePromptFields(
    settings.promptProvider || "gemini",
    settings.promptProviderProfiles?.[settings.promptProvider || "gemini"] || {
      apiKey: settings.promptApiKey,
      model: settings.promptModel,
      baseUrl: settings.promptBaseUrl,
      autoAnalyze: settings.autoAnalyze
    }
  );
  hydrateImageFields(
    settings.imageProvider || "gemini",
    settings.imageProviderProfiles?.[settings.imageProvider || "gemini"] || {
      apiKey: settings.imageApiKey,
      model: settings.imageModel,
      baseUrl: settings.imageBaseUrl,
      imageGenerationEnabled: settings.imageGenerationEnabled
    }
  );
}

function handlePromptProviderChange() {
  const previousProvider = currentSettings?.promptProvider || "gemini";
  updatePromptDraftFromForm(previousProvider);
  const provider = promptProviderField?.value || "gemini";
  currentSettings = {
    ...(currentSettings || {}),
    promptProvider: provider
  };
  hydratePromptFields(provider, promptProfileDrafts[provider] || {});
}

function handleImageProviderChange() {
  const previousProvider = currentSettings?.imageProvider || "gemini";
  updateImageDraftFromForm(previousProvider);
  const provider = imageProviderField?.value || "gemini";
  currentSettings = {
    ...(currentSettings || {}),
    imageProvider: provider
  };
  hydrateImageFields(provider, imageProfileDrafts[provider] || {});
}

function hydratePromptFields(provider, source) {
  const merged = normalizePromptProfile(provider, source);

  setFieldValue("promptApiKey", merged.apiKey);
  setFieldValue("promptModel", merged.model);
  setFieldValue("promptBaseUrl", merged.baseUrl);
  setCheckboxValue("autoAnalyze", merged.autoAnalyze);
  syncPromptProviderUI(provider);
}

function hydrateImageFields(provider, source) {
  const merged = normalizeImageProfile(provider, source);

  setCheckboxValue("imageGenerationEnabled", merged.imageGenerationEnabled);
  setFieldValue("imageApiKey", merged.apiKey);
  setFieldValue("imageModel", merged.model);
  setFieldValue("imageBaseUrl", merged.baseUrl);
  syncImageSettingsVisibility();
  syncImageProviderUI(provider);
}

function updatePromptDraftFromForm(provider = promptProviderField?.value || "gemini") {
  promptProfileDrafts[provider] = normalizePromptProfile(provider, {
    apiKey: getField("promptApiKey")?.value || "",
    model: getField("promptModel")?.value || "",
    baseUrl: getField("promptBaseUrl")?.value || "",
    autoAnalyze: getField("autoAnalyze")?.checked || false
  });
}

function updateImageDraftFromForm(provider = imageProviderField?.value || "gemini") {
  imageProfileDrafts[provider] = normalizeImageProfile(provider, {
    imageGenerationEnabled: getField("imageGenerationEnabled")?.checked || false,
    apiKey: getField("imageApiKey")?.value || "",
    model: getField("imageModel")?.value || "",
    baseUrl: getField("imageBaseUrl")?.value || ""
  });
}

function syncPromptProviderUI(provider) {
  const promptModelField = getField("promptModel");
  const promptBaseUrlField = getField("promptBaseUrl");

  if (promptModelField) {
    promptModelField.placeholder =
      provider === "openai-compatible"
        ? "gpt-4o"
        : provider === "volcengine"
          ? "doubao-1.5-vision-pro"
          : "gemini-3.1-pro-preview";
  }
  if (promptBaseUrlField) {
    promptBaseUrlField.placeholder =
      provider === "openai-compatible"
        ? "https://api.example.com"
        : provider === "volcengine"
          ? "https://ark.cn-beijing.volces.com/api/v3"
          : "https://generativelanguage.googleapis.com/v1beta";
  }
  if (promptModelHelp) {
    promptModelHelp.textContent =
      provider === "openai-compatible"
        ? "OpenAI 兼容识图默认可先用 gpt-4o。"
        : provider === "volcengine"
          ? "火山引擎可填视觉模型名或方舟推理接入点 ID，例如 doubao-1.5-vision-pro。"
          : "Gemini 例如 gemini-3.1-pro-preview。";
  }
  if (promptBaseUrlHelp) {
    promptBaseUrlHelp.textContent =
      provider === "openai-compatible"
        ? "中转站可只填域名，例如 https://api.klong.lat；插件会自动补全 /v1。已带 /v1 或自定义路径则保持不变。"
        : provider === "volcengine"
          ? "默认 https://ark.cn-beijing.volces.com/api/v3；一般不用改，Key 在火山方舟控制台创建。"
          : "Gemini 默认官方地址；一般不用改，除非你使用兼容代理。";
  }
}

function syncImageProviderUI(provider) {
  const imageModelField = getField("imageModel");
  const imageBaseUrlField = getField("imageBaseUrl");

  if (imageModelField) {
    imageModelField.placeholder =
      provider === "openai-compatible"
        ? "gpt-image-2"
        : provider === "volcengine"
          ? "doubao-seedream-4-0-250828"
          : "gemini-3.1-flash-image-preview";
  }
  if (imageBaseUrlField) {
    imageBaseUrlField.placeholder =
      provider === "openai-compatible"
        ? "https://api.example.com"
        : provider === "volcengine"
          ? "https://ark.cn-beijing.volces.com/api/v3"
          : "https://generativelanguage.googleapis.com/v1beta";
  }
  if (imageModelHelp) {
    imageModelHelp.textContent =
      provider === "openai-compatible"
        ? "OpenAI 兼容生图默认可先用 gpt-image-2；不同兼容平台支持度可能不同。"
        : provider === "volcengine"
          ? "火山引擎可填 Seedream 模型名或推理接入点 ID，例如 doubao-seedream-4-0-250828。"
          : "Gemini 例如 gemini-3.1-flash-image-preview；不同账号、地区或套餐的可用模型可能不同。";
  }
  if (imageBaseUrlHelp) {
    imageBaseUrlHelp.textContent =
      provider === "openai-compatible"
        ? "中转站可只填域名；插件自动补全 /v1。已含路径则按你填写的为准。"
        : provider === "volcengine"
          ? "默认火山方舟地址；图生图会走 /images/generations 并携带原图。"
          : "Gemini 默认官方地址；使用代理时再改成对应接口地址。";
  }
}

function getPromptProviderDefaults(provider) {
  if (provider === "openai-compatible") {
    return {
      apiKey: "",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      autoAnalyze: true
    };
  }

  if (provider === "volcengine") {
    return {
      apiKey: "",
      model: "doubao-1.5-vision-pro",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      autoAnalyze: true
    };
  }

  return {
    apiKey: "",
    model: "gemini-3.1-pro-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    autoAnalyze: true
  };
}

function getImageProviderDefaults(provider) {
  if (provider === "openai-compatible") {
    return {
      imageGenerationEnabled: true,
      apiKey: "",
      model: "gpt-image-2",
      baseUrl: "https://api.openai.com/v1"
    };
  }

  if (provider === "volcengine") {
    return {
      imageGenerationEnabled: true,
      apiKey: "",
      model: "doubao-seedream-4-0-250828",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3"
    };
  }

  return {
    imageGenerationEnabled: true,
    apiKey: "",
    model: "gemini-3.1-flash-image-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta"
  };
}

function setFieldValue(name, value) {
  const field = getField(name);
  if (field) field.value = value ?? "";
}

function setCheckboxValue(name, value) {
  const field = getField(name);
  if (field) field.checked = Boolean(value);
}

function getField(name) {
  return document.querySelector(`[name="${CSS.escape(name)}"]`);
}

function syncImageSettingsVisibility() {
  const enabled = Boolean(imageGenerationEnabledField?.checked);
  imageSettingsGroup?.classList.toggle("is-hidden", !enabled);
}

function cloneProfiles(value) {
  const source = value && typeof value === "object" ? value : {};
  return JSON.parse(JSON.stringify(source));
}

function normalizePromptProfile(provider, source) {
  const defaults = getPromptProviderDefaults(provider);
  const input = source && typeof source === "object" ? source : {};
  return {
    apiKey: String(input.apiKey || ""),
    model: String(input.model || defaults.model),
    baseUrl: String(input.baseUrl || defaults.baseUrl),
    autoAnalyze: "autoAnalyze" in input ? Boolean(input.autoAnalyze) : defaults.autoAnalyze
  };
}

function normalizeImageProfile(provider, source) {
  const defaults = getImageProviderDefaults(provider);
  const input = source && typeof source === "object" ? source : {};
  return {
    imageGenerationEnabled:
      "imageGenerationEnabled" in input
        ? Boolean(input.imageGenerationEnabled)
        : defaults.imageGenerationEnabled,
    apiKey: String(input.apiKey || ""),
    model: String(input.model || defaults.model),
    baseUrl: String(input.baseUrl || defaults.baseUrl)
  };
}

function hasExtensionRuntime() {
  return Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.runtime?.sendMessage);
}

function setStandaloneMode() {
  for (const field of form.querySelectorAll("input, select, button[type='submit']")) {
    field.disabled = true;
  }
  for (const trigger of form.querySelectorAll(".provider-select-trigger")) {
    trigger.disabled = true;
  }
  statusEl.textContent = "当前页面是本地预览。请到 chrome://extensions 打开“小波绘词”的扩展设置页进行配置。";
}

function enhanceProviderSelects() {
  for (const root of document.querySelectorAll(".provider-select")) {
    const select = root.querySelector("select");
    const trigger = root.querySelector(".provider-select-trigger");
    const menu = root.querySelector(".provider-select-menu");
    const valueEl = root.querySelector(".provider-select-value");
    if (!select || !trigger || !menu || !valueEl) continue;

    menu.innerHTML = PROVIDER_OPTIONS.map(
      (item) => `
        <li role="option" data-value="${item.value}" aria-selected="false" tabindex="-1">
          <strong>${item.label}</strong>
          <span>${item.description}</span>
        </li>
      `
    ).join("");

    syncProviderSelectUI(select);

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = menu.hidden;
      closeAllProviderMenus();
      if (willOpen) openProviderMenu(root);
    });

    menu.addEventListener("click", (event) => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      event.preventDefault();
      select.value = option.dataset.value || select.value;
      syncProviderSelectUI(select);
      closeProviderMenu(root);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProviderMenu(root);
        const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector('[role="option"]');
        selected?.focus();
      }
    });

    menu.addEventListener("keydown", (event) => {
      const options = Array.from(menu.querySelectorAll('[role="option"]'));
      const current = document.activeElement;
      const index = options.indexOf(current);
      if (event.key === "Escape") {
        event.preventDefault();
        closeProviderMenu(root);
        trigger.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        options[(index + 1) % options.length]?.focus();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        options[(index - 1 + options.length) % options.length]?.focus();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        current?.click();
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".provider-select")) return;
    closeAllProviderMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllProviderMenus();
  });
}

function syncProviderSelectUI(select) {
  if (!select) return;
  const root = select.closest(".provider-select");
  if (!root) return;
  const valueEl = root.querySelector(".provider-select-value");
  const menu = root.querySelector(".provider-select-menu");
  const meta = PROVIDER_OPTIONS.find((item) => item.value === select.value) || PROVIDER_OPTIONS[0];
  if (valueEl) valueEl.textContent = meta.label;
  menu?.querySelectorAll('[role="option"]').forEach((item) => {
    item.setAttribute("aria-selected", item.dataset.value === select.value ? "true" : "false");
  });
}

function openProviderMenu(root) {
  const trigger = root.querySelector(".provider-select-trigger");
  const menu = root.querySelector(".provider-select-menu");
  if (!trigger || !menu) return;
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  root.classList.add("is-open");
}

function closeProviderMenu(root) {
  const trigger = root.querySelector(".provider-select-trigger");
  const menu = root.querySelector(".provider-select-menu");
  if (!trigger || !menu) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  root.classList.remove("is-open");
}

function closeAllProviderMenus() {
  for (const root of document.querySelectorAll(".provider-select.is-open")) {
    closeProviderMenu(root);
  }
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Options request failed.");
  }
  return response.data;
}
