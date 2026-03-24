/**
 * discovery.ts — Form scanning & MutationObserver for SPA support
 */

import { ResolvedConfig } from './config.js';
import { analyzeForm, analyzeOrphanInputGroup } from './analyzer.js';
import { registerFormTool, unregisterFormTool, isWebMCPSupported } from './registry.js';
import { buildExecuteHandler, fillElement } from './interceptor.js';
import { enrichMetadata } from './enhancer.js';
import { ARIA_ROLES_TO_SCAN } from './schema.js';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type FormLifecycleEvent = CustomEvent<{
  form: HTMLFormElement;
  toolName: string;
}>;

function emit(type: 'form:registered' | 'form:unregistered', form: HTMLFormElement, toolName: string): void {
  window.dispatchEvent(
    new CustomEvent(type, { detail: { form, toolName } }) as FormLifecycleEvent,
  );
}

// ---------------------------------------------------------------------------
// Registration helpers
// ---------------------------------------------------------------------------

/** Check whether a form should be excluded per config */
function isExcluded(form: HTMLFormElement, config: ResolvedConfig): boolean {
  // Skip forms with data-no-webmcp
  if (form.dataset['noWebmcp'] !== undefined) return true;
  // Skip per config exclude list
  for (const selector of config.exclude) {
    try {
      if (form.matches(selector)) return true;
    } catch {
      // invalid selector — ignore
    }
  }
  return false;
}

async function registerForm(form: HTMLFormElement, config: ResolvedConfig): Promise<void> {
  if (isExcluded(form, config)) return;

  // Find matching override (first matching selector wins)
  let override;
  for (const [selector, ovr] of Object.entries(config.overrides)) {
    try {
      if (form.matches(selector)) {
        override = ovr;
        break;
      }
    } catch {
      // invalid selector
    }
  }

  let metadata = analyzeForm(form, override);
  if (config.enhance) {
    if (config.debug) console.debug(`[auto-webmcp] Enriching: ${metadata.name}…`);
    metadata = await enrichMetadata(metadata, config.enhance);
  }

  if (config.debug) {
    warnToolQuality(metadata.name, metadata.description);
  }

  const execute = buildExecuteHandler(form, config, metadata.name, metadata);

  await registerFormTool(form, metadata, execute);
  registeredForms.add(form);
  registeredFormCount++;

  if (config.debug) {
    console.debug(`[auto-webmcp] Registered: ${metadata.name}`, metadata);
  }

  emit('form:registered', form, metadata.name);
}

async function unregisterForm(form: HTMLFormElement, config: ResolvedConfig): Promise<void> {
  const { getRegisteredToolName } = await import('./registry.js');
  const name = getRegisteredToolName(form);
  if (!name) return;

  await unregisterFormTool(form);
  registeredForms.delete(form);

  if (config.debug) {
    console.debug(`[auto-webmcp] Unregistered: ${name}`);
  }

  emit('form:unregistered', form, name);
}

// ---------------------------------------------------------------------------
// MutationObserver
// ---------------------------------------------------------------------------

let observer: MutationObserver | null = null;

/** Set of currently registered forms, used to detect lazy-rendered child inputs. */
const registeredForms = new WeakSet<HTMLFormElement>();

/** Count of forms registered in the current discovery session. Reset on each startDiscovery call. */
let registeredFormCount = 0;

/** Debounce timers for re-analysis when inputs are added to existing forms. */
const reAnalysisTimers = new Map<HTMLFormElement, ReturnType<typeof setTimeout>>();
const RE_ANALYSIS_DEBOUNCE_MS = 300;

/** Returns true if node is (or contains) an input-like or ARIA-role element. */
function isInterestingNode(node: Element): boolean {
  const tag = node.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  const role = node.getAttribute('role');
  if (role && (ARIA_ROLES_TO_SCAN as readonly string[]).includes(role)) return true;
  if (node.querySelector('input, textarea, select')) return true;
  for (const r of ARIA_ROLES_TO_SCAN) {
    if (node.querySelector(`[role="${r}"]`)) return true;
  }
  return false;
}

function scheduleReAnalysis(form: HTMLFormElement, config: ResolvedConfig): void {
  const existing = reAnalysisTimers.get(form);
  if (existing) clearTimeout(existing);
  reAnalysisTimers.set(
    form,
    setTimeout(() => {
      reAnalysisTimers.delete(form);
      void registerForm(form, config);
    }, RE_ANALYSIS_DEBOUNCE_MS),
  );
}

