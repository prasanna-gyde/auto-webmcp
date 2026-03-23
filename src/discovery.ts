/**
 * discovery.ts — Form scanning & MutationObserver for SPA support
 */

import { ResolvedConfig } from './config.js';
import { analyzeForm } from './analyzer.js';
import { registerFormTool, unregisterFormTool } from './registry.js';
import { buildExecuteHandler } from './interceptor.js';
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

  startObserver(config);
  listenForRouteChanges(config);
  await scanForms(config);
}

export function stopDiscovery(): void {
  observer?.disconnect();
  observer = null;
}
