/**
 * interceptor.ts — Form submit interception for agent-invoked submissions
 *
 * WebMCP's `execute` callback receives form parameters and is expected to
 * return a result. This module bridges the gap: it fills form fields with
 * the agent-supplied values, submits the form, and resolves the execute
 * promise with a structured response.
 */

import { ResolvedConfig } from './config.js';

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
  success: boolean;
  data?: Record<string, unknown>;
  url?: string;
  error?: string;
}

type Resolver = (result: ExecuteResult) => void;
type Rejecter = (error: Error) => void;

/** Per-form pending execute promises */
const pendingExecutions = new WeakMap<
  HTMLFormElement,
  { resolve: Resolver; reject: Rejecter }
>();

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
): (params: Record<string, unknown>) => Promise<ExecuteResult> {
  // Attach submit listener once per form
  attachSubmitInterceptor(form);

  return async (params: Record<string, unknown>): Promise<ExecuteResult> => {
    fillFormFields(form, params);

    return new Promise<ExecuteResult>((resolve, reject) => {
      pendingExecutions.set(form, { resolve, reject });

      if (config.autoSubmit || form.dataset['webmcpAutosubmit'] !== undefined) {
        // Programmatically submit
        form.requestSubmit();
      }
      // Otherwise: the form stays filled; human clicks submit,
      // which fires the submit event interceptor below.
    });
  };
}

function attachSubmitInterceptor(form: HTMLFormElement): void {
  // Guard against attaching multiple times
  if ((form as unknown as Record<string, unknown>)['__awmcp_intercepted']) return;
  (form as unknown as Record<string, unknown>)['__awmcp_intercepted'] = true;

  form.addEventListener('submit', (e: SubmitEvent) => {
    const pending = pendingExecutions.get(form);
    if (!pending) return; // Normal human submission — do nothing

    // Agent-invoked path
    const { resolve } = pending;
    pendingExecutions.delete(form);

    const formData = serializeFormData(form);

    if (e.agentInvoked && typeof e.respondWith === 'function') {
      // Native WebMCP path: use respondWith to return to browser
      e.preventDefault();
      e.respondWith(
        Promise.resolve({
          success: true,
          data: formData,
        }),
      );
      resolve({ success: true, data: formData });
    } else {
      // Fallback path: let form submit normally, resolve with data + target URL
      const targetUrl = resolveFormAction(form);
      resolve({ success: true, data: formData, url: targetUrl });
    }
  });
}

// ---------------------------------------------------------------------------
// Field filling
// ---------------------------------------------------------------------------

function fillFormFields(form: HTMLFormElement, params: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(params)) {
    const escapedName = CSS.escape(name);

    // Try input, textarea, select with this name
    const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[name="${escapedName}"]`,
    );

    if (!input) continue;

    if (input instanceof HTMLInputElement) {
      fillInput(input, form, name, value);
    } else if (input instanceof HTMLTextAreaElement) {
      input.value = String(value ?? '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input instanceof HTMLSelectElement) {
      input.value = String(value ?? '');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

function fillInput(
  input: HTMLInputElement,
  form: HTMLFormElement,
  name: string,
  value: unknown,
): void {
  const type = input.type.toLowerCase();

  if (type === 'checkbox') {
    input.checked = Boolean(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (type === 'radio') {
    const escapedName = CSS.escape(name);
    const radios = form.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${escapedName}"]`,
    );
    for (const radio of radios) {
      if (radio.value === String(value)) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
    return;
  }

  input.value = String(value ?? '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeFormData(form: HTMLFormElement): Record<string, unknown> {
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
