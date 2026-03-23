var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
  try {
    await navigator.modelContext.registerTool({
      name: metadata.name,
      description: metadata.description,
      inputSchema: metadata.inputSchema,
      execute
    });
  } catch {
    try {
      await navigator.modelContext.unregisterTool(metadata.name);
      await navigator.modelContext.registerTool({
        name: metadata.name,
        description: metadata.description,
        inputSchema: metadata.inputSchema,
        execute
      });
    } catch {
    }
  }
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
var ARIA_ROLES_TO_SCAN = [
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "spinbutton",
  "searchbox",
  "slider"
];
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
  const filtered = Array.from(select.options).filter((o) => o.value !== "");
  if (filtered.length === 0) {
    return { type: "string" };
  }
  const enumValues = filtered.map((o) => o.value);
  const oneOf = filtered.map((o) => ({ const: o.value, title: o.text.trim() || o.value }));
  return { type: "string", enum: enumValues, oneOf };
}
function collectRadioEnum(form, name) {
  const radios = Array.from(
    form.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
  );
  return radios.map((r) => r.value).filter((v) => v !== "");
}
function collectRadioOneOf(form, name) {
  const radios = Array.from(
    form.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
  ).filter((r) => r.value !== "");
  return radios.map((r) => {
    const title = getRadioLabelText(r);
    return { const: r.value, title: title || r.value };
  });
}
function ariaRoleToSchema(el, role) {
  switch (role) {
    case "checkbox":
    case "switch":
      return { type: "boolean" };
    case "spinbutton":
    case "slider": {
      const prop = { type: "number" };
      const min = el.getAttribute("aria-valuemin");
      const max = el.getAttribute("aria-valuemax");
      if (min !== null)
        prop.minimum = parseFloat(min);
      if (max !== null)
        prop.maximum = parseFloat(max);
      return prop;
    }
    case "combobox": {
      const ownedId = el.getAttribute("aria-owns") ?? el.getAttribute("aria-controls");
      if (ownedId) {
        const listbox = document.getElementById(ownedId);
        if (listbox) {
          const options = Array.from(listbox.querySelectorAll('[role="option"]')).filter(
            (o) => o.getAttribute("aria-disabled") !== "true"
          );
          if (options.length > 0) {
            const enumValues = options.map((o) => (o.getAttribute("data-value") ?? o.textContent ?? "").trim()).filter(Boolean);
            const oneOf = options.map((o) => ({
              const: (o.getAttribute("data-value") ?? o.textContent ?? "").trim(),
              title: (o.textContent ?? "").trim()
            }));
            return { type: "string", enum: enumValues, oneOf };
          }
        }
      }
      return { type: "string" };
    }
    case "textbox":
    case "searchbox":
    case "radio":
    default:
      return { type: "string" };
  }
}
function getRadioLabelText(radio) {
  const parent = radio.closest("label");
  if (parent) {
    const clone = parent.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, button").forEach((el) => el.remove());
    const text = clone.textContent?.trim() ?? "";
    if (text)
      return text;
  }
  if (radio.id) {
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (label) {
      const text = label.textContent?.trim() ?? "";
      if (text)
        return text;
    }
  }
  return "";
}

