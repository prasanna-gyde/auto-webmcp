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
  type:
    | 'clamped'
    | 'not_filled'
    | 'missing_required'
    | 'type_mismatch'
    | 'alias_resolved'
    | 'blocked_submit'
    | 'timeout';
  message: string;
  original?: unknown;
  actual?: unknown;
}

export interface StructuredExecuteData {
  status:
    | 'success'
    | 'partial'
    | 'error'
    | 'awaiting_user_action'
    | 'timed_out'
    | 'blocked_invalid';
  filled_fields: Record<string, unknown>;
  skipped_fields: string[];
  missing_required: string[];
  warnings: FillWarning[];
}

interface ModelContextClientLike {
  requestUserInteraction?: <T>(callback: () => Promise<T>) => Promise<T>;
}

type Resolver = (result: ExecuteResult) => void;
type Rejecter = (error: Error) => void;

/** Per-form pending execute promises */
const pendingExecutions = new WeakMap<
  HTMLFormElement,
  { resolve: Resolver; reject: Rejecter; timeoutId?: ReturnType<typeof setTimeout> }
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

function normalizeAliasKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function addAlias(
  index: Map<string, Set<string>>,
  alias: string | null | undefined,
  schemaKey: string,
): void {
  if (!alias) return;
  const normalized = normalizeAliasKey(alias);
  if (!normalized) return;
  if (!index.has(normalized)) index.set(normalized, new Set<string>());
  index.get(normalized)!.add(schemaKey);
}

function buildAliasIndex(
  form: HTMLFormElement,
  metadata: ToolMetadata | undefined,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  const properties = metadata?.inputSchema?.properties ?? {};

  for (const [schemaKey, prop] of Object.entries(properties)) {
    addAlias(index, schemaKey, schemaKey);
    addAlias(index, schemaKey.replace(/_/g, ' '), schemaKey);
    addAlias(index, prop.title, schemaKey);

    const nativeEl = findNativeField(form, schemaKey);
    const mappedEl = metadata?.fieldElements?.get(schemaKey);
    const el = nativeEl ?? mappedEl ?? null;
    if (!el) continue;
    const htmlEl = el as HTMLElement;
    addAlias(index, htmlEl.getAttribute('id'), schemaKey);
    addAlias(index, htmlEl.getAttribute('name'), schemaKey);
    addAlias(index, htmlEl.getAttribute('aria-label'), schemaKey);
    addAlias(index, htmlEl.getAttribute('placeholder'), schemaKey);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      for (const label of Array.from(el.labels ?? [])) {
        addAlias(index, label.textContent?.trim(), schemaKey);
      }
    }
  }
  return index;
}

function resolveParamsForSchema(
  form: HTMLFormElement,
  params: Record<string, unknown>,
  metadata: ToolMetadata | undefined,
  config: ResolvedConfig,
): { resolved: Record<string, unknown>; warnings: FillWarning[] } {
  const resolved: Record<string, unknown> = {};
  const warnings: FillWarning[] = [];
  const properties = metadata?.inputSchema?.properties ?? {};
  const aliasEnabled = config.paramBinding.enableAliasResolution;

  for (const [key, value] of Object.entries(params)) {
    if (key in properties) resolved[key] = value;
  }
  if (!aliasEnabled) return { resolved, warnings };

  const aliasIndex = buildAliasIndex(form, metadata);
  for (const [rawKey, value] of Object.entries(params)) {
    if (rawKey in properties) continue;
    const candidates = aliasIndex.get(normalizeAliasKey(rawKey));
    if (!candidates || candidates.size !== 1) continue;
    const target = Array.from(candidates)[0];
    if (!target || target in resolved) continue;
    resolved[target] = value;
    warnings.push({
      field: target,
      type: 'alias_resolved',
      original: rawKey,
      message: `resolved "${rawKey}" to schema field "${target}"`,
    });
  }
  return { resolved, warnings };
}

