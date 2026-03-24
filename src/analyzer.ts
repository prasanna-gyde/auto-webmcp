/**
 * analyzer.ts — Infer tool name, description, and JSON Schema from form DOM
 */

import { JsonSchema, JsonSchemaProperty, inputTypeToSchema, collectRadioEnum, collectRadioOneOf, collectCheckboxEnum, ARIA_ROLES_TO_SCAN, AriaRole, ariaRoleToSchema } from './schema.js';
import { FormOverride } from './config.js';

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Key → DOM element for fields not addressable by name (id-keyed or ARIA-role controls). */
  fieldElements?: Map<string, Element>;
}

// Track form index for fallback naming
let formIndex = 0;

/** Reset form index counter (useful in tests) */
export function resetFormIndex(): void {
  formIndex = 0;
}

/** Derive ToolMetadata from a <form> element */
export function analyzeForm(form: HTMLFormElement, override?: FormOverride): ToolMetadata {
  const name = override?.name ?? inferToolName(form);
  const description = override?.description ?? inferToolDescription(form);
  const { schema: inputSchema, fieldElements } = buildSchema(form);

  return { name, description, inputSchema, fieldElements };
}

// ---------------------------------------------------------------------------
// Tool name inference
// ---------------------------------------------------------------------------

function inferToolName(form: HTMLFormElement): string {
  // 1. Native toolname attribute (spec)
  const nativeName = form.getAttribute('toolname');
  if (nativeName) return sanitizeName(nativeName);

  // 2. Explicit data attribute
  const explicit = form.dataset['webmcpName'];
  if (explicit) return sanitizeName(explicit);

  // 2. Submit button text
  const submitText = getSubmitButtonText(form);
  if (submitText) return sanitizeName(submitText);

  // 3. Nearest heading above the form
  const heading = getNearestHeadingText(form);
  if (heading) return sanitizeName(heading);

  // 4. Form id or name attribute
  if (form.id) return sanitizeName(form.id);
  if (form.name) return sanitizeName(form.name);

  // 5. Form action URL path segment
  if (form.action) {
    const segment = getLastPathSegment(form.action);
    if (segment) return sanitizeName(segment);
  }

  // 6. Fallback
  return `form_${++formIndex}`;
}

function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'form';
}

function getSubmitButtonText(form: HTMLFormElement): string {
  const buttons = [
    ...Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])')),
    ...Array.from(form.querySelectorAll<HTMLInputElement>('input[type="submit"]')),
  ];

  for (const btn of buttons) {
    const text =
      btn instanceof HTMLInputElement
        ? btn.value.trim()
        : btn.textContent?.trim() ?? '';
    if (text && text.length > 0 && text.length < 80) return text;
  }
  return '';
}