// src/analyzer.ts
var formIndex = 0;
function analyzeForm(form, override) {
  const name = override?.name ?? inferToolName(form);
  const description = override?.description ?? inferToolDescription(form);
  const { schema: inputSchema, fieldElements } = buildSchema(form);
  return { name, description, inputSchema, fieldElements };
}
function inferToolName(form) {
  const nativeName = form.getAttribute("toolname");
  if (nativeName)
    return sanitizeName(nativeName);
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
  const nativeDesc = form.getAttribute("tooldescription");
  if (nativeDesc)
    return nativeDesc.trim();
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
  const fieldElements = /* @__PURE__ */ new Map();
  const processedRadioGroups = /* @__PURE__ */ new Set();
  const controls = Array.from(
    form.querySelectorAll(
      "input, textarea, select"
    )
  );
  for (const control of controls) {
    const name = control.name;
    const fieldKey = name || resolveNativeControlFallbackKey(control);
    if (!fieldKey)
      continue;
    if (control instanceof HTMLInputElement && control.type === "radio") {
      if (processedRadioGroups.has(fieldKey))
        continue;
      processedRadioGroups.add(fieldKey);
    }
    const schemaProp = inputTypeToSchema(control);
    if (!schemaProp)
      continue;
    schemaProp.title = inferFieldTitle(control);
    const desc = inferFieldDescription(control);
    if (desc)
      schemaProp.description = desc;
    if (control instanceof HTMLInputElement && control.type === "radio") {
      schemaProp.enum = collectRadioEnum(form, fieldKey);
      const radioOneOf = collectRadioOneOf(form, fieldKey);
      if (radioOneOf.length > 0)
        schemaProp.oneOf = radioOneOf;
    }
    properties[fieldKey] = schemaProp;
    if (!name) {
      fieldElements.set(fieldKey, control);
    }
    if (control.required) {
      required.push(fieldKey);
    }
  }
  const ariaControls = collectAriaControls(form);
  const processedAriaRadioGroups = /* @__PURE__ */ new Set();
  for (const { el, role, key } of ariaControls) {
    if (properties[key])
      continue;
    if (role === "radio") {
      if (processedAriaRadioGroups.has(key))
        continue;
      processedAriaRadioGroups.add(key);
    }
    const schemaProp = ariaRoleToSchema(el, role);
    schemaProp.title = inferAriaFieldTitle(el);
    const desc = inferAriaFieldDescription(el);
    if (desc)
      schemaProp.description = desc;
    properties[key] = schemaProp;
    fieldElements.set(key, el);
    if (el.getAttribute("aria-required") === "true") {
      required.push(key);
    }
  }
  return { schema: { type: "object", properties, required }, fieldElements };
}
function resolveNativeControlFallbackKey(control) {
  const el = control;
  if (el.dataset["webmcpName"])
    return sanitizeName(el.dataset["webmcpName"]);
  if (control.id)
    return sanitizeName(control.id);
  const label = control.getAttribute("aria-label");
  if (label)
    return sanitizeName(label);
  return null;
}
function collectAriaControls(form) {
  const selector = ARIA_ROLES_TO_SCAN.map((r) => `[role="${r}"]`).join(", ");
  const results = [];
  for (const el of Array.from(form.querySelectorAll(selector))) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
      continue;
    if (el.getAttribute("aria-hidden") === "true" || el.hidden)
      continue;
    const role = el.getAttribute("role");
    const key = resolveAriaFieldKey(el);
    if (!key)
      continue;
    results.push({ el, role, key });
  }
  return results;
}
function resolveAriaFieldKey(el) {
  const htmlEl = el;
  if (htmlEl.dataset?.["webmcpName"])
    return sanitizeName(htmlEl.dataset["webmcpName"]);
  if (el.id)
    return sanitizeName(el.id);
  const label = el.getAttribute("aria-label");
  if (label)
    return sanitizeName(label);
  const labelledById = el.getAttribute("aria-labelledby");
  if (labelledById) {
    const text = document.getElementById(labelledById)?.textContent?.trim();
    if (text)
      return sanitizeName(text);
  }
  return null;
}
function inferAriaFieldTitle(el) {
  const htmlEl = el;
  if (htmlEl.dataset?.["webmcpTitle"])
    return htmlEl.dataset["webmcpTitle"];
  const label = el.getAttribute("aria-label");
  if (label)
    return label.trim();
  const labelledById = el.getAttribute("aria-labelledby");
  if (labelledById) {
    const text = document.getElementById(labelledById)?.textContent?.trim();
    if (text)
      return text;
  }
  if (el.id)
    return humanizeName(el.id);
  return "";
}
function inferAriaFieldDescription(el) {
  const nativeParamDesc = el.getAttribute("toolparamdescription");
  if (nativeParamDesc)
    return nativeParamDesc.trim();
  const htmlEl = el;
  if (htmlEl.dataset?.["webmcpDescription"])
    return htmlEl.dataset["webmcpDescription"];
  const ariaDesc = el.getAttribute("aria-description");
  if (ariaDesc)
    return ariaDesc;
  const describedById = el.getAttribute("aria-describedby");
  if (describedById) {
    const text = document.getElementById(describedById)?.textContent?.trim();
    if (text)
      return text;
  }
  const placeholder = el.getAttribute("placeholder") ?? el.dataset?.["placeholder"];
  if (placeholder)
    return placeholder.trim();
  return "";
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
  const nativeParamDesc = control.getAttribute("toolparamdescription");
  if (nativeParamDesc)
    return nativeParamDesc.trim();
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
var lastParams = /* @__PURE__ */ new WeakMap();
var formFieldElements = /* @__PURE__ */ new WeakMap();
var _inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
var _textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
var _checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
function buildExecuteHandler(form, config, toolName, metadata) {
  if (metadata?.fieldElements) {
    formFieldElements.set(form, metadata.fieldElements);
  }
  attachSubmitInterceptor(form, toolName);
  return async (params) => {
    fillFormFields(form, params);
    window.dispatchEvent(new CustomEvent("toolactivated", { detail: { toolName } }));
    return new Promise((resolve, reject) => {
      pendingExecutions.set(form, { resolve, reject });
      if (config.autoSubmit || form.hasAttribute("toolautosubmit") || form.dataset["webmcpAutosubmit"] !== void 0) {
        form.requestSubmit();
      }
    });
  };
}
function attachSubmitInterceptor(form, toolName) {
  if (form["__awmcp_intercepted"])
    return;
  form["__awmcp_intercepted"] = true;
  form.addEventListener("submit", (e) => {
    const pending = pendingExecutions.get(form);
    if (!pending)
      return;
    const { resolve } = pending;
    pendingExecutions.delete(form);
    const formData = serializeFormData(form, lastParams.get(form), formFieldElements.get(form));
    const text = `Form submitted. Fields: ${JSON.stringify(formData)}`;
    const result = { content: [{ type: "text", text }] };
    if (e.agentInvoked && typeof e.respondWith === "function") {
      e.preventDefault();
      e.respondWith(Promise.resolve(result));
    }
    resolve(result);
  });
  form.addEventListener("reset", () => {
    window.dispatchEvent(new CustomEvent("toolcancel", { detail: { toolName } }));
  });
}
function setReactValue(el, v) {
  el.focus();
  el.select?.();
  if (document.execCommand("insertText", false, v)) {
    return;
  }
  const setter = el instanceof HTMLTextAreaElement ? _textareaValueSetter : _inputValueSetter;
  if (setter) {
    setter.call(el, v);
  } else {
    el.value = v;
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: v }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function setReactChecked(el, checked) {
  if (_checkedSetter) {
    _checkedSetter.call(el, checked);
  } else {
    el.checked = checked;
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function findNativeField(form, key) {
  const esc = CSS.escape(key);
  return form.querySelector(`[name="${esc}"]`) ?? form.querySelector(
    `input#${esc}, textarea#${esc}, select#${esc}`
  );
}
function fillFormFields(form, params) {
  lastParams.set(form, params);
  const fieldEls = formFieldElements.get(form);
  for (const [key, value] of Object.entries(params)) {
    const input = findNativeField(form, key);
    if (input) {
      if (input instanceof HTMLInputElement) {
        fillInput(input, form, key, value);
      } else if (input instanceof HTMLTextAreaElement) {
        setReactValue(input, String(value ?? ""));
      } else if (input instanceof HTMLSelectElement) {
        input.value = String(value ?? "");
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      continue;
    }
    const ariaEl = fieldEls?.get(key);
    if (ariaEl) {
      if (ariaEl instanceof HTMLInputElement) {
        fillInput(ariaEl, form, key, value);
      } else if (ariaEl instanceof HTMLTextAreaElement) {
        setReactValue(ariaEl, String(value ?? ""));
      } else if (ariaEl instanceof HTMLSelectElement) {
        ariaEl.value = String(value ?? "");
        ariaEl.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        fillAriaField(ariaEl, value);
      }
    }
  }
}
function fillInput(input, form, key, value) {
  const type = input.type.toLowerCase();
  if (type === "checkbox") {
    setReactChecked(input, Boolean(value));
    return;
  }
  if (type === "radio") {
    const esc = CSS.escape(key);
    const radios = form.querySelectorAll(
      `input[type="radio"][name="${esc}"]`
    );
    for (const radio of radios) {
      if (radio.value === String(value)) {
        if (_checkedSetter) {
          _checkedSetter.call(radio, true);
        } else {
          radio.checked = true;
        }
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      }
    }
    return;
  }
  setReactValue(input, String(value ?? ""));
}
function fillAriaField(el, value) {
  const role = el.getAttribute("role");
  if (role === "checkbox" || role === "switch") {
    el.setAttribute("aria-checked", String(Boolean(value)));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return;
  }
  if (role === "radio") {
    el.setAttribute("aria-checked", "true");
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return;
  }
  const htmlEl = el;
  if (htmlEl.isContentEditable) {
    htmlEl.textContent = String(value ?? "");
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function serializeFormData(form, params, fieldEls) {
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
  if (params) {
    for (const key of Object.keys(params)) {
      if (key in result)
        continue;
      const el = findNativeField(form, key) ?? fieldEls?.get(key) ?? null;
      if (!el)
        continue;
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        result[key] = el.checked;
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        result[key] = el.value;
      } else {
        const role = el.getAttribute("role");
        if (role === "checkbox" || role === "switch") {
          result[key] = el.getAttribute("aria-checked") === "true";
        } else {
          result[key] = el.textContent?.trim() ?? "";
        }
      }
    }
  }
  return result;
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
  if (config.debug) {
    warnToolQuality(metadata.name, metadata.description);
  }
  const execute = buildExecuteHandler(form, config, metadata.name, metadata);
  await registerFormTool(form, metadata, execute);
  registeredForms.add(form);
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
  registeredForms.delete(form);
  if (config.debug) {
    console.debug(`[auto-webmcp] Unregistered: ${name}`);
  }
  emit("form:unregistered", form, name);
}
var observer = null;
var registeredForms = /* @__PURE__ */ new WeakSet();
var reAnalysisTimers = /* @__PURE__ */ new Map();
var RE_ANALYSIS_DEBOUNCE_MS = 300;
function isInterestingNode(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select")
    return true;
  const role = node.getAttribute("role");
  if (role && ARIA_ROLES_TO_SCAN.includes(role))
    return true;
  if (node.querySelector("input, textarea, select"))
    return true;
  for (const r of ARIA_ROLES_TO_SCAN) {
    if (node.querySelector(`[role="${r}"]`))
      return true;
  }
  return false;
}
function scheduleReAnalysis(form, config) {
  const existing = reAnalysisTimers.get(form);
  if (existing)
    clearTimeout(existing);
  reAnalysisTimers.set(
    form,
    setTimeout(() => {
      reAnalysisTimers.delete(form);
      void registerForm(form, config);
    }, RE_ANALYSIS_DEBOUNCE_MS)
  );
}
function startObserver(config) {
  if (observer)
    return;
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element))
          continue;
        if (node instanceof HTMLFormElement) {
          void registerForm(node, config);
          continue;
        }
        const parentForm = node.closest("form");
        if (parentForm instanceof HTMLFormElement && registeredForms.has(parentForm) && isInterestingNode(node)) {
          scheduleReAnalysis(parentForm, config);
        }
        for (const form of Array.from(node.querySelectorAll("form"))) {
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
  await Promise.allSettled(forms.map((form) => registerForm(form, config)));
}
function warnToolQuality(name, description) {
  if (/^form_\d+$|^submit$|^form$/.test(name)) {
    console.warn(`[auto-webmcp] Tool "${name}" has a generic name. Consider adding a toolname or data-webmcp-name attribute.`);
  }
  if (!description || description === "Submit form") {
    console.warn(`[auto-webmcp] Tool "${name}" has no meaningful description.`);
  }
  if (/don'?t|do not|never|avoid|not for/i.test(description)) {
    console.warn(`[auto-webmcp] Tool "${name}" description contains negative instructions. Per spec best practices, prefer positive descriptions.`);
  }
}
async function startDiscovery(config) {
  if (document.readyState === "loading") {
    await new Promise(
      (resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
    );
  }
  startObserver(config);
  listenForRouteChanges(config);
  await scanForms(config);
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
export {
  autoWebMCP
};
//# sourceMappingURL=auto-webmcp.esm.js.map
