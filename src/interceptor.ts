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
    fillFormFields(form, params);

    // Dispatch toolactivated event per spec
    window.dispatchEvent(new CustomEvent('toolactivated', { detail: { toolName } }));

    return new Promise<ExecuteResult>((resolve, reject) => {
      pendingExecutions.set(form, { resolve, reject });

      if (
        config.autoSubmit ||
        form.hasAttribute('toolautosubmit') ||
        form.dataset['webmcpAutosubmit'] !== undefined
      ) {
        // Wait 300 ms before submitting so React/Vue/etc. can commit any state
        // updates queued by the InputEvents we dispatched during fill.
        // Frameworks like React 18 batch state updates asynchronously — if we
        // call requestSubmit() synchronously the framework reads stale state.
        setTimeout(() => {
          // Re-fill after React has committed, in case it reset values.
          fillFormFields(form, params);

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
          submitForm.requestSubmit();
        }, 300);
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
    const text = `Form submitted. Fields: ${JSON.stringify(formData)}`;
    const result: ExecuteResult = { content: [{ type: 'text', text }] };

    if (e.agentInvoked && typeof e.respondWith === 'function') {
      // Native WebMCP path: use respondWith to return to browser
      e.preventDefault();
      e.respondWith(Promise.resolve(result));
    }
    resolve(result);
  });

  // Dispatch toolcancel when form is reset
  form.addEventListener('reset', () => {
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

  for (const [key, value] of Object.entries(params)) {
    const input = findNativeField(form, key);

    if (input) {
      if (input instanceof HTMLInputElement) {
        fillInput(input, form, key, value);
      } else if (input instanceof HTMLTextAreaElement) {
        setReactValue(input, String(value ?? ''));
      } else if (input instanceof HTMLSelectElement) {
        input.value = String(value ?? '');
        input.dispatchEvent(new Event('change', { bubbles: true }));
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
      } else if (effectiveEl instanceof HTMLTextAreaElement) {
        setReactValue(effectiveEl, String(value ?? ''));
      } else if (effectiveEl instanceof HTMLSelectElement) {
        effectiveEl.value = String(value ?? '');
        effectiveEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        fillAriaField(effectiveEl, value);
      }
    }
  }
}

function fillInput(
  input: HTMLInputElement,
  form: HTMLFormElement,
  key: string,
  value: unknown,
): void {
  const type = input.type.toLowerCase();

  if (type === 'checkbox') {
    setReactChecked(input, Boolean(value));
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

  // Supplement with id-keyed or ARIA-keyed fields not captured by FormData
  if (params) {
    for (const key of Object.keys(params)) {
      if (key in result) continue;
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
    el.value = String(value ?? '');
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    fillAriaField(el, value);
  }
}

function resolveFormAction(form: HTMLFormElement): string {
  if (form.action) {
    try {
      return new URL(form.action, window.location.href).href;
    } catch {
      // ignore
    }
  }
  return window.location.href;
}
