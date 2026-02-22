/**
 * discovery.ts — Form scanning & MutationObserver for SPA support
 */

import { ResolvedConfig } from './config.js';
import { analyzeForm } from './analyzer.js';
import { registerFormTool, unregisterFormTool } from './registry.js';
import { buildExecuteHandler } from './interceptor.js';
import { enrichMetadata } from './enhancer.js';

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
  // Skip forms that already have explicit WebMCP attributes (browser handles)
  if (form.hasAttribute('toolname')) return true;
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
  const execute = buildExecuteHandler(form, config);

  await registerFormTool(form, metadata, execute);

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

  if (config.debug) {
    console.debug(`[auto-webmcp] Unregistered: ${name}`);
  }

  emit('form:unregistered', form, name);
}

// ---------------------------------------------------------------------------
// MutationObserver
// ---------------------------------------------------------------------------

let observer: MutationObserver | null = null;

function startObserver(config: ResolvedConfig): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        const forms = node instanceof HTMLFormElement
          ? [node]
          : Array.from(node.querySelectorAll<HTMLFormElement>('form'));

        for (const form of forms) {
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
  await Promise.all(forms.map((form) => registerForm(form, config)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startDiscovery(config: ResolvedConfig): Promise<void> {
  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
    );
  }

  await scanForms(config);
  startObserver(config);
  listenForRouteChanges(config);
}

export function stopDiscovery(): void {
  observer?.disconnect();
  observer = null;
}
