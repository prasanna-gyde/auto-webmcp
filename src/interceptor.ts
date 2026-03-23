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
        // Programmatically submit
        form.requestSubmit();
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
    const text = JSON.stringify(formData);
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
  const setter = el instanceof HTMLTextAreaElement ? _textareaValueSetter : _inputValueSetter;
  if (setter) {
    setter.call(el, v);
  } else {
    el.value = v;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
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

/** Find a native form control by name first, then by id (for unnamed React inputs). */
function findNativeField(
  form: HTMLFormElement,
  key: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const esc = CSS.escape(key);
  return (
    form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${esc}"]`) ??
    form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `input#${esc}, textarea#${esc}, select#${esc}`,
    )
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

    // Fall back to ARIA-role or id-keyed element from the field map
    const ariaEl = fieldEls?.get(key);
    if (ariaEl) {
      fillAriaField(ariaEl, value);
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