function getNearestHeadingText(form: HTMLFormElement): string {
  // Walk up the DOM looking for a preceding sibling or parent heading
  let node: Element | null = form;
  while (node) {
    // Check preceding siblings
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (/^H[1-3]$/i.test(sibling.tagName)) {
        const text = sibling.textContent?.trim() ?? '';
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
    // Stop at body
    if (!node || node === document.body) break;
  }
  return '';
}

function getLastPathSegment(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Tool description inference
// ---------------------------------------------------------------------------

function inferToolDescription(form: HTMLFormElement): string {
  // 1. Native tooldescription attribute (spec)
  const nativeDesc = form.getAttribute('tooldescription');
  if (nativeDesc) return nativeDesc.trim();

  // 2. Explicit data attribute
  const explicit = form.dataset['webmcpDescription'];
  if (explicit) return explicit.trim();

  // 2. <legend> inside the form
  const legend = form.querySelector('legend');
  if (legend?.textContent?.trim()) return legend.textContent.trim();

  // 3. aria-label on the form
  const ariaLabel = form.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // 4. aria-describedby
  const describedById = form.getAttribute('aria-describedby');
  if (describedById) {
    const descEl = document.getElementById(describedById);
    if (descEl?.textContent?.trim()) return descEl.textContent.trim();
  }

  // 5. Combine nearest heading + page title
  const heading = getNearestHeadingText(form);
  const pageTitle = document.title?.trim();
  if (heading && pageTitle) return `${heading} — ${pageTitle}`;
  if (heading) return heading;
  if (pageTitle) return pageTitle;

  return 'Submit form';
}

// ---------------------------------------------------------------------------
// JSON Schema construction
// ---------------------------------------------------------------------------

function buildSchema(form: HTMLFormElement): { schema: JsonSchema; fieldElements: Map<string, Element> } {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  const fieldElements = new Map<string, Element>();

  // Track which radio/checkbox group names we've already processed
  const processedRadioGroups = new Set<string>();
  const processedCheckboxGroups = new Set<string>();

  const controls = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select',
    ),
  );

  for (const control of controls) {
    const name = control.name;
    const fieldKey = name || resolveNativeControlFallbackKey(control);
    if (!fieldKey) continue;

    // Skip already-processed radio groups
    if (control instanceof HTMLInputElement && control.type === 'radio') {
      if (processedRadioGroups.has(fieldKey)) continue;
      processedRadioGroups.add(fieldKey);
    }

    // Skip already-processed checkbox groups
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (processedCheckboxGroups.has(fieldKey)) continue;
      processedCheckboxGroups.add(fieldKey);
    }

    const schemaProp = inputTypeToSchema(control);
    if (!schemaProp) continue; // skipped types (hidden, password, file, etc.)
    if (!isControlVisible(control)) continue; // display:none, aria-hidden, disabled fieldset

    // Enrich with title and description
    schemaProp.title = inferFieldTitle(control);
    const desc = inferFieldDescription(control);
    if (desc) schemaProp.description = desc;

    // For radio groups, add enum and oneOf values
    if (control instanceof HTMLInputElement && control.type === 'radio') {
      schemaProp.enum = collectRadioEnum(form, fieldKey);
      const radioOneOf = collectRadioOneOf(form, fieldKey);
      if (radioOneOf.length > 0) schemaProp.oneOf = radioOneOf;
    }

    // For checkbox groups (multiple checkboxes with same name), upgrade to array schema
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      const checkboxValues = collectCheckboxEnum(form, fieldKey);
      if (checkboxValues.length > 1) {
        const arrayProp: JsonSchemaProperty = {
          type: 'array',
          items: { type: 'string', enum: checkboxValues },
          title: schemaProp.title,
        };
        if (schemaProp.description) arrayProp.description = schemaProp.description;
        properties[fieldKey] = arrayProp;
        if (control.required) required.push(fieldKey);
        continue;
      }
    }

    properties[fieldKey] = schemaProp;

    // Track id-keyed or aria-label-keyed fields for the interceptor
    if (!name) {
      fieldElements.set(fieldKey, control);
    }

    // Mark as required if the HTML attribute says so
    if (control.required) {
      required.push(fieldKey);
    }
  }

  // ARIA role-based controls (custom components not using native inputs)
  const ariaControls = collectAriaControls(form);
  const processedAriaRadioGroups = new Set<string>();

  for (const { el, role, key, enumValues, enumOneOf } of ariaControls) {
    if (properties[key]) continue; // already covered by a native control

    if (role === 'radio') {
      if (processedAriaRadioGroups.has(key)) continue;
      processedAriaRadioGroups.add(key);
    }

    const schemaProp = ariaRoleToSchema(el, role);

    // Apply pre-computed enum for grouped ARIA radiogroups (role="radiogroup" ancestor)
    if (enumValues && enumValues.length > 0) {
      schemaProp.enum = enumValues;
      if (enumOneOf && enumOneOf.length > 0) schemaProp.oneOf = enumOneOf;
    }

    schemaProp.title = inferAriaFieldTitle(el);
    const desc = inferAriaFieldDescription(el);
    if (desc) schemaProp.description = desc;

    properties[key] = schemaProp;
    fieldElements.set(key, el);

    if (el.getAttribute('aria-required') === 'true') {
      required.push(key);
    }
  }

  return { schema: { type: 'object', properties, required }, fieldElements };
}