function collectInvalidFieldWarnings(form: HTMLFormElement): FillWarning[] {
  const warnings: FillWarning[] = [];
  const controls = Array.from(form.elements).filter(
    (el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement,
  );
  for (const control of controls) {
    if (!control.willValidate) continue;
    if (control.checkValidity()) continue;
    const field = control.name || control.id || control.getAttribute('aria-label') || 'unknown_field';
    warnings.push({
      field,
      type: 'blocked_submit',
      message: control.validationMessage || `field "${field}" failed validation`,
    });
  }
  return warnings;
}

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
): (params: Record<string, unknown>, client?: unknown) => Promise<ExecuteResult> {
  // Store field element map for this form
  if (metadata?.fieldElements) {
    formFieldElements.set(form, metadata.fieldElements);
  }

  // Attach submit/reset listeners once per form
  attachSubmitInterceptor(form, toolName);

  return async (params: Record<string, unknown>, client?: unknown): Promise<ExecuteResult> => {
    const modelContextClient = client as ModelContextClientLike | undefined;
    if (
      config.autoSubmit &&
      metadata?.annotations?.destructiveHint === true &&
      typeof modelContextClient?.requestUserInteraction === 'function'
    ) {
      const approved = await modelContextClient.requestUserInteraction(async () => {
        return new Promise<boolean>((resolve) => {
          const ok = window.confirm(`Agent requested a destructive action via "${toolName}". Continue?`);
          resolve(ok);
        });
      });
      if (!approved) {
        window.dispatchEvent(new CustomEvent('toolcancel', { detail: { toolName } }));
        return { content: [{ type: 'text', text: `Cancelled "${toolName}" by user.` }] };
      }
    }

    pendingFillWarnings.set(form, []);
    pendingWarnings.delete(form);
    const { resolved: resolvedParams, warnings: aliasWarnings } = resolveParamsForSchema(
      form,
      params,
      metadata,
      config,
    );
    if (aliasWarnings.length > 0) {
      pendingFillWarnings.set(form, [...(pendingFillWarnings.get(form) ?? []), ...aliasWarnings]);
    }
    fillFormFields(form, resolvedParams);

    // Compute missing required fields now so they are available when the
    // form submits, regardless of whether autoSubmit is enabled.
    const missingNow = getMissingRequired(metadata, resolvedParams);
    if (missingNow.length > 0) pendingWarnings.set(form, missingNow);

    // Dispatch toolactivated event per spec
    window.dispatchEvent(new CustomEvent('toolactivated', { detail: { toolName } }));

    return new Promise<ExecuteResult>((resolve, reject) => {
      const timeoutMs = config.execution.timeoutMs;
      const timeoutId = setTimeout(() => {
        const pending = pendingExecutions.get(form);
        if (!pending) return;
        pendingExecutions.delete(form);
        const timedOutState = (
          config.autoSubmit ||
          form.hasAttribute('toolautosubmit') ||
          form.dataset['webmcpAutosubmit'] !== undefined
        ) ? 'timed_out' : 'awaiting_user_action';
        const warn: FillWarning = {
          field: '__form__',
          type: 'timeout',
          message: timedOutState === 'timed_out'
            ? `tool execution timed out after ${timeoutMs}ms`
            : `waiting for user submit (timed out after ${timeoutMs}ms)`,
        };
        const structured: StructuredExecuteData = {
          status: timedOutState,
          filled_fields: serializeFormData(form, lastParams.get(form), formFieldElements.get(form)),
          skipped_fields: [],
          missing_required: pendingWarnings.get(form) ?? [],
          warnings: [...(pendingFillWarnings.get(form) ?? []), warn],
        };
        pendingWarnings.delete(form);
        pendingFillWarnings.delete(form);
        lastFilledSnapshot.delete(form);
        resolve({
          content: [
            { type: 'text', text: warn.message },
            { type: 'text', text: JSON.stringify(structured) },
          ],
        });
      }, timeoutMs);
      pendingExecutions.set(form, { resolve, reject, timeoutId });

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
            fillFormFields(form, resolvedParams);

            // Retry up to 2 times if the framework reset any filled values.
            for (let attempt = 0; attempt < 2; attempt++) {
              const reset = getResetFields(form, resolvedParams, formFieldElements.get(form));
              if (reset.length === 0) break;
              fillFormFields(form, resolvedParams);
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
                const pending = pendingExecutions.get(form);
                const nextPending = pending?.timeoutId
                  ? { resolve, reject, timeoutId: pending.timeoutId }
                  : { resolve, reject };
                pendingExecutions.set(submitForm, nextPending);
                attachSubmitInterceptor(submitForm, toolName);
              }
            }

            // If the form was remounted, transfer the pending warnings to the live form.
            if (submitForm !== form && pendingWarnings.has(form)) {
              pendingWarnings.set(submitForm, pendingWarnings.get(form)!);
              pendingWarnings.delete(form);
            }

            if (!submitForm.checkValidity()) {
              const pending = pendingExecutions.get(submitForm) ?? pendingExecutions.get(form);
              if (pending) {
                if (pending.timeoutId) clearTimeout(pending.timeoutId);
                pendingExecutions.delete(submitForm);
                pendingExecutions.delete(form);
                const warnings = [
                  ...(pendingFillWarnings.get(submitForm) ?? pendingFillWarnings.get(form) ?? []),
                  ...collectInvalidFieldWarnings(submitForm),
                ];
                pendingFillWarnings.delete(submitForm);
                pendingFillWarnings.delete(form);
                const structured: StructuredExecuteData = {
                  status: 'blocked_invalid',
                  filled_fields: serializeFormData(submitForm, lastParams.get(submitForm) ?? lastParams.get(form), formFieldElements.get(submitForm) ?? formFieldElements.get(form)),
                  skipped_fields: [],
                  missing_required: pendingWarnings.get(submitForm) ?? pendingWarnings.get(form) ?? [],
                  warnings,
                };
                pendingWarnings.delete(submitForm);
                pendingWarnings.delete(form);
                lastFilledSnapshot.delete(submitForm);
                lastFilledSnapshot.delete(form);
                resolve({
                  content: [
                    { type: 'text', text: 'Form submission blocked by native validation.' },
                    { type: 'text', text: JSON.stringify(structured) },
                  ],
                });
              }
              return;
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
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
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

function getAssociatedInputsByName(
  form: HTMLFormElement,
  type: 'checkbox' | 'radio',
  name: string,
): HTMLInputElement[] {
  return Array.from(form.elements).filter(
    (el): el is HTMLInputElement =>
      el instanceof HTMLInputElement &&
      el.type === type &&
      el.name === name,
  );
}

/** Find a native form control by name or id, including inside shadow DOM. */
function findNativeField(
  form: HTMLFormElement,
  key: string,
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  // Includes out-of-tree controls linked with form="...".
  const named = form.elements.namedItem(key);
  if (
    typeof named === 'object' &&
    named !== null &&
    (named instanceof HTMLInputElement || named instanceof HTMLTextAreaElement || named instanceof HTMLSelectElement)
  ) {
    return named;
  }
  if (named instanceof RadioNodeList) {
    const first = named[0];
    const firstObj = first as unknown;
    if (
      firstObj instanceof HTMLInputElement ||
      firstObj instanceof HTMLTextAreaElement ||
      firstObj instanceof HTMLSelectElement
    ) {
      return firstObj;
    }
  }

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
            snapshot[key] = getAssociatedInputsByName(form, 'checkbox', key)
              .filter((b) => b.checked)
              .map((b) => b.value);
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
      const allBoxes = getAssociatedInputsByName(form, 'checkbox', key);
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
    const radios = getAssociatedInputsByName(form, 'radio', key);
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
  console.log('[auto-webmcp] fillAriaField', {
    tag: el.tagName, role, isContentEditable: htmlEl.isContentEditable,
    id: el.id, ariaLabel: el.getAttribute('aria-label'),
    textContentBefore: (htmlEl.textContent ?? '').slice(0, 80),
  });

  if (htmlEl.isContentEditable) {
    htmlEl.focus();

    // Select all content scoped to this element (not document.execCommand('selectAll')
    // which can confuse Quill/ProseMirror by triggering their select-all handling).
    const range = document.createRange();
    range.selectNodeContents(htmlEl);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const text = String(value ?? '');
    console.log('[auto-webmcp] fillAriaField: text to insert:', JSON.stringify(text));

    // Strategy 1: paste simulation (Draft.js preferred path).
    // Draft.js intercepts paste, reads clipboardData, updates EditorState, and
    // enables submit buttons. We check whether text actually landed in the DOM
    // after the event — if the editor handled paste but clipboardData was empty
    // (a Chrome security edge-case for synthetic events) we fall through.
    // NOTE: use .trim() — an empty Quill/ProseMirror editor may contain '<p><br></p>'
    // whose textContent is '\n' (length 1), which would falsely indicate success.
    let inserted = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      htmlEl.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, composed: true, clipboardData: dt,
      }));
      inserted = (htmlEl.textContent ?? '').trim().length > 0;
      console.log('[auto-webmcp] fillAriaField: S1 paste result:', inserted, JSON.stringify((htmlEl.textContent ?? '').slice(0, 80)));
    } catch (e) {
      console.log('[auto-webmcp] fillAriaField: S1 paste threw:', e);
    }

    if (!inserted) {
      // Strategy 2: execCommand insertText with the range selection active.
      // The browser replaces the selected content with the new text and fires
      // the native beforeinput + input events that Quill/ProseMirror listen to.
      const ok = document.execCommand('insertText', false, text);
      inserted = (htmlEl.textContent ?? '').trim().length > 0;
      console.log('[auto-webmcp] fillAriaField: S2 execCommand result:', ok, 'inserted:', inserted, JSON.stringify((htmlEl.textContent ?? '').slice(0, 80)));
    }

    if (!inserted) {
      // Strategy 3: direct beforeinput InputEvent (ProseMirror / LinkedIn editor).
      // Dispatching directly guarantees event.data === text; execCommand may fire
      // beforeinput with data=null in some Chrome versions.
      try {
        htmlEl.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true, cancelable: true, composed: true,
          inputType: 'insertText', data: text,
        }));
        inserted = (htmlEl.textContent ?? '').trim().length > 0;
        console.log('[auto-webmcp] fillAriaField: S3 beforeinput result:', inserted, JSON.stringify((htmlEl.textContent ?? '').slice(0, 80)));
      } catch (e) {
        console.log('[auto-webmcp] fillAriaField: S3 beforeinput threw:', e);
      }
    }

    if (!inserted) {
      // Strategy 4: direct textContent assignment (MutationObserver-based editors).
      // Sets content directly in the DOM; editors using MutationObserver (Quill,
      // ProseMirror) will pick it up and sync their internal model.
      htmlEl.textContent = text;
      const r2 = document.createRange();
      r2.selectNodeContents(htmlEl);
      r2.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(r2);
      console.log('[auto-webmcp] fillAriaField: S4 textContent assignment done, textContent:', JSON.stringify((htmlEl.textContent ?? '').slice(0, 80)));
    }

    // Always dispatch input so any remaining framework listeners are notified.
    htmlEl.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: text,
    }));
    console.log('[auto-webmcp] fillAriaField: done, final textContent:', JSON.stringify((htmlEl.textContent ?? '').slice(0, 80)));
  } else {
    console.log('[auto-webmcp] fillAriaField: not contentEditable, dispatching input/change only');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
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

/**
 * Async fill for `<button role="combobox">` elements (Salesforce Lightning,
 * Atlaskit, and other JS-powered dropdowns). The pattern:
 *   1. Click the button to open the dropdown.
 *   2. Wait for a [role="listbox"] to appear (up to 1s).
 *   3. Click the option whose data-value, aria-label, or text matches `value`.
 *
 * Exported for use by the orphan execute handler in discovery.ts.
 */
export async function fillComboboxButton(el: Element, value: unknown): Promise<void> {
  const text = String(value ?? '').trim();
  console.log('[auto-webmcp] fillComboboxButton: clicking button, value=', JSON.stringify(text));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // Wait for a listbox to appear (dropdown opens asynchronously in most frameworks).
  const listbox = await new Promise<Element | null>((resolve) => {
    const deadline = Date.now() + 1000;
    const poll = (): void => {
      // Search from the nearest overlay root or document body.
      const candidate =
        document.querySelector('[role="listbox"]') ??
        document.querySelector('[role="option"]')?.closest('[role="listbox"]') ??
        null;
      if (candidate) {
        resolve(candidate);
        return;
      }
      if (Date.now() >= deadline) { resolve(null); return; }
      setTimeout(poll, 50);
    };
    poll();
  });

  if (!listbox) {
    console.warn('[auto-webmcp] fillComboboxButton: listbox did not appear after 1s');
    return;
  }

  const options = Array.from(listbox.querySelectorAll('[role="option"]'));
  console.log('[auto-webmcp] fillComboboxButton: listbox has', options.length, 'options');

  const lowerValue = text.toLowerCase();
  const match = options.find((opt) => {
    const dataValue = (opt.getAttribute('data-value') ?? '').toLowerCase();
    const ariaLabel = (opt.getAttribute('aria-label') ?? '').toLowerCase();
    const optText = (opt.textContent ?? '').trim().toLowerCase();
    return dataValue === lowerValue || ariaLabel === lowerValue || optText === lowerValue;
  });

  if (match) {
    console.log('[auto-webmcp] fillComboboxButton: clicking option', match.textContent?.trim());
    match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  } else {
    console.warn('[auto-webmcp] fillComboboxButton: no option matched', JSON.stringify(text),
      'available:', options.map((o) => o.textContent?.trim()));
  }
}
