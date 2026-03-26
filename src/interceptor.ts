/**
 * interceptor.ts — Form submit interception for agent-invoked submissions
 *
 * WebMCP's `execute` callback receives form parameters and is expected to
 * return a result. This module bridges the gap: it fills form fields with
 * the agent-supplied values, submits the form, and resolves the execute
 * promise with a structured response.
 */

import { ResolvedConfig } from './config.js';
import type { ToolMetadata } from './analyzer.js';

// ---------------------------------------------------------------------------
// Extended SubmitEvent types (WebMCP additions)
// ---------------------------------------------------------------------------

declare global {
  interface SubmitEvent {
    /** True when the form was submitted by an AI agent via WebMCP */
    agentInvoked?: boolean;
    /** Call to return a structured result to the agent */
    respondWith?: (promise: Promise<unknown>) => void;
  }
}

export interface ExecuteResult {
  content: Array<{ type: 'text'; text: string }>;
}

export interface FillWarning {
  field: string;
  type: 'clamped' | 'not_filled' | 'missing_required' | 'type_mismatch';
  message: string;
  original?: unknown;
  actual?: unknown;
}

export interface StructuredExecuteData {
  status: 'success' | 'partial' | 'error';
  filled_fields: Record<string, unknown>;
  skipped_fields: string[];
  missing_required: string[];
  warnings: FillWarning[];
}

type Resolver = (result: ExecuteResult) => void;
type Rejecter = (error: Error) => void;

/** Per-form pending execute promises */
const pendingExecutions = new WeakMap<
  HTMLFormElement,
  { resolve: Resolver; reject: Rejecter }
>();

/** Per-form last-used params (for serializing id-keyed fields not in FormData) */
const lastParams = new WeakMap<HTMLFormElement, Record<string, unknown>>();

/** Per-form field element map (key → DOM element for non-name-addressable fields) */
const formFieldElements = new WeakMap<HTMLFormElement, Map<string, Element>>();

/** Per-form required fields that the agent did not supply (populated before submit, consumed in interceptor) */
const pendingWarnings = new WeakMap<HTMLFormElement, string[]>();

/** Per-form fill warnings (invalid/out-of-range values detected during field filling) */
const pendingFillWarnings = new WeakMap<HTMLFormElement, FillWarning[]>();

/**
 * Per-form snapshot of field values captured immediately after fillFormFields()
 * completes. Used by serializeFormData() so that id-keyed and ARIA-keyed fields
 * are serialized from the snapshot rather than re-querying a potentially stale
 * DOM (e.g. after a React reconciliation cycle resets field values).
 */
const lastFilledSnapshot = new WeakMap<HTMLFormElement, Record<string, unknown>>();

// React-compatible native prototype setters (retrieved once at module init).
// Using these bypasses React's controlled-input tracking so onChange fires correctly.
const _inputValueSetter: ((v: string) => void) | undefined =
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
const _textareaValueSetter: ((v: string) => void) | undefined =
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
const _checkedSetter: ((v: boolean) => void) | undefined =
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;

/**
 * Build an `execute` function for a form tool.
 *
 * When the agent calls execute(params):
 *  1. Fills form fields with the supplied params
 *  2. Fires a submit event (or auto-submits if configured)
 *  3. Resolves with structured form data once submitted
 */