function startObserver(config: ResolvedConfig): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (node instanceof HTMLFormElement) {
          void registerForm(node, config);
          continue;
        }

        // Newly added child inside an already-registered form?
        const parentForm = node.closest('form');
        if (parentForm instanceof HTMLFormElement && registeredForms.has(parentForm) && isInterestingNode(node)) {
          scheduleReAnalysis(parentForm, config);
        }

        // New forms nested inside the added subtree
        for (const form of Array.from(node.querySelectorAll<HTMLFormElement>('form'))) {
          void registerForm(form, config);
        }
      }

      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) continue;

        const forms = node instanceof HTMLFormElement
          ? [node]
          : Array.from(node.querySelectorAll<HTMLFormElement>('form'));

        for (const form of forms) {
          void unregisterForm(form, config);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// SPA route change support
// ---------------------------------------------------------------------------

function listenForRouteChanges(config: ResolvedConfig): void {
  // Hash changes
  window.addEventListener('hashchange', () => scanForms(config));

  // History API (pushState / replaceState)
  const original = {
    pushState: history.pushState.bind(history),
    replaceState: history.replaceState.bind(history),
  };

  history.pushState = function (...args) {
    original.pushState(...args);
    scanForms(config);
  };

  history.replaceState = function (...args) {
    original.replaceState(...args);
    scanForms(config);
  };

  window.addEventListener('popstate', () => scanForms(config));
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

async function scanForms(config: ResolvedConfig): Promise<void> {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
  await Promise.allSettled(forms.map((form) => registerForm(form, config)));
}

// ---------------------------------------------------------------------------
// Orphan input scanner (fallback for pages with no <form> elements)
// ---------------------------------------------------------------------------

/** Input types that are never useful to expose to agents */
const ORPHAN_EXCLUDED_TYPES = new Set([
  'password', 'hidden', 'file', 'submit', 'reset', 'button', 'image',
]);

/**
 * Find all visible form controls that are NOT inside a <form> element,
 * group them by their nearest ancestor that also contains a submit button,
 * and register each group as a WebMCP tool.
 *
 * This covers common patterns on landing pages and Ghost blogs where the
 * subscribe/search UI is built from plain inputs + buttons without a <form> tag.
 */
async function scanOrphanInputs(config: ResolvedConfig): Promise<void> {
  if (!isWebMCPSupported()) return;

  const SUBMIT_BTN_SELECTOR = '[type="submit"]:not([disabled]), button:not([type]):not([disabled])';
  const SUBMIT_TEXT_RE = /subscribe|submit|sign[\s-]?up|send|join|go|search/i;

  // Collect visible inputs that are not inside a <form>
  const orphanInputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not(form input), textarea:not(form textarea), select:not(form select)',
    ),
  ).filter((el) => {
    if (el instanceof HTMLInputElement && ORPHAN_EXCLUDED_TYPES.has(el.type.toLowerCase())) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (orphanInputs.length === 0) return;

  // Group inputs by the nearest ancestor that also contains a submit button.
  // Walk up from each input until we find a container with a submit-like button.
  const groups = new Map<Element, Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>>();

  for (const input of orphanInputs) {
    let container: Element | null = input.parentElement;
    let foundContainer: Element = input.parentElement ?? document.body;

    while (container && container !== document.body) {
      const hasSubmitBtn =
        container.querySelector(SUBMIT_BTN_SELECTOR) !== null ||
        Array.from(container.querySelectorAll('button')).some(
          (b) => SUBMIT_TEXT_RE.test(b.textContent ?? ''),
        );
      if (hasSubmitBtn) {
        foundContainer = container;
        break;
      }
      container = container.parentElement;
    }

    if (!groups.has(foundContainer)) groups.set(foundContainer, []);
    groups.get(foundContainer)!.push(input);
  }

  for (const [container, inputs] of groups) {
    // Pick the last visible submit button within the container (same logic as
    // handleCallTool in background.js: primary action is always the last one).
    const allCandidates = Array.from(
      container.querySelectorAll<HTMLButtonElement | HTMLInputElement>(SUBMIT_BTN_SELECTOR),
    ).filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    let submitBtn: HTMLButtonElement | HTMLInputElement | null =
      (allCandidates[allCandidates.length - 1] as HTMLButtonElement | HTMLInputElement) ?? null;

    // Fallback: nearest button with submit-like text anywhere on the page
    if (!submitBtn) {
      const pageBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
        (b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && SUBMIT_TEXT_RE.test(b.textContent ?? '');
        },
      );
      submitBtn = pageBtns[pageBtns.length - 1] ?? null;
    }

    const metadata = analyzeOrphanInputGroup(container, inputs, submitBtn);

    // Build key → element pairs for the execute handler
    const inputPairs: Array<{ key: string; el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement }> = [];
    const schemaProps = metadata.inputSchema.properties;
    for (const el of inputs) {
      const key =
        el.name ||
        (el as HTMLElement).dataset['webmcpName'] ||
        el.id ||
        el.getAttribute('aria-label') ||
        null;
      const safeKey = key
        ? key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
        : null;
      if (safeKey && schemaProps[safeKey]) {
        inputPairs.push({ key: safeKey, el });
      }
    }

    const toolName = metadata.name;
    const execute = async (params: Record<string, unknown>): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      for (const { key, el } of inputPairs) {
        if (params[key] !== undefined) {
          fillElement(el, params[key]);
        }
      }
      window.dispatchEvent(new CustomEvent('toolactivated', { detail: { toolName } }));
      return { content: [{ type: 'text', text: 'Fields filled. Ready to submit.' }] };
    };

    try {
      await navigator.modelContext!.registerTool({
        name: metadata.name,
        description: metadata.description,
        inputSchema: metadata.inputSchema,
        execute,
      });
      if (config.debug) {
        console.debug(`[auto-webmcp] Orphan tool registered: ${metadata.name}`, metadata);
      }
    } catch {
      // Best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function warnToolQuality(name: string, description: string): void {
  if (/^form_\d+$|^submit$|^form$/.test(name)) {
    console.warn(`[auto-webmcp] Tool "${name}" has a generic name. Consider adding a toolname or data-webmcp-name attribute.`);
  }
  if (!description || description === 'Submit form') {
    console.warn(`[auto-webmcp] Tool "${name}" has no meaningful description.`);
  }
  if (/don'?t|do not|never|avoid|not for/i.test(description)) {
    console.warn(`[auto-webmcp] Tool "${name}" description contains negative instructions. Per spec best practices, prefer positive descriptions.`);
  }
}

export async function startDiscovery(config: ResolvedConfig): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
    );
  }

  registeredFormCount = 0;
  startObserver(config);
  listenForRouteChanges(config);
  await scanForms(config);

  // If no form-based tools were found, try orphan inputs (inputs outside <form> elements).
  // This covers newsletter subscribe widgets, search bars, and other formless UI patterns.
  if (registeredFormCount === 0) {
    await scanOrphanInputs(config);
  }
}

export function stopDiscovery(): void {
  observer?.disconnect();
  observer = null;
}
