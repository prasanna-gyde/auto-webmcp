"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/registry.ts
var registry_exports = {};
__export(registry_exports, {
  getAllRegisteredTools: () => getAllRegisteredTools,
  getRegisteredToolName: () => getRegisteredToolName,
  isWebMCPSupported: () => isWebMCPSupported,
  registerFormTool: () => registerFormTool,
  unregisterAll: () => unregisterAll,
  unregisterFormTool: () => unregisterFormTool
});
function isWebMCPSupported() {
  return typeof navigator !== "undefined" && typeof navigator.modelContext !== "undefined";
}
async function registerFormTool(form, metadata, execute) {
  if (!isWebMCPSupported())
    return;
  const existing = registeredTools.get(form);
  if (existing) {
    await unregisterFormTool(form);
  }
  await navigator.modelContext.registerTool({
    name: metadata.name,
    description: metadata.description,
    inputSchema: metadata.inputSchema,
    execute
  });
  registeredTools.set(form, metadata.name);
}
async function unregisterFormTool(form) {
  if (!isWebMCPSupported())
    return;
  const name = registeredTools.get(form);
  if (!name)
    return;
  try {
    await navigator.modelContext.unregisterTool(name);
  } catch {
  }
  registeredTools.delete(form);
}
function getRegisteredToolName(form) {
  return registeredTools.get(form);
}
function getAllRegisteredTools() {
  return Array.from(registeredTools.entries()).map(([form, name]) => ({ form, name }));
}
async function unregisterAll() {
  const entries = Array.from(registeredTools.entries());
  await Promise.all(entries.map(([form]) => unregisterFormTool(form)));
}
var registeredTools;
var init_registry = __esm({
  "src/registry.ts"() {
    "use strict";
    registeredTools = /* @__PURE__ */ new Map();
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  autoWebMCP: () => autoWebMCP
});
module.exports = __toCommonJS(src_exports);

// src/config.ts
function resolveConfig(userConfig) {
  return {
    exclude: userConfig?.exclude ?? [],
    autoSubmit: userConfig?.autoSubmit ?? false,
    enhance: userConfig?.enhance ?? null,
    overrides: userConfig?.overrides ?? {},
    debug: userConfig?.debug ?? false
  };
}

// src/schema.ts
function inputTypeToSchema(input) {
  if (input instanceof HTMLInputElement) {
    return mapInputElement(input);
  }
  if (input instanceof HTMLTextAreaElement) {
    return { type: "string" };
  }
  if (input instanceof HTMLSelectElement) {
    return mapSelectElement(input);
  }
  return null;
}
function mapInputElement(input) {
  const type = input.type.toLowerCase();
  switch (type) {
    case "text":
    case "search":
    case "tel":
      return buildStringSchema(input);
    case "email":
      return { ...buildStringSchema(input), format: "email" };
    case "url":
      return { ...buildStringSchema(input), format: "uri" };
    case "number":
    case "range": {
      const prop = { type: "number" };
      if (input.min !== "")
        prop.minimum = parseFloat(input.min);
      if (input.max !== "")
        prop.maximum = parseFloat(input.max);
      return prop;
    }
    case "date":
      return { type: "string", format: "date" };
    case "datetime-local":
      return { type: "string", format: "date-time" };
    case "time":
      return { type: "string", format: "time" };
    case "month":
      return { type: "string", pattern: "^\\d{4}-\\d{2}$" };
    case "week":
      return { type: "string", pattern: "^\\d{4}-W\\d{2}$" };
    case "color":
      return { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
    case "checkbox":
      return { type: "boolean" };
    case "radio":
      return { type: "string" };
    case "file":
    case "hidden":
    case "submit":
    case "reset":
    case "button":
    case "image":
      return null;
    case "password":
      return null;
    default:
      return { type: "string" };
  }
}
function buildStringSchema(input) {
  const prop = { type: "string" };
  if (input.minLength > 0)
    prop.minLength = input.minLength;
  if (input.maxLength > 0 && input.maxLength !== 524288)
    prop.maxLength = input.maxLength;
  if (input.pattern)
    prop.pattern = input.pattern;
  return prop;
}
function mapSelectElement(select) {
  const options = Array.from(select.options).filter((o) => o.value !== "").map((o) => o.value);
  if (options.length === 0) {
    return { type: "string" };
  }
  return {
    type: "string",
    enum: options
  };
}
function collectRadioEnum(form, name) {
  const radios = Array.from(
    form.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
  );
  return radios.map((r) => r.value).filter((v) => v !== "");
}

// src/analyzer.ts
var formIndex = 0;
function analyzeForm(form, override) {
  const name = override?.name ?? inferToolName(form);
  const description = override?.description ?? inferToolDescription(form);
  const inputSchema = buildSchema(form);
  return { name, description, inputSchema };
}
function inferToolName(form) {
  const explicit = form.dataset["webmcpName"];
  if (explicit)
    return sanitizeName(explicit);
  const submitText = getSubmitButtonText(form);
  if (submitText)
    return sanitizeName(submitText);
  const heading = getNearestHeadingText(form);
  if (heading)
    return sanitizeName(heading);
  if (form.id)
    return sanitizeName(form.id);
  if (form.name)
    return sanitizeName(form.name);
  if (form.action) {
    const segment = getLastPathSegment(form.action);
    if (segment)
      return sanitizeName(segment);
  }
  return `form_${++formIndex}`;
}
function sanitizeName(raw) {
  return raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "form";
}
function getSubmitButtonText(form) {
  const buttons = [
    ...Array.from(form.querySelectorAll('button[type="submit"], button:not([type])')),
    ...Array.from(form.querySelectorAll('input[type="submit"]'))
  ];
  for (const btn of buttons) {
    const text = btn instanceof HTMLInputElement ? btn.value.trim() : btn.textContent?.trim() ?? "";
    if (text && text.length > 0 && text.length < 80)
      return text;
  }
  return "";
}
function getNearestHeadingText(form) {
  let node = form;
  while (node) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (/^H[1-3]$/i.test(sibling.tagName)) {
        const text = sibling.textContent?.trim() ?? "";
        if (text)
          return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
    if (!node || node === document.body)
      break;
  }
  return "";
}
function getLastPathSegment(url) {
  try {
    const parsed = new URL(url, window.location.href);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    return "";
  }
}
function inferToolDescription(form) {
  const explicit = form.dataset["webmcpDescription"];
  if (explicit)
    return explicit.trim();
  const legend = form.querySelector("legend");
  if (legend?.textContent?.trim())
    return legend.textContent.trim();
  const ariaLabel = form.getAttribute("aria-label");
  if (ariaLabel?.trim())
    return ariaLabel.trim();
  const describedById = form.getAttribute("aria-describedby");
  if (describedById) {
    const descEl = document.getElementById(describedById);
    if (descEl?.textContent?.trim())
      return descEl.textContent.trim();
  }
  const heading = getNearestHeadingText(form);
  const pageTitle = document.title?.trim();
  if (heading && pageTitle)
    return `${heading} \u2014 ${pageTitle}`;
  if (heading)
    return heading;
  if (pageTitle)
    return pageTitle;
  return "Submit form";
}
function buildSchema(form) {
  const properties = {};
  const required = [];
  const processedRadioGroups = /* @__PURE__ */ new Set();
  const controls = Array.from(
    form.querySelectorAll(
      "input, textarea, select"
    )
  );
  for (const control of controls) {
    const name = control.name;
    if (!name)
      continue;
    if (control instanceof HTMLInputElement && control.type === "radio") {
      if (processedRadioGroups.has(name))
        continue;
      processedRadioGroups.add(name);
    }
    const schemaProp = inputTypeToSchema(control);
    if (!schemaProp)
      continue;
    schemaProp.title = inferFieldTitle(control);
    const desc = inferFieldDescription(control);
    if (desc)
      schemaProp.description = desc;
    if (control instanceof HTMLInputElement && control.type === "radio") {
      schemaProp.enum = collectRadioEnum(form, name);
    }
    properties[name] = schemaProp;
    if (control.required) {
      required.push(name);
    }
  }
  return { type: "object", properties, required };
}
function inferFieldTitle(control) {
  if ("dataset" in control && control.dataset["webmcpTitle"]) {
    return control.dataset["webmcpTitle"];
  }
  const labelText = getAssociatedLabelText(control);
  if (labelText)
    return labelText;
  if (control.name)
    return humanizeName(control.name);
  if (control.id)
    return humanizeName(control.id);
  return "";
}
function inferFieldDescription(control) {
  const el = control;
  if (el.dataset["webmcpDescription"])
    return el.dataset["webmcpDescription"];
  const ariaDesc = control.getAttribute("aria-description");
  if (ariaDesc)
    return ariaDesc;
  const describedById = control.getAttribute("aria-describedby");
  if (describedById) {
    const descEl = document.getElementById(describedById);
    if (descEl?.textContent?.trim())
      return descEl.textContent.trim();
  }
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    const ph = control.placeholder?.trim();
    if (ph && ph.length > 0)
      return ph;
  }
  return "";
}
function getAssociatedLabelText(control) {
  if (control.id) {
    const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    if (label) {
      const text = labelTextWithoutNested(label);
      if (text)
        return text;
    }
  }
  const parent = control.closest("label");
  if (parent) {
    const text = labelTextWithoutNested(parent);
    if (text)
      return text;
  }
  return "";
}
function labelTextWithoutNested(label) {
  const clone = label.cloneNode(true);
  clone.querySelectorAll("input, select, textarea, button").forEach((el) => el.remove());
  return clone.textContent?.trim() ?? "";
}
function humanizeName(raw) {
  return raw.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// src/discovery.ts
init_registry();

// src/interceptor.ts
var pendingExecutions = /* @__PURE__ */ new WeakMap();
function buildExecuteHandler(form, config) {
  attachSubmitInterceptor(form);
  return async (params) => {
    fillFormFields(form, params);
    return new Promise((resolve, reject) => {
      pendingExecutions.set(form, { resolve, reject });
      if (config.autoSubmit || form.dataset["webmcpAutosubmit"] !== void 0) {
        form.requestSubmit();
      }
    });
  };
}
function attachSubmitInterceptor(form) {
  if (form["__awmcp_intercepted"])
    return;
  form["__awmcp_intercepted"] = true;
  form.addEventListener("submit", (e) => {
    const pending = pendingExecutions.get(form);
    if (!pending)
      return;
    const { resolve } = pending;
    pendingExecutions.delete(form);
    const formData = serializeFormData(form);
    if (e.agentInvoked && typeof e.respondWith === "function") {
      e.preventDefault();
      e.respondWith(
        Promise.resolve({
          success: true,
          data: formData
        })
      );
      resolve({ success: true, data: formData });
    } else {
      const targetUrl = resolveFormAction(form);
      resolve({ success: true, data: formData, url: targetUrl });
    }
  });
}
function fillFormFields(form, params) {
  for (const [name, value] of Object.entries(params)) {
    const escapedName = CSS.escape(name);
    const input = form.querySelector(
      `[name="${escapedName}"]`
    );
    if (!input)
      continue;
    if (input instanceof HTMLInputElement) {
      fillInput(input, form, name, value);
    } else if (input instanceof HTMLTextAreaElement) {
      input.value = String(value ?? "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (input instanceof HTMLSelectElement) {
      input.value = String(value ?? "");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}
function fillInput(input, form, name, value) {
  const type = input.type.toLowerCase();
  if (type === "checkbox") {
    input.checked = Boolean(value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (type === "radio") {
    const escapedName = CSS.escape(name);
    const radios = form.querySelectorAll(
      `input[type="radio"][name="${escapedName}"]`
    );
    for (const radio of radios) {
      if (radio.value === String(value)) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      }
    }
    return;
  }
  input.value = String(value ?? "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
function serializeFormData(form) {
  const result = {};
  const data = new FormData(form);
  for (const [key, val] of data.entries()) {
    if (result[key] !== void 0) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(val);
      } else {
        result[key] = [existing, val];
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}
function resolveFormAction(form) {
  if (form.action) {
    try {
      return new URL(form.action, window.location.href).href;
    } catch {
    }
  }
  return window.location.href;
}

// src/enhancer.ts
async function enrichMetadata(metadata, enhancer) {
  try {
    const enriched = await callLLM(metadata, enhancer);
    return { ...metadata, description: enriched };
  } catch (err) {
    console.warn("[auto-webmcp] Enrichment failed, using heuristic description:", err);
    return metadata;
  }
}
async function callLLM(metadata, config) {
  const prompt = buildPrompt(metadata);
  if (config.provider === "claude") {
    return callClaude(prompt, config);
  } else {
    return callGemini(prompt, config);
  }
}
function buildPrompt(metadata) {
  const fields = Object.entries(metadata.inputSchema.properties).map(([name, prop]) => `- ${prop.title ?? name} (${prop.type}): ${prop.description ?? ""}`).join("\n");
  return `You are helping describe a web form as an AI tool. Given this form information:

Name: ${metadata.name}
Current description: ${metadata.description}
Fields:
${fields}

Write a concise (1-2 sentence) description of what this tool does and when an AI agent should use it. Be specific and actionable. Respond with only the description, no preamble.`;
}
async function callClaude(prompt, config) {
  const model = config.model ?? "claude-haiku-4-5-20251001";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  const data = await response.json();
  return data.content.filter((block) => block.type === "text").map((block) => block.text).join("").trim();
}
async function callGemini(prompt, config) {
  const model = config.model ?? "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 150, temperature: 0.2 }
    })
  });
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  const data = await response.json();
  return data.candidates[0]?.content.parts.map((p) => p.text).join("").trim() ?? "";
}

// src/discovery.ts
function emit(type, form, toolName) {
  window.dispatchEvent(
    new CustomEvent(type, { detail: { form, toolName } })
  );
}
function isExcluded(form, config) {
  if (form.hasAttribute("toolname"))
    return true;
  if (form.dataset["noWebmcp"] !== void 0)
    return true;
  for (const selector of config.exclude) {
    try {
      if (form.matches(selector))
        return true;
    } catch {
    }
  }
  return false;
}
async function registerForm(form, config) {
  if (isExcluded(form, config))
    return;
  let override;
  for (const [selector, ovr] of Object.entries(config.overrides)) {
    try {
      if (form.matches(selector)) {
        override = ovr;
        break;
      }
    } catch {
    }
  }
  let metadata = analyzeForm(form, override);
  if (config.enhance) {
    if (config.debug)
      console.debug(`[auto-webmcp] Enriching: ${metadata.name}\u2026`);
    metadata = await enrichMetadata(metadata, config.enhance);
  }
  const execute = buildExecuteHandler(form, config);
  await registerFormTool(form, metadata, execute);
  if (config.debug) {
    console.debug(`[auto-webmcp] Registered: ${metadata.name}`, metadata);
  }
  emit("form:registered", form, metadata.name);
}
async function unregisterForm(form, config) {
  const { getRegisteredToolName: getRegisteredToolName2 } = await Promise.resolve().then(() => (init_registry(), registry_exports));
  const name = getRegisteredToolName2(form);
  if (!name)
    return;
  await unregisterFormTool(form);
  if (config.debug) {
    console.debug(`[auto-webmcp] Unregistered: ${name}`);
  }
  emit("form:unregistered", form, name);
}
var observer = null;
function startObserver(config) {
  if (observer)
    return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element))
          continue;
        const forms = node instanceof HTMLFormElement ? [node] : Array.from(node.querySelectorAll("form"));
        for (const form of forms) {
          void registerForm(form, config);
        }
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element))
          continue;
        const forms = node instanceof HTMLFormElement ? [node] : Array.from(node.querySelectorAll("form"));
        for (const form of forms) {
          void unregisterForm(form, config);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
function listenForRouteChanges(config) {
  window.addEventListener("hashchange", () => scanForms(config));
  const original = {
    pushState: history.pushState.bind(history),
    replaceState: history.replaceState.bind(history)
  };
  history.pushState = function(...args) {
    original.pushState(...args);
    scanForms(config);
  };
  history.replaceState = function(...args) {
    original.replaceState(...args);
    scanForms(config);
  };
  window.addEventListener("popstate", () => scanForms(config));
}
async function scanForms(config) {
  const forms = Array.from(document.querySelectorAll("form"));
  await Promise.all(forms.map((form) => registerForm(form, config)));
}
async function startDiscovery(config) {
  if (document.readyState === "loading") {
    await new Promise(
      (resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
    );
  }
  await scanForms(config);
  startObserver(config);
  listenForRouteChanges(config);
}
function stopDiscovery() {
  observer?.disconnect();
  observer = null;
}

// src/index.ts
init_registry();
async function autoWebMCP(config) {
  const resolved = resolveConfig(config);
  if (resolved.debug) {
    console.debug("[auto-webmcp] Initializing", {
      webmcpSupported: isWebMCPSupported(),
      config: resolved
    });
  }
  await startDiscovery(resolved);
  return {
    destroy: async () => {
      stopDiscovery();
      await unregisterAll();
    },
    getTools: getAllRegisteredTools,
    isSupported: isWebMCPSupported()
  };
}
if (typeof window !== "undefined" && !window["__AUTO_WEBMCP_NO_AUTOINIT"]) {
  void autoWebMCP();
}
//# sourceMappingURL=auto-webmcp.cjs.js.map
