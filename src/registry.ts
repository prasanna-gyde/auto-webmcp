/**
 * registry.ts: Wrapper around the WebMCP Imperative API (document.modelContext)
 */

import { ToolMetadata, ToolAnnotations } from './analyzer.js';

// ---------------------------------------------------------------------------
// WebMCP type declarations (not yet in TypeScript DOM lib)
// ---------------------------------------------------------------------------

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: object;
  title?: string;
  annotations?: ToolAnnotations;
  execute: ExecuteFn;
}

/**
 * Current spec passes `{ signal }` as the second argument. Legacy Chrome builds
 * passed a client object exposing requestUserInteraction().
 */
export type ExecuteFn = (params: Record<string, unknown>, options?: unknown) => Promise<unknown>;

interface ModelContextRegisterOptions {
  signal?: AbortSignal;
}

/**
 * The subset of the WebMCP ModelContext interface this library relies on.
 * Current spec: document.modelContext, unregister by aborting the signal.
 * Legacy Chrome builds: navigator.modelContext with unregisterTool(name).
 */
export interface ModelContextLike {
  registerTool(tool: WebMCPTool, options?: ModelContextRegisterOptions): Promise<void> | void;
  /** Legacy only. Removed from the spec in favour of AbortSignal. */
  unregisterTool?(name: string): Promise<void> | void;
}

declare global {
  interface Document {
    modelContext?: ModelContextLike | null;
  }
  interface Navigator {
    modelContext?: ModelContextLike;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Tracks registered tools: form element → tool name */
const registeredTools = new Map<HTMLFormElement, string>();
/** Tracks abort controllers for registrations, enabling signal-based unregister */
const registrationControllers = new Map<HTMLFormElement, AbortController>();

/**
 * Resolve the active ModelContext. Prefers the spec location (document.modelContext)
 * and falls back to navigator.modelContext for older Chrome builds and polyfills.
 */
export function getModelContext(): ModelContextLike | null {
  if (typeof document !== 'undefined' && document.modelContext) return document.modelContext;
  if (typeof navigator !== 'undefined' && navigator.modelContext) return navigator.modelContext;
  return null;
}

/** True if the browser exposes a WebMCP ModelContext */
export function isWebMCPSupported(): boolean {
  return getModelContext() !== null;
}

/**
 * Register a tool definition and return an AbortController that unregisters it.
 * Returns null if WebMCP is unsupported or registration was rejected.
 */
export async function registerToolDefinition(
  toolDef: WebMCPTool,
  debug = false,
): Promise<AbortController | null> {
  const ctx = getModelContext();
  if (!ctx) return null;

  const controller = new AbortController();
  try {
    await ctx.registerTool(toolDef, { signal: controller.signal });
    return controller;
  } catch (err) {
    // Legacy Chrome could hold a stale registration from a previous page load.
    // Only the legacy API offers unregister-by-name, so only retry there.
    if (isDuplicateNameError(err) && typeof ctx.unregisterTool === 'function') {
      try {
        await ctx.unregisterTool(toolDef.name);
        await ctx.registerTool(toolDef, { signal: controller.signal });
        return controller;
      } catch (retryErr) {
        err = retryErr;
      }
    }
    if (debug) warnRegistrationError(toolDef.name, err);
    return null;
  }
}

/** Unregister a tool registered via registerToolDefinition. */
export async function unregisterToolDefinition(name: string, controller: AbortController | undefined): Promise<void> {
  // Spec: aborting the registration signal unregisters the tool.
  controller?.abort();
  // Legacy builds may not honour the signal, so also unregister by name where that API exists.
  try {
    await getModelContext()?.unregisterTool?.(name);
  } catch {
    // Tool may have already been removed
  }
}

function isDuplicateNameError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'InvalidStateError';
}

function warnRegistrationError(name: string, err: unknown): void {
  const kind = err instanceof DOMException ? err.name : '';
  const hint =
    kind === 'NotAllowedError' ? ' The "tools" Permissions Policy blocks this document (cross-origin iframes need allow="tools").' :
    kind === 'SecurityError' ? ' WebMCP requires an origin-keyed agent cluster (is document.domain set?).' :
    kind === 'InvalidStateError' ? ' Check for a duplicate name, an invalid name (allowed: A-Z a-z 0-9 _ - .), or an empty description.' :
    '';
  console.warn(`[auto-webmcp] registerTool("${name}") failed: ${String(err)}.${hint}`);
}

/**
 * Register a form as a WebMCP tool.
 * Silently no-ops if WebMCP is not supported.
 */
export async function registerFormTool(
  form: HTMLFormElement,
  metadata: ToolMetadata,
  execute: ExecuteFn,
  debug = false,
): Promise<void> {
  if (!isWebMCPSupported()) return;

  // Unregister any previously-registered tool for this same form element
  if (registeredTools.has(form)) {
    await unregisterFormTool(form);
  }

  const toolDef: WebMCPTool = {
    name: metadata.name,
    description: metadata.description,
    inputSchema: metadata.inputSchema,
    execute,
  };
  if (metadata.title) toolDef.title = metadata.title;
  if (metadata.annotations && Object.keys(metadata.annotations).length > 0) {
    toolDef.annotations = metadata.annotations;
  }

  const controller = await registerToolDefinition(toolDef, debug);
  if (controller) registrationControllers.set(form, controller);

  // Track even when the browser rejected it: local handlers and form:registered still work.
  registeredTools.set(form, metadata.name);
}

/**
 * Unregister the WebMCP tool associated with a form element.
 * Silently no-ops if not registered or WebMCP not supported.
 */
export async function unregisterFormTool(form: HTMLFormElement): Promise<void> {
  const name = registeredTools.get(form);
  if (!name) return;

  await unregisterToolDefinition(name, registrationControllers.get(form));
  registrationControllers.delete(form);
  registeredTools.delete(form);
}

/** Get the registered tool name for a form, if any */
export function getRegisteredToolName(form: HTMLFormElement): string | undefined {
  return registeredTools.get(form);
}

/** Return a snapshot of all currently registered form→name pairs */
export function getAllRegisteredTools(): Array<{ form: HTMLFormElement; name: string }> {
  return Array.from(registeredTools.entries()).map(([form, name]) => ({ form, name }));
}

/** Unregister all tools (e.g. on teardown) */
export async function unregisterAll(): Promise<void> {
  const entries = Array.from(registeredTools.entries());
  await Promise.all(entries.map(([form]) => unregisterFormTool(form)));
}
