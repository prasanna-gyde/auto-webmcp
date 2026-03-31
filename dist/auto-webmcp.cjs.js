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
  const toolDef = {
    name: metadata.name,
    description: metadata.description,
    inputSchema: metadata.inputSchema,
    execute
  };
  if (metadata.annotations && Object.keys(metadata.annotations).length > 0) {
    toolDef.annotations = metadata.annotations;
  }
  try {
    await navigator.modelContext.registerTool(toolDef);
  } catch {
    try {
      await navigator.modelContext.unregisterTool(metadata.name);
      await navigator.modelContext.registerTool(toolDef);
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
  const listId = input.getAttribute("list");
  if (listId) {
    const datalist = input.ownerDocument.getElementById(listId);
    if (datalist instanceof HTMLDataListElement) {
      const options = Array.from(datalist.options).filter(
        (o) => !o.disabled && o.value.trim() !== ""
      );
      if (options.length > 0) {
        prop.enum = options.map((o) => o.value.trim());
        prop.oneOf = options.map((o) => ({
          const: o.value.trim(),
          title: o.textContent?.trim() || o.value.trim()
        }));
      }
    }
  }
  return prop;
}
var PLACEHOLDER_PATTERNS = /^(select|choose|pick)\b|^--+|---/i;
function isPlaceholderOption(opt) {
  if (opt.disabled)
    return true;
  if (opt.value !== "")
    return false;
  return PLACEHOLDER_PATTERNS.test(opt.text.trim());
}
function mapSelectElement(select) {
  const enumValues = [];
  const oneOf = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      if (child.disabled)
        continue;
      const groupLabel = child.label?.trim() ?? "";
      for (const opt of Array.from(child.children)) {
        if (!(opt instanceof HTMLOptionElement))
          continue;
        if (isPlaceholderOption(opt))
          continue;
        enumValues.push(opt.value);
        const entry = {
          const: opt.value,
          title: opt.text.trim() || opt.value
        };
        if (groupLabel)
          entry.group = groupLabel;
        oneOf.push(entry);
      }
    } else if (child instanceof HTMLOptionElement) {
      if (isPlaceholderOption(child))
        continue;
      enumValues.push(child.value);
      oneOf.push({ const: child.value, title: child.text.trim() || child.value });
    }
  }
  if (enumValues.length === 0)
    return { type: "string" };
  if (select.multiple) {
    return { type: "array", items: { type: "string", enum: enumValues } };
  }
  return { type: "string", enum: enumValues, oneOf };
}
function collectCheckboxEnum(form, name) {
  return Array.from(
    form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`)
  ).map((cb) => cb.value).filter((v) => v !== "" && v !== "on");
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
  const annotations = inferAnnotations(form);
  return { name, description, inputSchema, annotations, fieldElements };
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
    return `${heading}: ${pageTitle}`;
  if (heading)
    return heading;
  if (pageTitle)
    return pageTitle;
  return "Submit form";
}
var READONLY_BUTTON_PATTERNS = /^(search|find|look|filter|browse|view|show|check|preview|get|fetch|retrieve|load)\b/i;
var DESTRUCTIVE_BUTTON_PATTERNS = /^(delete|remove|cancel|terminate|destroy|purge|revoke|unsubscribe|deactivate)\b/i;
var DESTRUCTIVE_URL_PATTERNS = /\/(delete|remove|cancel|destroy)\b/i;
function inferAnnotations(form) {
  const annotations = {};
  if (form.dataset["webmcpReadonly"] !== void 0) {
    annotations.readOnlyHint = form.dataset["webmcpReadonly"] !== "false";
  }
  if (form.dataset["webmcpDestructive"] !== void 0) {
    annotations.destructiveHint = form.dataset["webmcpDestructive"] !== "false";
  }
  if (form.dataset["webmcpIdempotent"] !== void 0) {
    annotations.idempotentHint = form.dataset["webmcpIdempotent"] !== "false";
  }
  if (form.dataset["webmcpOpenworld"] !== void 0) {
    annotations.openWorldHint = form.dataset["webmcpOpenworld"] !== "false";
  }
  if (annotations.readOnlyHint === void 0) {
    const isGet = form.method.toLowerCase() === "get";
    const submitText = getSubmitButtonText(form);
    const isReadLabel = submitText ? READONLY_BUTTON_PATTERNS.test(submitText.trim()) : false;
    if (isGet || isReadLabel)
      annotations.readOnlyHint = true;
  }
  if (annotations.destructiveHint === void 0) {
    const submitText = getSubmitButtonText(form);
    const isDestructiveLabel = submitText ? DESTRUCTIVE_BUTTON_PATTERNS.test(submitText.trim()) : false;
    const isDestructiveUrl = form.action ? DESTRUCTIVE_URL_PATTERNS.test(form.action) : false;
    if (isDestructiveLabel || isDestructiveUrl)
      annotations.destructiveHint = true;
  }
  if (annotations.idempotentHint === void 0) {
    if (annotations.readOnlyHint === true || form.method.toLowerCase() === "get") {
      annotations.idempotentHint = true;
    }
  }
  if (annotations.openWorldHint === void 0) {
    annotations.openWorldHint = annotations.readOnlyHint !== true;
  }
  const hasNonDefault = annotations.readOnlyHint === true || annotations.destructiveHint === true || annotations.idempotentHint === true || annotations.openWorldHint === false;
  return hasNonDefault ? annotations : {};
}
function extractDefaultValue(control) {
  if (control instanceof HTMLInputElement) {
    const type = control.type.toLowerCase();
    if (type === "checkbox")
      return control.checked ? true : void 0;
    if (type === "radio")
      return void 0;
    if (type === "number" || type === "range") {
      return control.value !== "" ? parseFloat(control.value) : void 0;
    }
    return control.value !== "" ? control.value : void 0;
  }
  if (control instanceof HTMLTextAreaElement) {
    return control.value !== "" ? control.value : void 0;
  }
  if (control instanceof HTMLSelectElement) {
    if (control.multiple) {
      const selected = Array.from(control.options).filter((o) => o.selected).map((o) => o.value);
      return selected.length > 0 ? selected : void 0;
    }
    return control.value !== "" ? control.value : void 0;
  }
  return void 0;
}
function collectShadowControls(root, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(root))
    return [];
  visited.add(root);
  const results = [];
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el.shadowRoot) {
      const found = Array.from(
        el.shadowRoot.querySelectorAll(
          "input, textarea, select"
        )
      );
      if (found.length > 0) {
        console.log(`[auto-webmcp] shadow: found ${found.length} control(s) in ${el.tagName.toLowerCase()} shadow root:`, found.map((f) => `${f.tagName.toLowerCase()}[type=${f.type ?? "?"}][name="${f.name}"][id="${f.id}"]`));
      }
      results.push(...found, ...collectShadowControls(el.shadowRoot, visited));
    }
  }
  return results;
}
function buildSchema(form) {
  const properties = {};
  const required = [];
  const fieldElements = /* @__PURE__ */ new Map();
  const processedRadioGroups = /* @__PURE__ */ new Set();
  const processedCheckboxGroups = /* @__PURE__ */ new Set();
  const controls = [
    ...Array.from(
      form.querySelectorAll(
        "input, textarea, select"
      )
    ),
    ...collectShadowControls(form)
  ];
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
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      if (processedCheckboxGroups.has(fieldKey))
        continue;
      processedCheckboxGroups.add(fieldKey);
    }
    const schemaProp = inputTypeToSchema(control);
    if (!schemaProp)
      continue;
    if (!isControlVisible(control))
      continue;
    schemaProp.title = inferFieldTitle(control);
    const desc = inferFieldDescription(control);
    if (desc)
      schemaProp.description = desc;
    const defaultVal = extractDefaultValue(control);
    if (defaultVal !== void 0)
      schemaProp.default = defaultVal;
    if (control instanceof HTMLInputElement && control.type === "radio") {
      schemaProp.enum = collectRadioEnum(form, fieldKey);
      const radioOneOf = collectRadioOneOf(form, fieldKey);
      if (radioOneOf.length > 0)
        schemaProp.oneOf = radioOneOf;
      const checkedRadio = form.querySelector(
        `input[type="radio"][name="${CSS.escape(fieldKey)}"]:checked`
      );
      if (checkedRadio?.value)
        schemaProp.default = checkedRadio.value;
    }
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      const checkboxValues = collectCheckboxEnum(form, fieldKey);
      if (checkboxValues.length > 1) {
        const arrayProp = {
          type: "array",
          items: { type: "string", enum: checkboxValues },
          title: schemaProp.title
        };
        if (schemaProp.description)
          arrayProp.description = schemaProp.description;
        const checkedBoxes = Array.from(
          form.querySelectorAll(
            `input[type="checkbox"][name="${CSS.escape(fieldKey)}"]:checked`
          )
        ).map((b) => b.value);
        if (checkedBoxes.length > 0)
          arrayProp.default = checkedBoxes;
        properties[fieldKey] = arrayProp;
        if (control.required)
          required.push(fieldKey);
        continue;
      }
    }
    properties[fieldKey] = schemaProp;
    if (!name) {
      fieldElements.set(fieldKey, control);
    }
    let isRequired = control.required;
    if (!isRequired) {
      let hostNode = control;
      while (true) {
        const root = hostNode.getRootNode();
        if (!(root instanceof ShadowRoot))
          break;
        const host = root.host;
        if (host.hasAttribute("required") || host.getAttribute("aria-required") === "true") {
          isRequired = true;
          break;
        }
        hostNode = host;
      }
    }
    if (isRequired)
      required.push(fieldKey);
  }
  const ariaControls = collectAriaControls(form);
  const processedAriaRadioGroups = /* @__PURE__ */ new Set();
  for (const { el, role, key, enumValues, enumOneOf } of ariaControls) {
    if (properties[key])
      continue;
    if (role === "radio") {
      if (processedAriaRadioGroups.has(key))
        continue;
      processedAriaRadioGroups.add(key);
    }
    const schemaProp = ariaRoleToSchema(el, role);
    if (enumValues && enumValues.length > 0) {
      schemaProp.enum = enumValues;
      if (enumOneOf && enumOneOf.length > 0)
        schemaProp.oneOf = enumOneOf;
    }
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
  return { schema: { "$schema": "https://json-schema.org/draft/2020-12/schema", type: "object", properties, required }, fieldElements };
}
var AUTO_GENERATED_ID_RE = /^_r_[0-9a-z]+_$|^:[a-z0-9]+:$/i;
function resolveNativeControlFallbackKey(control) {
  const el = control;
  if (el.dataset["webmcpName"])
    return sanitizeName(el.dataset["webmcpName"]);
  if (control.id && !AUTO_GENERATED_ID_RE.test(control.id))
    return sanitizeName(control.id);
  const label = control.getAttribute("aria-label");
  if (label)
    return sanitizeName(label);
  if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && control.placeholder?.trim()) {
    return sanitizeName(control.placeholder.trim());
  }
  const hostKey = resolveShadowHostKey(control);
  if (hostKey)
    return hostKey;
  if (control instanceof HTMLInputElement && control.type !== "text") {
    return control.type;
  }
  return null;
}
function resolveShadowHostKey(el) {
  let node = el;
  while (true) {
    const root = node.getRootNode();
    if (!(root instanceof ShadowRoot))
      break;
    const host = root.host;
    const fieldName = host.getAttribute("field-name");
    if (fieldName) {
      console.log("[auto-webmcp] shadow host key: field-name=", fieldName);
      return sanitizeName(fieldName);
    }
    const hostLabel = host.getAttribute("label") || host.getAttribute("aria-label");
    if (hostLabel) {
      console.log("[auto-webmcp] shadow host key: label=", hostLabel);
      return sanitizeName(hostLabel);
    }
    const hostName = host.getAttribute("name");
    if (hostName) {
      console.log("[auto-webmcp] shadow host key: name=", hostName);
      return sanitizeName(hostName);
    }
    node = host;
  }
  return null;
}
function resolveAriaElementKey(el) {
  if (el.dataset["webmcpName"])
    return sanitizeName(el.dataset["webmcpName"]);
  if (el.id && !AUTO_GENERATED_ID_RE.test(el.id))
    return sanitizeName(el.id);
  const label = el.getAttribute("aria-label");
  if (label)
    return sanitizeName(label);
  const placeholder = el.getAttribute("placeholder");
  if (placeholder)
    return sanitizeName(placeholder);
  return null;
}
function collectAriaControls(form) {
  const selector = ARIA_ROLES_TO_SCAN.map((r) => `[role="${r}"]`).join(", ");
  const rawResults = [];
  for (const el of Array.from(form.querySelectorAll(selector))) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
      continue;
    if (el.getAttribute("aria-hidden") === "true" || el.hidden)
      continue;
    const role = el.getAttribute("role");
    const key = resolveAriaFieldKey(el);
    if (!key)
      continue;
    rawResults.push({ el, role, key });
  }
  const radioEntries = rawResults.filter((e) => e.role === "radio");
  const nonRadioEntries = rawResults.filter((e) => e.role !== "radio");
  const radioGroupMap = /* @__PURE__ */ new Map();
  const ungroupedRadios = [];
  for (const entry of radioEntries) {
    const group = entry.el.closest('[role="radiogroup"]');
    if (group) {
      if (!radioGroupMap.has(group))
        radioGroupMap.set(group, []);
      radioGroupMap.get(group).push(entry.el);
    } else {
      ungroupedRadios.push(entry);
    }
  }
  const groupedEntries = [];
  for (const [group, members] of radioGroupMap) {
    const groupKey = resolveAriaFieldKey(group);
    if (!groupKey)
      continue;
    const enumValues = members.map((el) => (el.getAttribute("data-value") ?? el.getAttribute("aria-label") ?? el.textContent ?? "").trim()).filter(Boolean);
    const enumOneOf = members.map((el) => {
      const val = (el.getAttribute("data-value") ?? el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
      const title = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
      return { const: val, title: title || val };
    }).filter((e) => e.const !== "");
    if (enumValues.length > 0) {
      groupedEntries.push({ el: group, role: "radio", key: groupKey, enumValues, enumOneOf });
    }
  }
  return [...nonRadioEntries, ...groupedEntries, ...ungroupedRadios];
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
  if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && control.placeholder?.trim()) {
    return control.placeholder.trim();
  }
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
  const ownRoot = control.getRootNode();
  if (ownRoot instanceof ShadowRoot) {
    if (control.id) {
      const shadowLabel = ownRoot.querySelector(`label[for="${CSS.escape(control.id)}"]`);
      if (shadowLabel) {
        const text = labelTextWithoutNested(shadowLabel);
        if (text)
          return text;
      }
    }
    const anyLabel = ownRoot.querySelector("label");
    if (anyLabel) {
      const text = labelTextWithoutNested(anyLabel);
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
  let node = control;
  while (true) {
    const root = node.getRootNode();
    if (!(root instanceof ShadowRoot))
      break;
    const host = root.host;
    const hostLabel = host.getAttribute("label") || host.getAttribute("aria-label");
    if (hostLabel)
      return hostLabel;
    node = host;
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
function isControlVisible(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none")
    return false;
  if (style.visibility === "hidden")
    return false;
  if (el.offsetParent === null && style.position !== "fixed")
    return false;
  let node = el;
  while (node && node !== document.body) {
    if (node.getAttribute("aria-hidden") === "true")
      return false;
    node = node.parentElement;
  }
  if (el.closest("fieldset")?.disabled)
    return false;
  return true;
}
function analyzeOrphanInputGroup(container, inputs, submitBtn) {
  const name = inferOrphanToolName(container, submitBtn);
  const description = inferOrphanToolDescription(container);
  const { schema: inputSchema, fieldElements } = buildSchemaFromInputs(inputs);
  const annotations = inferOrphanAnnotations(submitBtn);
  return { name, description, inputSchema, annotations, fieldElements };
}
function inferOrphanAnnotations(submitBtn) {
  const annotations = {};
  const submitText = submitBtn instanceof HTMLInputElement ? submitBtn.value.trim() : submitBtn?.textContent?.trim() ?? "";
  if (READONLY_BUTTON_PATTERNS.test(submitText)) {
    annotations.readOnlyHint = true;
    annotations.idempotentHint = true;
  }
  if (DESTRUCTIVE_BUTTON_PATTERNS.test(submitText)) {
    annotations.destructiveHint = true;
  }
  if (annotations.readOnlyHint !== true) {
    annotations.openWorldHint = true;
  }
  const hasNonDefault = annotations.readOnlyHint === true || annotations.destructiveHint === true || annotations.idempotentHint === true || annotations.openWorldHint === false;
  return hasNonDefault ? annotations : {};
}
function inferOrphanToolName(container, submitBtn) {
  if (submitBtn) {
    const text = submitBtn instanceof HTMLInputElement ? submitBtn.value.trim() : submitBtn.textContent?.trim() ?? "";
    if (text && text.length > 0 && text.length < 80)
      return sanitizeName(text);
  }
  const heading = getNearestHeadingTextFrom(container);
  if (heading)
    return sanitizeName(heading);
  const title = document.title?.trim();
  if (title)
    return sanitizeName(title);
  return `form_${++formIndex}`;
}
function inferOrphanToolDescription(container) {
  const heading = getNearestHeadingTextFrom(container);
  const pageTitle = document.title?.trim();
  if (heading && pageTitle && heading !== pageTitle)
    return `${heading} on ${pageTitle}`;
  if (heading)
    return heading;
  if (pageTitle)
    return pageTitle;
  return "Submit form";
}
function getNearestHeadingTextFrom(el) {
  const inner = el.querySelector("h1, h2, h3");
  if (inner?.textContent?.trim())
    return inner.textContent.trim();
  let node = el;
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
function buildSchemaFromInputs(inputs) {
  const properties = {};
  const required = [];
  const fieldElements = /* @__PURE__ */ new Map();
  const processedRadioGroups = /* @__PURE__ */ new Set();
  const processedCheckboxGroups = /* @__PURE__ */ new Set();
  for (const control of inputs) {
    if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement) && !(control instanceof HTMLSelectElement)) {
      const fieldKey2 = resolveAriaElementKey(control);
      if (!fieldKey2)
        continue;
      if (!isControlVisible(control))
        continue;
      const prop = { type: "string" };
      prop.title = control.getAttribute("aria-label") ?? fieldKey2;
      const desc2 = control.getAttribute("aria-description") ?? control.getAttribute("aria-describedby") ? null : null;
      if (desc2)
        prop.description = desc2;
      properties[fieldKey2] = prop;
      fieldElements.set(fieldKey2, control);
      required.push(fieldKey2);
      continue;
    }
    const rawName = control.name;
    const fieldKey = (rawName ? sanitizeName(rawName) : null) || resolveNativeControlFallbackKey(control);
    if (!fieldKey)
      continue;
    if (control instanceof HTMLInputElement && control.type === "radio") {
      if (processedRadioGroups.has(fieldKey))
        continue;
      processedRadioGroups.add(fieldKey);
    }
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      if (processedCheckboxGroups.has(fieldKey))
        continue;
      processedCheckboxGroups.add(fieldKey);
    }
    const schemaProp = inputTypeToSchema(control);
    if (!schemaProp)
      continue;
    if (!isControlVisible(control))
      continue;
    schemaProp.title = inferFieldTitle(control);
    const desc = inferFieldDescription(control);
    if (desc)
      schemaProp.description = desc;
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      const checkboxValues = inputs.filter((i) => i instanceof HTMLInputElement && i.type === "checkbox" && i.name === fieldKey).map((cb) => cb.value).filter((v) => v !== "" && v !== "on");
      if (checkboxValues.length > 1) {
        const arrayProp = {
          type: "array",
          items: { type: "string", enum: checkboxValues },
          title: schemaProp.title
        };
        if (schemaProp.description)
          arrayProp.description = schemaProp.description;
        properties[fieldKey] = arrayProp;
        if (control.required)
          required.push(fieldKey);
        continue;
      }
    }
    properties[fieldKey] = schemaProp;
    if (!rawName)
      fieldElements.set(fieldKey, control);
    if (control.required)
      required.push(fieldKey);
  }
  return { schema: { "$schema": "https://json-schema.org/draft/2020-12/schema", type: "object", properties, required }, fieldElements };
}

// src/discovery.ts
init_registry();

// src/interceptor.ts
var pendingExecutions = /* @__PURE__ */ new WeakMap();
var lastParams = /* @__PURE__ */ new WeakMap();
var formFieldElements = /* @__PURE__ */ new WeakMap();
var pendingWarnings = /* @__PURE__ */ new WeakMap();
var pendingFillWarnings = /* @__PURE__ */ new WeakMap();
var lastFilledSnapshot = /* @__PURE__ */ new WeakMap();
var _inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
var _textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
var _checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
function buildExecuteHandler(form, config, toolName, metadata) {
  if (metadata?.fieldElements) {
    formFieldElements.set(form, metadata.fieldElements);
  }
  attachSubmitInterceptor(form, toolName);
  return async (params) => {
    pendingFillWarnings.set(form, []);
    pendingWarnings.delete(form);
    fillFormFields(form, params);
    const missingNow = getMissingRequired(metadata, params);
    if (missingNow.length > 0)
      pendingWarnings.set(form, missingNow);
    window.dispatchEvent(new CustomEvent("toolactivated", { detail: { toolName } }));
    return new Promise((resolve, reject) => {
      pendingExecutions.set(form, { resolve, reject });
      if (config.autoSubmit || form.hasAttribute("toolautosubmit") || form.dataset["webmcpAutosubmit"] !== void 0) {
        waitForDomStable(form).then(async () => {
          try {
            fillFormFields(form, params);
            for (let attempt = 0; attempt < 2; attempt++) {
              const reset = getResetFields(form, params, formFieldElements.get(form));
              if (reset.length === 0)
                break;
              fillFormFields(form, params);
              await waitForDomStable(form, 400, 100);
            }
            let submitForm = form;
            if (!form.isConnected) {
              const liveBtn = document.querySelector(
                'button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])'
              );
              const found = liveBtn?.closest("form");
              if (found) {
                submitForm = found;
                pendingExecutions.set(submitForm, { resolve, reject });
                attachSubmitInterceptor(submitForm, toolName);
              }
            }
            if (submitForm !== form && pendingWarnings.has(form)) {
              pendingWarnings.set(submitForm, pendingWarnings.get(form));
              pendingWarnings.delete(form);
            }
            submitForm.requestSubmit();
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
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
    lastFilledSnapshot.delete(form);
    const missingRequired = pendingWarnings.get(form) ?? [];
    pendingWarnings.delete(form);
    const fillWarnings = pendingFillWarnings.get(form) ?? [];
    pendingFillWarnings.delete(form);
    const skippedFields = fillWarnings.filter((w) => w.type === "not_filled").map((w) => w.field);
    const structured = {
      status: missingRequired.length > 0 || skippedFields.length > 0 ? "partial" : "success",
      filled_fields: formData,
      skipped_fields: skippedFields,
      missing_required: missingRequired,
      warnings: [
        ...missingRequired.map((f) => ({
          field: f,
          type: "missing_required",
          message: `required field "${f}" was not provided`
        })),
        ...fillWarnings
      ]
    };
    const allWarnMessages = [
      ...missingRequired.length ? [`required fields were not filled: ${missingRequired.join(", ")}`] : [],
      ...fillWarnings.map((w) => w.message)
    ];
    const warningText = allWarnMessages.length ? ` Note: ${allWarnMessages.join("; ")}.` : "";
    const text = `Form submitted. Fields: ${JSON.stringify(formData)}${warningText}`;
    const result = {
      content: [
        { type: "text", text },
        { type: "text", text: JSON.stringify(structured) }
      ]
    };
    if (e.agentInvoked && typeof e.respondWith === "function") {
      e.preventDefault();
      e.respondWith(Promise.resolve(result));
    }
    resolve(result);
  });
  form.addEventListener("reset", () => {
    lastFilledSnapshot.delete(form);
    window.dispatchEvent(new CustomEvent("toolcancel", { detail: { toolName } }));
  });
}
function setReactValue(el, v) {
  el.focus();
  el.select?.();
  if (document.execCommand("insertText", false, v) && el.value === v) {
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
function findInShadowRoots(root, selector) {
  for (const host of Array.from(root.querySelectorAll("*"))) {
    const sr = host.shadowRoot;
    if (!sr)
      continue;
    const found = sr.querySelector(selector);
    if (found)
      return found;
    const deeper = findInShadowRoots(sr, selector);
    if (deeper)
      return deeper;
  }
  return null;
}
function findNativeField(form, key) {
  const esc = CSS.escape(key);
  const light = form.querySelector(`[name="${esc}"]`) ?? form.querySelector(
    `input#${esc}, textarea#${esc}, select#${esc}`
  );
  if (light)
    return light;
  return findInShadowRoots(document, `[name="${esc}"]`) ?? findInShadowRoots(document, `input#${esc}, textarea#${esc}, select#${esc}`);
}
function fillFormFields(form, params) {
  lastParams.set(form, params);
  const fieldEls = formFieldElements.get(form);
  const snapshot = {};
  for (const [key, value] of Object.entries(params)) {
    const input = findNativeField(form, key);
    if (input) {
      if (input instanceof HTMLInputElement) {
        fillInput(input, form, key, value);
        if (input.type === "checkbox") {
          if (Array.isArray(value)) {
            const esc = CSS.escape(key);
            snapshot[key] = Array.from(
              form.querySelectorAll(`input[type="checkbox"][name="${esc}"]`)
            ).filter((b) => b.checked).map((b) => b.value);
          } else {
            snapshot[key] = input.checked;
          }
        } else {
          snapshot[key] = input.value;
        }
      } else if (input instanceof HTMLTextAreaElement) {
        setReactValue(input, String(value ?? ""));
        snapshot[key] = input.value;
      } else if (input instanceof HTMLSelectElement) {
        fillSelectElement(input, value, form, key);
        snapshot[key] = input.multiple ? Array.from(input.options).filter((o) => o.selected).map((o) => o.value) : input.value;
      }
      continue;
    }
    const ariaEl = fieldEls?.get(key);
    if (ariaEl) {
      let effectiveEl = ariaEl;
      if (!ariaEl.isConnected) {
        const elId = ariaEl.id;
        if (elId) {
          const fresh = document.getElementById(elId) ?? findInShadowRoots(document, `#${CSS.escape(elId)}`);
          if (fresh)
            effectiveEl = fresh;
        }
      }
      if (effectiveEl instanceof HTMLInputElement) {
        fillInput(effectiveEl, form, key, value);
        snapshot[key] = effectiveEl.type === "checkbox" ? effectiveEl.checked : effectiveEl.value;
      } else if (effectiveEl instanceof HTMLTextAreaElement) {
        setReactValue(effectiveEl, String(value ?? ""));
        snapshot[key] = effectiveEl.value;
      } else if (effectiveEl instanceof HTMLSelectElement) {
        fillSelectElement(effectiveEl, value, form, key);
        snapshot[key] = effectiveEl.multiple ? Array.from(effectiveEl.options).filter((o) => o.selected).map((o) => o.value) : effectiveEl.value;
      } else {
        fillAriaField(effectiveEl, value);
        snapshot[key] = value;
      }
    }
  }
  lastFilledSnapshot.set(form, snapshot);
  window["__lastFillWarnings"] = pendingFillWarnings.get(form) ?? [];
}
function fillInput(input, form, key, value) {
  const type = input.type.toLowerCase();
  if (type === "checkbox") {
    if (Array.isArray(value)) {
      const esc = CSS.escape(key);
      const allBoxes = form.querySelectorAll(`input[type="checkbox"][name="${esc}"]`);
      for (const box of allBoxes) {
        setReactChecked(box, value.map(String).includes(box.value));
      }
      return;
    }
    setReactChecked(input, Boolean(value));
    return;
  }
  if (type === "number" || type === "range") {
    const raw = String(value ?? "");
    const num = Number(raw);
    if (raw === "" || isNaN(num)) {
      pendingFillWarnings.get(form)?.push({
        field: key,
        type: "type_mismatch",
        message: `"${key}" expects a number, got: ${JSON.stringify(value)}`,
        original: value
      });
      return;
    }
    const min = input.min !== "" ? parseFloat(input.min) : -Infinity;
    const max = input.max !== "" ? parseFloat(input.max) : Infinity;
    if (num < min || num > max) {
      const clamped = Math.min(Math.max(num, min), max);
      pendingFillWarnings.get(form)?.push({
        field: key,
        type: "clamped",
        message: `"${key}" value ${num} is outside allowed range [${input.min || "?"}, ${input.max || "?"}], clamped to ${clamped}`,
        original: num,
        actual: clamped
      });
      input.value = String(clamped);
    } else {
      input.value = String(num);
    }
    input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: String(num) }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
function fillSelectElement(select, value, form, key) {
  if (select.multiple) {
    const vals = Array.isArray(value) ? value.map(String) : [String(value ?? "")];
    for (const opt of Array.from(select.options)) {
      opt.selected = vals.includes(opt.value);
    }
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const strVal = String(value ?? "");
  select.value = strVal;
  if (select.value !== strVal) {
    const lower = strVal.toLowerCase();
    const byLabel = Array.from(select.options).find(
      (o) => o.text.trim().toLowerCase() === lower || o.label.trim().toLowerCase() === lower
    );
    if (byLabel) {
      select.value = byLabel.value;
    } else if (form && key) {
      pendingFillWarnings.get(form)?.push({
        field: key,
        type: "not_filled",
        message: `"${key}" value "${strVal}" did not match any option in the select`,
        original: strVal
      });
    }
  }
  select.dispatchEvent(new Event("change", { bubbles: true }));
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
  if (role === "radiogroup") {
    const radios = Array.from(el.querySelectorAll('[role="radio"]'));
    for (const radio of radios) {
      const val = (radio.getAttribute("data-value") ?? radio.getAttribute("aria-label") ?? radio.textContent ?? "").trim();
      if (val === String(value)) {
        radio.setAttribute("aria-checked", "true");
        radio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        for (const other of radios) {
          if (other !== radio)
            other.setAttribute("aria-checked", "false");
        }
        break;
      }
    }
    return;
  }
  const htmlEl = el;
  console.log("[auto-webmcp] fillAriaField", {
    tag: el.tagName,
    role,
    isContentEditable: htmlEl.isContentEditable,
    id: el.id,
    ariaLabel: el.getAttribute("aria-label"),
    textContentBefore: (htmlEl.textContent ?? "").slice(0, 80)
  });
  if (htmlEl.isContentEditable) {
    htmlEl.focus();
    const range = document.createRange();
    range.selectNodeContents(htmlEl);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const text = String(value ?? "");
    console.log("[auto-webmcp] fillAriaField: text to insert:", JSON.stringify(text));
    let inserted = false;
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      htmlEl.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dt
      }));
      inserted = (htmlEl.textContent ?? "").trim().length > 0;
      console.log("[auto-webmcp] fillAriaField: S1 paste result:", inserted, JSON.stringify((htmlEl.textContent ?? "").slice(0, 80)));
    } catch (e) {
      console.log("[auto-webmcp] fillAriaField: S1 paste threw:", e);
    }
    if (!inserted) {
      const ok = document.execCommand("insertText", false, text);
      inserted = (htmlEl.textContent ?? "").trim().length > 0;
      console.log("[auto-webmcp] fillAriaField: S2 execCommand result:", ok, "inserted:", inserted, JSON.stringify((htmlEl.textContent ?? "").slice(0, 80)));
    }
    if (!inserted) {
      try {
        htmlEl.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "insertText",
          data: text
        }));
        inserted = (htmlEl.textContent ?? "").trim().length > 0;
        console.log("[auto-webmcp] fillAriaField: S3 beforeinput result:", inserted, JSON.stringify((htmlEl.textContent ?? "").slice(0, 80)));
      } catch (e) {
        console.log("[auto-webmcp] fillAriaField: S3 beforeinput threw:", e);
      }
    }
    if (!inserted) {
      htmlEl.textContent = text;
      const r2 = document.createRange();
      r2.selectNodeContents(htmlEl);
      r2.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(r2);
      console.log("[auto-webmcp] fillAriaField: S4 textContent assignment done, textContent:", JSON.stringify((htmlEl.textContent ?? "").slice(0, 80)));
    }
    htmlEl.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text
    }));
    console.log("[auto-webmcp] fillAriaField: done, final textContent:", JSON.stringify((htmlEl.textContent ?? "").slice(0, 80)));
  } else {
    console.log("[auto-webmcp] fillAriaField: not contentEditable, dispatching input/change only");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
function serializeFormData(form, params, fieldEls) {
  const result = {};
  const data = new FormData(form);
  const snapshot = lastFilledSnapshot.get(form);
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
      if (snapshot && key in snapshot) {
        result[key] = snapshot[key];
        continue;
      }
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
function fillElement(el, value) {
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (type === "checkbox") {
      setReactChecked(el, Boolean(value));
    } else if (type === "radio") {
      if (el.value === String(value)) {
        if (_checkedSetter)
          _checkedSetter.call(el, true);
        else
          el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      setReactValue(el, String(value ?? ""));
    }
  } else if (el instanceof HTMLTextAreaElement) {
    setReactValue(el, String(value ?? ""));
  } else if (el instanceof HTMLSelectElement) {
    fillSelectElement(el, value);
  } else {
    fillAriaField(el, value);
  }
}
function waitForDomStable(form, maxMs = 800, debounceMs = 150) {
  return new Promise((resolve) => {
    let settled = false;
    let debounceTimer = null;
    const settle = () => {
      if (settled)
        return;
      settled = true;
      observer2.disconnect();
      if (debounceTimer !== null)
        clearTimeout(debounceTimer);
      resolve();
    };
    const observer2 = new MutationObserver(() => {
      if (debounceTimer !== null)
        clearTimeout(debounceTimer);
      debounceTimer = setTimeout(settle, debounceMs);
    });
    observer2.observe(form, { childList: true, subtree: true, attributes: true, characterData: true });
    setTimeout(settle, maxMs);
    debounceTimer = setTimeout(settle, debounceMs);
  });
}
function getResetFields(form, params, fieldEls) {
  const reset = [];
  for (const [key, expected] of Object.entries(params)) {
    const el = findNativeField(form, key) ?? (fieldEls?.get(key) ?? null);
    if (!el)
      continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      if (el.checked !== Boolean(expected))
        reset.push(key);
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.value !== String(expected ?? ""))
        reset.push(key);
    }
  }
  return reset;
}
function getMissingRequired(metadata, params) {
  if (!metadata?.inputSchema?.required?.length)
    return [];
  return metadata.inputSchema.required.filter((fieldKey) => !(fieldKey in params));
}
async function fillComboboxButton(el, value) {
  const text = String(value ?? "").trim();
  console.log("[auto-webmcp] fillComboboxButton: clicking button, value=", JSON.stringify(text));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  const listbox = await new Promise((resolve) => {
    const deadline = Date.now() + 1e3;
    const poll = () => {
      const candidate = document.querySelector('[role="listbox"]') ?? document.querySelector('[role="option"]')?.closest('[role="listbox"]') ?? null;
      if (candidate) {
        resolve(candidate);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }
      setTimeout(poll, 50);
    };
    poll();
  });
  if (!listbox) {
    console.warn("[auto-webmcp] fillComboboxButton: listbox did not appear after 1s");
    return;
  }
  const options = Array.from(listbox.querySelectorAll('[role="option"]'));
  console.log("[auto-webmcp] fillComboboxButton: listbox has", options.length, "options");
  const lowerValue = text.toLowerCase();
  const match = options.find((opt) => {
    const dataValue = (opt.getAttribute("data-value") ?? "").toLowerCase();
    const ariaLabel = (opt.getAttribute("aria-label") ?? "").toLowerCase();
    const optText = (opt.textContent ?? "").trim().toLowerCase();
    return dataValue === lowerValue || ariaLabel === lowerValue || optText === lowerValue;
  });
  if (match) {
    console.log("[auto-webmcp] fillComboboxButton: clicking option", match.textContent?.trim());
    match.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  } else {
    console.warn(
      "[auto-webmcp] fillComboboxButton: no option matched",
      JSON.stringify(text),
      "available:",
      options.map((o) => o.textContent?.trim())
    );
  }
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
  const metadata = analyzeForm(form, override);
  if (config.debug) {
    warnToolQuality(metadata.name, metadata.description);
  }
  const execute = buildExecuteHandler(form, config, metadata.name, metadata);
  await registerFormTool(form, metadata, execute);
  registeredForms.add(form);
  registeredFormCount++;
  const formSubmitBtn = form.querySelector(
    '[type="submit"], button[data-variant="primary"], button:not([type])'
  ) ?? null;
  const pendingBtns = window["__pendingSubmitBtns"] ??= {};
  pendingBtns[metadata.name] = formSubmitBtn;
  if (config.debug) {
    console.log(`[auto-webmcp] Registered: ${metadata.name}`, metadata);
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
    console.log(`[auto-webmcp] Unregistered: ${name}`);
  }
  emit("form:unregistered", form, name);
}
var observer = null;
var registeredForms = /* @__PURE__ */ new WeakSet();
var registeredFormCount = 0;
var reAnalysisTimers = /* @__PURE__ */ new Map();
var RE_ANALYSIS_DEBOUNCE_MS = 300;
var orphanRescanTimer = null;
var ORPHAN_RESCAN_DEBOUNCE_MS = 500;
var registeredOrphanToolNames = /* @__PURE__ */ new Set();
function scheduleOrphanRescan(config) {
  if (orphanRescanTimer)
    clearTimeout(orphanRescanTimer);
  orphanRescanTimer = setTimeout(() => {
    orphanRescanTimer = null;
    void scanOrphanInputs(config);
  }, ORPHAN_RESCAN_DEBOUNCE_MS);
}
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
        if (isInterestingNode(node) && !node.closest("form")) {
          scheduleOrphanRescan(config);
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
var ORPHAN_EXCLUDED_TYPES = /* @__PURE__ */ new Set([
  "password",
  "hidden",
  "file",
  "submit",
  "reset",
  "button",
  "image"
]);
async function scanOrphanInputs(config) {
  if (!isWebMCPSupported())
    return;
  const SUBMIT_BTN_SELECTOR = '[type="submit"]:not([disabled]), button[data-variant="primary"]:not([disabled])';
  const SUBMIT_BTN_GROUPING_SELECTOR = '[type="submit"], button[data-variant="primary"]';
  const SUBMIT_TEXT_RE = /subscribe|submit|sign[\s-]?up|send|join|go|search|post|tweet|publish|save/i;
  const orphanInputs = Array.from(
    document.querySelectorAll(
      'input:not(form input), textarea:not(form textarea), select:not(form select), [role="textbox"]:not(form [role="textbox"]):not(input):not(textarea), [role="searchbox"]:not(form [role="searchbox"]):not(input):not(textarea), [contenteditable="true"]:not(form [contenteditable="true"]):not(input):not(textarea), button[role="combobox"]:not(form button[role="combobox"])'
    )
  ).filter((el) => {
    if (el instanceof HTMLInputElement && ORPHAN_EXCLUDED_TYPES.has(el.type.toLowerCase())) {
      console.log(`[auto-webmcp] orphan: skipping excluded type "${el.type}" (name="${el.name}" id="${el.id}")`);
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.log(`[auto-webmcp] orphan: skipping invisible input (name="${el.name}" id="${el.id}")`);
      return false;
    }
    return true;
  });
  console.log(`[auto-webmcp] orphan: found ${orphanInputs.length} visible orphan input(s)`);
  if (orphanInputs.length === 0)
    return;
  const groups = /* @__PURE__ */ new Map();
  for (const input of orphanInputs) {
    let container = input.parentElement;
    let foundContainer = input.parentElement ?? document.body;
    while (container && container !== document.body) {
      const hasSubmitBtn = container.querySelector(SUBMIT_BTN_GROUPING_SELECTOR) !== null || Array.from(container.querySelectorAll("button")).some(
        (b) => SUBMIT_TEXT_RE.test(b.textContent ?? "")
      );
      if (hasSubmitBtn) {
        foundContainer = container;
        break;
      }
      container = container.parentElement;
    }
    console.log(`[auto-webmcp] orphan: input (name="${input.name}" id="${input.id}") grouped into container`, foundContainer);
    if (!groups.has(foundContainer))
      groups.set(foundContainer, []);
    groups.get(foundContainer).push(input);
  }
  console.log(`[auto-webmcp] orphan: ${groups.size} group(s) found`);
  for (const [container, inputs] of groups) {
    const allCandidates = Array.from(
      container.querySelectorAll(SUBMIT_BTN_SELECTOR)
    ).filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    let submitBtn = allCandidates[allCandidates.length - 1] ?? null;
    if (!submitBtn) {
      const disabledCandidates = Array.from(
        container.querySelectorAll(SUBMIT_BTN_GROUPING_SELECTOR)
      ).filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && b.disabled;
      });
      submitBtn = disabledCandidates[disabledCandidates.length - 1] ?? null;
      if (submitBtn)
        console.log(`[auto-webmcp] orphan: using disabled submit button as reference: "${submitBtn.textContent?.trim()}"`);
    }
    if (!submitBtn) {
      const containerBtns = Array.from(
        container.querySelectorAll('button, [role="button"]')
      ).filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !b.disabled && b.getAttribute("aria-disabled") !== "true" && SUBMIT_TEXT_RE.test(b.textContent ?? "");
      });
      submitBtn = containerBtns[containerBtns.length - 1] ?? null;
      if (submitBtn)
        console.log(`[auto-webmcp] orphan: using text-matched button in container: "${submitBtn.textContent?.trim()}"`);
    }
    if (!submitBtn) {
      const dialog = container.closest('[role="dialog"], [aria-modal="true"]');
      if (dialog) {
        const allDialogBtns = Array.from(
          dialog.querySelectorAll('button, [role="button"]')
        ).filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && SUBMIT_TEXT_RE.test(b.textContent ?? "");
        });
        console.log(
          `[auto-webmcp] orphan: dialog buttons matching submit text:`,
          allDialogBtns.map((b) => `"${b.textContent?.trim().slice(0, 30)}" disabled=${b.disabled} aria-disabled=${b.getAttribute("aria-disabled")}`)
        );
        const disabledBtns = allDialogBtns.filter(
          (b) => b.disabled || b.getAttribute("aria-disabled") === "true"
        );
        const enabledBtns = allDialogBtns.filter(
          (b) => !b.disabled && b.getAttribute("aria-disabled") !== "true"
        );
        const dialogBtns = disabledBtns.length > 0 ? disabledBtns : enabledBtns;
        submitBtn = dialogBtns[dialogBtns.length - 1] ?? null;
        if (submitBtn)
          console.log(`[auto-webmcp] orphan: using text-matched button in dialog: "${submitBtn.textContent?.trim().slice(0, 40)}" disabled=${submitBtn.disabled} aria-disabled=${submitBtn.getAttribute("aria-disabled")}`);
      }
    }
    if (!submitBtn) {
      const pageBtns = Array.from(
        document.querySelectorAll('button, [role="button"]')
      ).filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && b.getAttribute("aria-disabled") !== "true" && SUBMIT_TEXT_RE.test(b.textContent ?? "");
      });
      submitBtn = pageBtns[pageBtns.length - 1] ?? null;
      if (submitBtn)
        console.log(`[auto-webmcp] orphan: using page-wide fallback submit button: "${submitBtn.textContent?.trim()}"`);
    }
    console.log(`[auto-webmcp] orphan: submit button for group:`, submitBtn ? `"${submitBtn.textContent?.trim()}" disabled=${submitBtn.disabled}` : "none");
    const metadata = analyzeOrphanInputGroup(container, inputs, submitBtn);
    console.log(`[auto-webmcp] orphan: tool="${metadata.name}" schema keys:`, Object.keys(metadata.inputSchema.properties));
    const inputPairs = [];
    const schemaProps = metadata.inputSchema.properties;
    const AUTO_ID_RE = /^_r_[0-9a-z]+_$/i;
    for (const el of inputs) {
      const id = el.id && !AUTO_ID_RE.test(el.id) ? el.id : null;
      const key = el.name || el.getAttribute("name") || el.dataset["webmcpName"] || id || el.getAttribute("aria-label") || el.getAttribute("placeholder") || null;
      const safeKey = key ? key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) : null;
      const matched = !!(safeKey && schemaProps[safeKey]);
      console.log(`[auto-webmcp] orphan: field (name="${el.name ?? ""}" id="${el.id}") rawKey="${key}" safeKey="${safeKey}" matched=${matched}`);
      if (matched) {
        inputPairs.push({ key: safeKey, el });
      }
    }
    console.log(`[auto-webmcp] orphan: ${inputPairs.length}/${inputs.length} input(s) mapped to schema keys`);
    if (inputPairs.length === 0) {
      console.log(`[auto-webmcp] orphan: skipping group "${metadata.name}" \u2014 no inputs mapped to schema keys`);
      continue;
    }
    const toolName = metadata.name;
    const execute = async (params) => {
      console.log(`[auto-webmcp] orphan execute: tool="${toolName}" params=`, params);
      console.log(`[auto-webmcp] orphan execute: inputPairs=`, inputPairs.map((p) => p.key));
      for (const { key, el } of inputPairs) {
        if (params[key] !== void 0) {
          console.log(`[auto-webmcp] orphan execute: filling key="${key}" value=`, params[key], "element=", el);
          if (el.getAttribute("role") === "combobox" && el.tagName.toLowerCase() === "button") {
            await fillComboboxButton(el, params[key]);
          } else {
            fillElement(el, params[key]);
          }
          console.log(`[auto-webmcp] orphan execute: after fill, element value=`, el.value);
        } else {
          console.log(`[auto-webmcp] orphan execute: key="${key}" not in params, skipping`);
        }
      }
      window.dispatchEvent(new CustomEvent("toolactivated", { detail: { toolName } }));
      const shouldAutoSubmit = config.autoSubmit || !!submitBtn?.hasAttribute("toolautosubmit") || submitBtn instanceof HTMLElement && submitBtn.dataset["webmcpAutosubmit"] !== void 0 || container.hasAttribute("toolautosubmit") || container instanceof HTMLElement && container.dataset["webmcpAutosubmit"] !== void 0;
      if (!shouldAutoSubmit) {
        console.log(`[auto-webmcp] orphan execute: autoSubmit=false, returning without clicking submit`);
        return { content: [{ type: "text", text: "Fields filled. Ready to submit." }] };
      }
      console.log(`[auto-webmcp] orphan execute: resolving submit button (up to 2s)...`);
      let btn = null;
      if (submitBtn && document.contains(submitBtn)) {
        const isEnabled = !submitBtn.disabled && submitBtn.getAttribute("aria-disabled") !== "true";
        const r = submitBtn.getBoundingClientRect();
        if (isEnabled && r.width > 0 && r.height > 0) {
          btn = submitBtn;
          console.log(`[auto-webmcp] orphan execute: using captured submit button "${btn.textContent?.trim()}"`);
        }
      }
      if (!btn) {
        const deadline = Date.now() + 2e3;
        while (Date.now() < deadline) {
          const candidates = Array.from(
            container.querySelectorAll(SUBMIT_BTN_SELECTOR)
          ).filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          const last = candidates[candidates.length - 1] ?? null;
          if (last) {
            btn = last;
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (!btn) {
        const textBtns = Array.from(
          (container !== document.body ? container : document).querySelectorAll('button, [role="button"]')
        ).filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !b.disabled && b.getAttribute("aria-disabled") !== "true" && SUBMIT_TEXT_RE.test(b.textContent ?? "");
        });
        btn = textBtns[textBtns.length - 1] ?? null;
        if (btn)
          console.log(`[auto-webmcp] orphan execute: using text-matched fallback button "${btn.textContent?.trim()}"`);
      }
      if (!btn) {
        console.warn(`[auto-webmcp] orphan execute: submit button still disabled after 2s`);
        return { content: [{ type: "text", text: "Fields filled but the submit button is still disabled. The page may require additional input before submitting." }] };
      }
      console.log(`[auto-webmcp] orphan execute: clicking submit button "${btn.textContent?.trim()}"`);
      btn.click();
      return { content: [{ type: "text", text: "Fields filled and form submitted." }] };
    };
    try {
      if (registeredOrphanToolNames.has(metadata.name)) {
        console.log(`[auto-webmcp] orphan: "${metadata.name}" already registered, skipping`);
        continue;
      }
      const toolDef = {
        name: metadata.name,
        description: metadata.description,
        inputSchema: metadata.inputSchema,
        execute
      };
      if (metadata.annotations && Object.keys(metadata.annotations).length > 0) {
        toolDef.annotations = metadata.annotations;
      }
      await navigator.modelContext.registerTool(toolDef);
      registeredOrphanToolNames.add(metadata.name);
      const pendingBtns = window["__pendingSubmitBtns"] ??= {};
      pendingBtns[metadata.name] = submitBtn;
      if (config.debug) {
        console.log(`[auto-webmcp] Orphan tool registered: ${metadata.name}`, metadata);
      }
    } catch {
    }
  }
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
  registeredFormCount = 0;
  registeredOrphanToolNames.clear();
  startObserver(config);
  listenForRouteChanges(config);
  await scanForms(config);
  await scanOrphanInputs(config);
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