export function buildExecuteHandler(
  form: HTMLFormElement,
  config: ResolvedConfig,
  toolName: string,
  metadata?: ToolMetadata,
): (params: Record<string, unknown>) => Promise<ExecuteResult> {
  // Store field element map for this form
  if (metadata?.fieldElements) {
    formFieldElements.set(form, metadata.fieldElements);
  }

  // Attach submit/reset listeners once per form
  attachSubmitInterceptor(form, toolName);

  return async (params: Record<string, unknown>): Promise<ExecuteResult> => {
    pendingFillWarnings.set(form, []);
    pendingWarnings.delete(form);
    fillFormFields(form, params);

    // Compute missing required fields now so they are available when the
    // form submits, regardless of whether autoSubmit is enabled.
    const missingNow = getMissingRequired(metadata, params);
    if (missingNow.length > 0) pendingWarnings.set(form, missingNow);

    // Dispatch toolactivated event per spec
    window.dispatchEvent(new CustomEvent('toolactivated', { detail: { toolName } }));

    return new Promise<ExecuteResult>((resolve, reject) => {
      pendingExecutions.set(form, { resolve, reject });

      if (
        config.autoSubmit ||
        form.hasAttribute('toolautosubmit') ||
        form.dataset['webmcpAutosubmit'] !== undefined
      ) {
        // Wait for the form DOM to stabilize before submitting. Frameworks like
        // React 18 batch state updates asynchronously after InputEvents — a fixed
        // delay is unreliable. waitForDomStable polls for 150 ms of silence (no
        // mutations) and caps at 800 ms so we never hang indefinitely.
        waitForDomStable(form).then(async () => {
          try {
            // Re-fill after framework has committed state updates.
            fillFormFields(form, params);

            // Retry up to 2 times if the framework reset any filled values.
            for (let attempt = 0; attempt < 2; attempt++) {
              const reset = getResetFields(form, params, formFieldElements.get(form));
              if (reset.length === 0) break;
              fillFormFields(form, params);
              await waitForDomStable(form, 400, 100);
            }

            // If the stored form was remounted (React, Turbo etc.), find the live
            // form via the submit button so requestSubmit() reaches the real DOM.
            let submitForm: HTMLFormElement = form;
            if (!form.isConnected) {
              const liveBtn = document.querySelector<HTMLElement>(
                'button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])',
              );
              const found = liveBtn?.closest('form') as HTMLFormElement | null;
              if (found) {
                submitForm = found;
                pendingExecutions.set(submitForm, { resolve, reject });
                attachSubmitInterceptor(submitForm, toolName);
              }
            }

            // If the form was remounted, transfer the pending warnings to the live form.
            if (submitForm !== form && pendingWarnings.has(form)) {
              pendingWarnings.set(submitForm, pendingWarnings.get(form)!);
              pendingWarnings.delete(form);
            }

            submitForm.requestSubmit();
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      }
      // Otherwise: the form stays filled; human clicks submit,
      // which fires the submit event interceptor below.
    });
  };
}

function attachSubmitInterceptor(form: HTMLFormElement, toolName: string): void {
  // Guard against attaching multiple times
  if ((form as unknown as Record<string, unknown>)['__awmcp_intercepted']) return;
  (form as unknown as Record<string, unknown>)['__awmcp_intercepted'] = true;

  form.addEventListener('submit', (e: SubmitEvent) => {
    const pending = pendingExecutions.get(form);
    if (!pending) return; // Normal human submission — do nothing

    // Agent-invoked path
    const { resolve } = pending;
    pendingExecutions.delete(form);

    const formData = serializeFormData(form, lastParams.get(form), formFieldElements.get(form));
    lastFilledSnapshot.delete(form);
    const missingRequired = pendingWarnings.get(form) ?? [];
    pendingWarnings.delete(form);
    const fillWarnings = pendingFillWarnings.get(form) ?? [];
    pendingFillWarnings.delete(form);

    const skippedFields = fillWarnings
      .filter((w) => w.type === 'not_filled')
      .map((w) => w.field);

    const structured: StructuredExecuteData = {
      status: missingRequired.length > 0 || skippedFields.length > 0 ? 'partial' : 'success',
      filled_fields: formData,
      skipped_fields: skippedFields,
      missing_required: missingRequired,
      warnings: [
        ...missingRequired.map((f): FillWarning => ({
          field: f,
          type: 'missing_required',
          message: `required field "${f}" was not provided`,
        })),
        ...fillWarnings,
      ],
    };

    const allWarnMessages = [
      ...(missingRequired.length ? [`required fields were not filled: ${missingRequired.join(', ')}`] : []),
      ...fillWarnings.map((w) => w.message),
    ];
    const warningText = allWarnMessages.length ? ` Note: ${allWarnMessages.join('; ')}.` : '';
    const text = `Form submitted. Fields: ${JSON.stringify(formData)}${warningText}`;
    const result: ExecuteResult = {
      content: [
        { type: 'text', text },
        { type: 'text', text: JSON.stringify(structured) },
      ],
    };

    if (e.agentInvoked && typeof e.respondWith === 'function') {
      // Native WebMCP path: use respondWith to return to browser
      e.preventDefault();
      e.respondWith(Promise.resolve(result));
    }
    resolve(result);
  });

  // Dispatch toolcancel when form is reset
  form.addEventListener('reset', () => {
    lastFilledSnapshot.delete(form);
    window.dispatchEvent(new CustomEvent('toolcancel', { detail: { toolName } }));
  });
}

// ---------------------------------------------------------------------------
// Field filling
// ---------------------------------------------------------------------------

function setReactValue(el: HTMLInputElement | HTMLTextAreaElement, v: string): void {
  el.focus();
  // Select all existing text so the insert replaces it
  el.select?.();

  // execCommand('insertText') simulates real typing — triggers native browser
  // input events that every framework (React, Catalyst, Stimulus, Vue, etc.)
  // listens to. Most reliable cross-framework approach.
  // Guard: execCommand can return true but silently fail for inputs inside
  // shadow DOM (e.g. GitHub's Catalyst components), so verify the value landed.
  if (document.execCommand('insertText', false, v) && el.value === v) {
    return;
  }

  // Fallback: native prototype setter (bypasses React controlled-input cache)
  const setter = el instanceof HTMLTextAreaElement ? _textareaValueSetter : _inputValueSetter;
  if (setter) {
    setter.call(el, v);
  } else {
    el.value = v;
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: v }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setReactChecked(el: HTMLInputElement, checked: boolean): void {
  if (_checkedSetter) {
    _checkedSetter.call(el, checked);
  } else {
    el.checked = checked;
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Recursively search shadow roots for a native form control matching selector.
 * GitHub's Catalyst and other custom-element frameworks render inputs inside
 * shadow DOM that form.querySelector() cannot pierce.
 */
function findInShadowRoots(
  root: Document | ShadowRoot,
  selector: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  for (const host of Array.from(root.querySelectorAll('*'))) {
    const sr = (host as Element).shadowRoot;
    if (!sr) continue;
    const found = sr.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
    if (found) return found;
    const deeper = findInShadowRoots(sr, selector);
    if (deeper) return deeper;
  }
  return null;
}

/** Find a native form control by name or id, including inside shadow DOM. */
function findNativeField(
  form: HTMLFormElement,
  key: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const esc = CSS.escape(key);
  // Light DOM first (fast path)
  const light =
    form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${esc}"]`) ??
    form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `input#${esc}, textarea#${esc}, select#${esc}`,
    );
  if (light) return light;
  // Shadow DOM fallback: search all shadow roots in the document
  return (
    findInShadowRoots(document, `[name="${esc}"]`) ??
    findInShadowRoots(document, `input#${esc}, textarea#${esc}, select#${esc}`)
  );
}

function fillFormFields(form: HTMLFormElement, params: Record<string, unknown>): void {
  lastParams.set(form, params);
  const fieldEls = formFieldElements.get(form);
  const snapshot: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const input = findNativeField(form, key);

    if (input) {
      if (input instanceof HTMLInputElement) {
        fillInput(input, form, key, value);
        if (input.type === 'checkbox') {
          if (Array.isArray(value)) {
            const esc = CSS.escape(key);
            snapshot[key] = Array.from(
              form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${esc}"]`),
            ).filter((b) => b.checked).map((b) => b.value);
          } else {
            snapshot[key] = input.checked;
          }
        } else {
          snapshot[key] = input.value;
        }
      } else if (input instanceof HTMLTextAreaElement) {
        setReactValue(input, String(value ?? ''));
        snapshot[key] = input.value;
      } else if (input instanceof HTMLSelectElement) {
        fillSelectElement(input, value, form, key);
        snapshot[key] = input.multiple
          ? Array.from(input.options).filter((o) => o.selected).map((o) => o.value)
          : input.value;
      }
      continue;
    }

    // Fall back to id-keyed or ARIA-role element from the field map.
    const ariaEl = fieldEls?.get(key);
    if (ariaEl) {
      // If the stored element was remounted by a framework (React, Catalyst etc.),
      // find a fresh reference using its actual DOM id (which may differ from the
      // sanitized schema key — e.g. "repository-name-input" → key "repository_name_input").
      let effectiveEl: Element = ariaEl;
      if (!ariaEl.isConnected) {
        const elId = (ariaEl as HTMLElement).id;
        if (elId) {
          const fresh =
            document.getElementById(elId) ??
            findInShadowRoots(document, `#${CSS.escape(elId)}`);
          if (fresh) effectiveEl = fresh;
        }
      }
      if (effectiveEl instanceof HTMLInputElement) {
        fillInput(effectiveEl, form, key, value);
        snapshot[key] = effectiveEl.type === 'checkbox' ? effectiveEl.checked : effectiveEl.value;
      } else if (effectiveEl instanceof HTMLTextAreaElement) {
        setReactValue(effectiveEl, String(value ?? ''));
        snapshot[key] = effectiveEl.value;
      } else if (effectiveEl instanceof HTMLSelectElement) {
        fillSelectElement(effectiveEl, value, form, key);
        snapshot[key] = effectiveEl.multiple
          ? Array.from(effectiveEl.options).filter((o) => o.selected).map((o) => o.value)
          : effectiveEl.value;
      } else {
        fillAriaField(effectiveEl, value);
        snapshot[key] = value; // Use the raw value for ARIA elements (no reliable DOM readback)
      }
    }
  }

  lastFilledSnapshot.set(form, snapshot);

  // Expose fill warnings for external readers (extension, bridge).
  // The WeakMap is not accessible outside the IIFE closure, so we mirror the
  // current warnings onto window so the extension can read them after filling.
  (window as unknown as Record<string, unknown>)['__lastFillWarnings'] =
    pendingFillWarnings.get(form) ?? [];
}

function fillInput(
  input: HTMLInputElement,
  form: HTMLFormElement,
  key: string,
  value: unknown,
): void {
  const type = input.type.toLowerCase();

  if (type === 'checkbox') {
    // Agent may pass an array for checkbox groups (multiple checkboxes with same name)
    if (Array.isArray(value)) {
      const esc = CSS.escape(key);
      const allBoxes = form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${esc}"]`);
      for (const box of allBoxes) {
        setReactChecked(box, (value as unknown[]).map(String).includes(box.value));
      }
      return;
    }
    setReactChecked(input, Boolean(value));
    return;
  }

  if (type === 'number' || type === 'range') {
    const raw = String(value ?? '');
    const num = Number(raw);
    if (raw === '' || isNaN(num)) {
      pendingFillWarnings.get(form)?.push({
        field: key,
        type: 'type_mismatch',
        message: `"${key}" expects a number, got: ${JSON.stringify(value)}`,
        original: value,
      });
      return;
    }
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' ? parseFloat(input.max) : Infinity;
    if (num < min || num > max) {
      const clamped = Math.min(Math.max(num, min), max);
      pendingFillWarnings.get(form)?.push({
        field: key,
        type: 'clamped',
        message: `"${key}" value ${num} is outside allowed range [${input.min || '?'}, ${input.max || '?'}], clamped to ${clamped}`,
        original: num,
        actual: clamped,
      });
      input.value = String(clamped);
    } else {
      input.value = String(num);
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(num) }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (type === 'radio') {
    const esc = CSS.escape(key);
    const radios = form.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${esc}"]`,
    );
    for (const radio of radios) {
      if (radio.value === String(value)) {
        if (_checkedSetter) {
          _checkedSetter.call(radio, true);
        } else {
          radio.checked = true;
        }
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
    return;
  }

  setReactValue(input, String(value ?? ''));
}

/**
 * Fill a select element. For multi-select, deselects all options then selects
 * those whose value is in the agent-supplied array. A single string value is
 * treated as a one-element array for multi-select. For single-select, tries
 * exact value match first, then case-insensitive label match as fallback.
 */
function fillSelectElement(
  select: HTMLSelectElement,
  value: unknown,
  form?: HTMLFormElement,
  key?: string,
): void {
  if (select.multiple) {
    const vals: string[] = Array.isArray(value)
      ? (value as unknown[]).map(String)
      : [String(value ?? '')];
    for (const opt of Array.from(select.options)) {
      opt.selected = vals.includes(opt.value);
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  const strVal = String(value ?? '');
  select.value = strVal;

  // If the value didn't match any option (browser silently ignores unknown values),
  // try case-insensitive label/text matching as a fallback.
  if (select.value !== strVal) {
    const lower = strVal.toLowerCase();
    const byLabel = Array.from(select.options).find(
      (o) => o.text.trim().toLowerCase() === lower || o.label.trim().toLowerCase() === lower,
    );
    if (byLabel) {
      select.value = byLabel.value;
    } else if (form && key) {
      // Neither value nor label matched — record a not_filled warning.
      pendingFillWarnings.get(form)?.push({
        field: key,
        type: 'not_filled',
        message: `"${key}" value "${strVal}" did not match any option in the select`,
        original: strVal,
      });
    }
  }

  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillAriaField(el: Element, value: unknown): void {
  const role = el.getAttribute('role');

  if (role === 'checkbox' || role === 'switch') {
    el.setAttribute('aria-checked', String(Boolean(value)));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return;
  }

  if (role === 'radio') {
    el.setAttribute('aria-checked', 'true');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return;
  }

  if (role === 'radiogroup') {
    // Find the matching radio option inside the group and activate it
    const radios = Array.from(el.querySelectorAll('[role="radio"]'));
    for (const radio of radios) {
      const val = (radio.getAttribute('data-value') ?? radio.getAttribute('aria-label') ?? radio.textContent ?? '').trim();
      if (val === String(value)) {
        radio.setAttribute('aria-checked', 'true');
        radio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        for (const other of radios) {
          if (other !== radio) other.setAttribute('aria-checked', 'false');
        }
        break;
      }
    }
    return;
  }

  // textbox, combobox, searchbox, spinbutton
  const htmlEl = el as HTMLElement;
  if (htmlEl.isContentEditable) {
    htmlEl.textContent = String(value ?? '');
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeFormData(
  form: HTMLFormElement,
  params?: Record<string, unknown>,
  fieldEls?: Map<string, Element>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const data = new FormData(form);
  const snapshot = lastFilledSnapshot.get(form);

  for (const [key, val] of data.entries()) {
    if (result[key] !== undefined) {
      // Multiple values → array
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

  // Supplement with id-keyed or ARIA-keyed fields not captured by FormData.
  // Prefer the post-fill snapshot over a live DOM query: the DOM may have been
  // reset by a framework re-render (React reconciliation) between fill and submit.
  if (params) {
    for (const key of Object.keys(params)) {
      if (key in result) continue;

      if (snapshot && key in snapshot) {
        result[key] = snapshot[key];
        continue;
      }

      const el =
        findNativeField(form, key) ??
        fieldEls?.get(key) ??
        null;
      if (!el) continue;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        result[key] = el.checked;
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        result[key] = el.value;
      } else {
        // ARIA element
        const role = el.getAttribute('role');
        if (role === 'checkbox' || role === 'switch') {
          result[key] = el.getAttribute('aria-checked') === 'true';
        } else {
          result[key] = (el as HTMLElement).textContent?.trim() ?? '';
        }
      }
    }
  }

  return result;
}

/**
 * Fill a single form control or ARIA element with the given value.
 * Exported for use by orphan-input (formless) tool handlers in discovery.ts.
 */
export function fillElement(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | Element,
  value: unknown,
): void {
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (type === 'checkbox') {
      setReactChecked(el, Boolean(value));
    } else if (type === 'radio') {
      if (el.value === String(value)) {
        if (_checkedSetter) _checkedSetter.call(el, true);
        else el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      setReactValue(el, String(value ?? ''));
    }
  } else if (el instanceof HTMLTextAreaElement) {
    setReactValue(el, String(value ?? ''));
  } else if (el instanceof HTMLSelectElement) {
    fillSelectElement(el, value);
  } else {
    fillAriaField(el, value);
  }
}

// ---------------------------------------------------------------------------
// Helpers for DOM stabilization, reset detection, and required-field warnings
// ---------------------------------------------------------------------------

/**
 * Resolves when the form DOM has been stable (no mutations) for debounceMs,
 * or when maxMs has elapsed. Replaces the hardcoded 300 ms pre-submit delay
 * so React/Vue/etc. can finish committing batched state updates.
 */
function waitForDomStable(
  form: HTMLFormElement,
  maxMs = 800,
  debounceMs = 150,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      resolve();
    };

    const observer = new MutationObserver(() => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(settle, debounceMs);
    });

    observer.observe(form, { childList: true, subtree: true, attributes: true, characterData: true });

    setTimeout(settle, maxMs);              // hard cap
    debounceTimer = setTimeout(settle, debounceMs); // resolves early if already stable
  });
}

/**
 * Returns the keys of params whose corresponding DOM field values no longer
 * match what was filled, indicating the framework reset them.
 */
function getResetFields(
  form: HTMLFormElement,
  params: Record<string, unknown>,
  fieldEls: Map<string, Element> | undefined,
): string[] {
  const reset: string[] = [];
  for (const [key, expected] of Object.entries(params)) {
    const el = findNativeField(form, key) ?? (fieldEls?.get(key) ?? null);
    if (!el) continue;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (el.checked !== Boolean(expected)) reset.push(key);
    } else if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      if (el.value !== String(expected ?? '')) reset.push(key);
    }
  }
  return reset;
}

/**
 * Returns required field keys from the schema that the agent did not supply.
 * Uses the `in` operator so fields explicitly passed as empty string or false
 * are not flagged (intentional empty values are valid).
 */
function getMissingRequired(
  metadata: ToolMetadata | undefined,
  params: Record<string, unknown>,
): string[] {
  if (!metadata?.inputSchema?.required?.length) return [];
  return metadata.inputSchema.required.filter((fieldKey) => !(fieldKey in params));
}