/** Derive a schema key for a native control that lacks a name attribute */
function resolveNativeControlFallbackKey(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string | null {
  const el = control as HTMLElement;
  if (el.dataset['webmcpName']) return sanitizeName(el.dataset['webmcpName']!);
  if (control.id) return sanitizeName(control.id);
  const label = control.getAttribute('aria-label');
  if (label) return sanitizeName(label);
  // Fallback: placeholder text — common for minimalist forms (e.g. Ghost newsletter)
  // that have no name/id/aria-label on their inputs.
  if (
    (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
    control.placeholder?.trim()
  ) {
    return sanitizeName(control.placeholder.trim());
  }
  // Final fallback: input type for typed inputs without any text identifier.
  if (control instanceof HTMLInputElement && control.type !== 'text') {
    return control.type;
  }
  return null;
}

type AriaControlEntry = {
  el: Element;
  role: AriaRole;
  key: string;
  enumValues?: string[];
  enumOneOf?: Array<{ const: string; title: string }>;
};

/** Collect ARIA-role-based interactive elements inside a form, excluding native inputs.
 *  ARIA radio elements inside a role="radiogroup" ancestor are collapsed into a single
 *  enum field keyed on the group, matching native radio group behaviour. */
function collectAriaControls(form: HTMLFormElement): Array<AriaControlEntry> {
  const selector = ARIA_ROLES_TO_SCAN.map((r) => `[role="${r}"]`).join(', ');
  const rawResults: Array<{ el: Element; role: AriaRole; key: string }> = [];

  for (const el of Array.from(form.querySelectorAll(selector))) {
    // Skip native inputs — already handled above
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) continue;

    // Skip hidden elements
    if (el.getAttribute('aria-hidden') === 'true' || (el as HTMLElement).hidden) continue;

    const role = el.getAttribute('role') as AriaRole;
    const key = resolveAriaFieldKey(el);
    if (!key) continue;

    rawResults.push({ el, role, key });
  }

  // Group ARIA radios by their nearest role="radiogroup" ancestor
  const radioEntries = rawResults.filter((e) => e.role === 'radio');
  const nonRadioEntries: AriaControlEntry[] = rawResults.filter((e) => e.role !== 'radio');

  const radioGroupMap = new Map<Element, Array<Element>>();
  const ungroupedRadios: AriaControlEntry[] = [];

  for (const entry of radioEntries) {
    const group = entry.el.closest('[role="radiogroup"]');
    if (group) {
      if (!radioGroupMap.has(group)) radioGroupMap.set(group, []);
      radioGroupMap.get(group)!.push(entry.el);
    } else {
      ungroupedRadios.push(entry);
    }
  }

  const groupedEntries: AriaControlEntry[] = [];
  for (const [group, members] of radioGroupMap) {
    const groupKey = resolveAriaFieldKey(group);
    if (!groupKey) continue;
    const enumValues = members
      .map((el) => (el.getAttribute('data-value') ?? el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
      .filter(Boolean);
    const enumOneOf = members
      .map((el) => {
        const val = (el.getAttribute('data-value') ?? el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
        const title = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
        return { const: val, title: title || val };
      })
      .filter((e) => e.const !== '');
    if (enumValues.length > 0) {
      groupedEntries.push({ el: group, role: 'radio', key: groupKey, enumValues, enumOneOf });
    }
  }

  return [...nonRadioEntries, ...groupedEntries, ...ungroupedRadios];
}

/** Derive a schema key from an ARIA element */
function resolveAriaFieldKey(el: Element): string | null {
  const htmlEl = el as HTMLElement;
  if (htmlEl.dataset?.['webmcpName']) return sanitizeName(htmlEl.dataset['webmcpName']!);
  if (el.id) return sanitizeName(el.id);
  const label = el.getAttribute('aria-label');
  if (label) return sanitizeName(label);
  const labelledById = el.getAttribute('aria-labelledby');
  if (labelledById) {
    const text = document.getElementById(labelledById)?.textContent?.trim();
    if (text) return sanitizeName(text);
  }
  return null;
}

function inferAriaFieldTitle(el: Element): string {
  const htmlEl = el as HTMLElement;
  if (htmlEl.dataset?.['webmcpTitle']) return htmlEl.dataset['webmcpTitle']!;
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const labelledById = el.getAttribute('aria-labelledby');
  if (labelledById) {
    const text = document.getElementById(labelledById)?.textContent?.trim();
    if (text) return text;
  }
  if (el.id) return humanizeName(el.id);
  return '';
}

function inferAriaFieldDescription(el: Element): string {
  const nativeParamDesc = el.getAttribute('toolparamdescription');
  if (nativeParamDesc) return nativeParamDesc.trim();
  const htmlEl = el as HTMLElement;
  if (htmlEl.dataset?.['webmcpDescription']) return htmlEl.dataset['webmcpDescription']!;
  const ariaDesc = el.getAttribute('aria-description');
  if (ariaDesc) return ariaDesc;
  const describedById = el.getAttribute('aria-describedby');
  if (describedById) {
    const text = document.getElementById(describedById)?.textContent?.trim();
    if (text) return text;
  }
  const placeholder = el.getAttribute('placeholder') ?? (el as HTMLElement).dataset?.['placeholder'];
  if (placeholder) return placeholder.trim();
  return '';
}

function inferFieldTitle(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  // 1. data-webmcp-title
  if ('dataset' in control && (control as HTMLElement).dataset['webmcpTitle']) {
    return (control as HTMLElement).dataset['webmcpTitle']!;
  }

  // 2. Associated <label> text
  const labelText = getAssociatedLabelText(control);
  if (labelText) return labelText;

  // 3. name attribute (humanised)
  if (control.name) return humanizeName(control.name);

  // 4. id attribute (humanised)
  if (control.id) return humanizeName(control.id);

  // 5. placeholder text (last resort for inputs with no name/id/label)
  if (
    (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
    control.placeholder?.trim()
  ) {
    return control.placeholder.trim();
  }

  return '';
}

function inferFieldDescription(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  // 1. Native toolparamdescription attribute (spec)
  const nativeParamDesc = control.getAttribute('toolparamdescription');
  if (nativeParamDesc) return nativeParamDesc.trim();

  // 2. data-webmcp-description
  const el = control as HTMLElement;
  if (el.dataset['webmcpDescription']) return el.dataset['webmcpDescription']!;

  // 2. aria-description or aria-describedby
  const ariaDesc = control.getAttribute('aria-description');
  if (ariaDesc) return ariaDesc;

  const describedById = control.getAttribute('aria-describedby');
  if (describedById) {
    const descEl = document.getElementById(describedById);
    if (descEl?.textContent?.trim()) return descEl.textContent.trim();
  }

  // 3. placeholder (only as a last resort — can be noisy)
  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    const ph = control.placeholder?.trim();
    if (ph && ph.length > 0) return ph;
  }

  // 4. Associated label text (if title didn't use it, use it for description)
  return '';
}

function getAssociatedLabelText(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  // 1. Labels collection (for/id association)
  if (control.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(control.id)}"]`);
    if (label) {
      const text = labelTextWithoutNested(label);
      if (text) return text;
    }
  }

  // 2. Wrapping <label>
  const parent = control.closest('label');
  if (parent) {
    const text = labelTextWithoutNested(parent);
    if (text) return text;
  }

  return '';
}

function labelTextWithoutNested(label: HTMLLabelElement): string {
  // Clone and remove any nested input/select/textarea before getting text
  const clone = label.cloneNode(true) as HTMLLabelElement;
  clone.querySelectorAll('input, select, textarea, button').forEach((el) => el.remove());
  return clone.textContent?.trim() ?? '';
}

function humanizeName(raw: string): string {
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns false if the control is currently not visible to the user:
 * display:none, visibility:hidden, aria-hidden ancestor, or inside a disabled fieldset.
 * Used to exclude conditional/hidden fields from the registered schema so agents
 * are not offered fields that are not currently applicable.
 *
 * Note: <input type="hidden"> is excluded earlier by inputTypeToSchema returning null —
 * this check never runs for hidden-type inputs.
 */
function isControlVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  // offsetParent is null for display:none (already caught) AND position:fixed (which IS visible)
  if (el.offsetParent === null && style.position !== 'fixed') return false;

  // Walk up ancestors checking for aria-hidden
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (node.getAttribute('aria-hidden') === 'true') return false;
    node = node.parentElement;
  }

  // Disabled fieldset hides all its controls from agents
  if (el.closest('fieldset')?.disabled) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Orphan input group analysis (inputs not inside a <form> element)
// ---------------------------------------------------------------------------

/**
 * Derive ToolMetadata from a group of form controls that are NOT inside a <form>.
 * Used by discovery.ts's orphan-input scanner for pages like newsletter landing pages.
 */
export function analyzeOrphanInputGroup(
  container: Element,
  inputs: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  submitBtn: HTMLButtonElement | HTMLInputElement | null,
): ToolMetadata {
  const name = inferOrphanToolName(container, submitBtn);
  const description = inferOrphanToolDescription(container);
  const { schema: inputSchema, fieldElements } = buildSchemaFromInputs(inputs);
  return { name, description, inputSchema, fieldElements };
}

function inferOrphanToolName(
  container: Element,
  submitBtn: HTMLButtonElement | HTMLInputElement | null,
): string {
  // 1. Submit button text
  if (submitBtn) {
    const text =
      submitBtn instanceof HTMLInputElement
        ? submitBtn.value.trim()
        : submitBtn.textContent?.trim() ?? '';
    if (text && text.length > 0 && text.length < 80) return sanitizeName(text);
  }

  // 2. Nearest heading within or above the container
  const heading = getNearestHeadingTextFrom(container);
  if (heading) return sanitizeName(heading);

  // 3. Page title
  const title = document.title?.trim();
  if (title) return sanitizeName(title);

  return `form_${++formIndex}`;
}

function inferOrphanToolDescription(container: Element): string {
  // Nearest heading within or above the container
  const heading = getNearestHeadingTextFrom(container);
  const pageTitle = document.title?.trim();
  if (heading && pageTitle && heading !== pageTitle) return `${heading} on ${pageTitle}`;
  if (heading) return heading;
  if (pageTitle) return pageTitle;
  return 'Submit form';
}

/**
 * Generic heading search starting from any Element (not just HTMLFormElement).
 * Walks up the DOM checking preceding siblings and parent elements.
 */
function getNearestHeadingTextFrom(el: Element): string {
  // Also check headings inside the container itself
  const inner = el.querySelector('h1, h2, h3');
  if (inner?.textContent?.trim()) return inner.textContent.trim();

  let node: Element | null = el;
  while (node) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (/^H[1-3]$/i.test(sibling.tagName)) {
        const text = sibling.textContent?.trim() ?? '';
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
    if (!node || node === document.body) break;
  }
  return '';
}

/**
 * Build a JSON Schema from an array of form controls (no <form> context needed).
 * Reuses the same field title/description inference as buildSchema().
 */
function buildSchemaFromInputs(
  inputs: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
): { schema: JsonSchema; fieldElements: Map<string, Element> } {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  const fieldElements = new Map<string, Element>();
  const processedRadioGroups = new Set<string>();
  const processedCheckboxGroups = new Set<string>();

  for (const control of inputs) {
    const name = control.name;
    const fieldKey = name || resolveNativeControlFallbackKey(control);
    if (!fieldKey) continue;

    if (control instanceof HTMLInputElement && control.type === 'radio') {
      if (processedRadioGroups.has(fieldKey)) continue;
      processedRadioGroups.add(fieldKey);
    }

    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (processedCheckboxGroups.has(fieldKey)) continue;
      processedCheckboxGroups.add(fieldKey);
    }

    const schemaProp = inputTypeToSchema(control);
    if (!schemaProp) continue; // skipped types (hidden, password, file, etc.)
    if (!isControlVisible(control)) continue; // display:none, aria-hidden, disabled fieldset

    schemaProp.title = inferFieldTitle(control);
    const desc = inferFieldDescription(control);
    if (desc) schemaProp.description = desc;

    // For checkbox groups, derive values from the inputs array (no form context here)
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      const checkboxValues = (inputs as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>)
        .filter((i): i is HTMLInputElement => i instanceof HTMLInputElement && i.type === 'checkbox' && i.name === fieldKey)
        .map((cb) => cb.value)
        .filter((v) => v !== '' && v !== 'on');
      if (checkboxValues.length > 1) {
        const arrayProp: JsonSchemaProperty = {
          type: 'array',
          items: { type: 'string', enum: checkboxValues },
          title: schemaProp.title,
        };
        if (schemaProp.description) arrayProp.description = schemaProp.description;
        properties[fieldKey] = arrayProp;
        if (control.required) required.push(fieldKey);
        continue;
      }
    }

    properties[fieldKey] = schemaProp;
    if (!name) fieldElements.set(fieldKey, control);
    if (control.required) required.push(fieldKey);
  }

  return { schema: { type: 'object', properties, required }, fieldElements };
}
