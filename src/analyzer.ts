/**
 * analyzer.ts — Infer tool name, description, and JSON Schema from form DOM
 */

import { JsonSchema, JsonSchemaProperty, inputTypeToSchema, collectRadioEnum } from './schema.js';
import { FormOverride } from './config.js';

export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: JsonSchema;
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
  const inputSchema = buildSchema(form);

  return { name, description, inputSchema };
}

// ---------------------------------------------------------------------------
// Tool name inference
// ---------------------------------------------------------------------------

function inferToolName(form: HTMLFormElement): string {
  // 1. Explicit data attribute
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
  // 1. Explicit data attribute
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

function buildSchema(form: HTMLFormElement): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  // Track which radio group names we've already processed
  const processedRadioGroups = new Set<string>();

  const controls = Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select',
    ),
  );

  for (const control of controls) {
    // Skip unnamed controls — can't be submitted
    const name = control.name;
    if (!name) continue;

    // Skip already-processed radio groups
    if (
      control instanceof HTMLInputElement &&
      control.type === 'radio'
    ) {
      if (processedRadioGroups.has(name)) continue;
      processedRadioGroups.add(name);
    }

    const schemaProp = inputTypeToSchema(control);
    if (!schemaProp) continue; // skipped types

    // Enrich with title and description
    schemaProp.title = inferFieldTitle(control);
    const desc = inferFieldDescription(control);
    if (desc) schemaProp.description = desc;

    // For radio groups, add enum values
    if (
      control instanceof HTMLInputElement &&
      control.type === 'radio'
    ) {
      schemaProp.enum = collectRadioEnum(form, name);
    }

    properties[name] = schemaProp;

    // Mark as required if the HTML attribute says so
    if (control.required) {
      required.push(name);
    }
  }

  return { type: 'object', properties, required };
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

  return '';
}

function inferFieldDescription(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  // 1. data-webmcp-description
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
