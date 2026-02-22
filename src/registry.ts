/**
 * registry.ts — Wrapper around navigator.modelContext WebMCP Imperative API
 */

import { ToolMetadata } from './analyzer.js';

// ---------------------------------------------------------------------------
// WebMCP type declarations (not yet in TypeScript DOM lib)
// ---------------------------------------------------------------------------

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

declare global {
  interface Navigator {
    modelContext?: {
      registerTool(tool: WebMCPTool): Promise<void>;
      unregisterTool(name: string): Promise<void>;
    };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Tracks registered tools: form element → tool name */
const registeredTools = new Map<HTMLFormElement, string>();

/** True if the browser supports navigator.modelContext */
export function isWebMCPSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.modelContext !== 'undefined';
}

/**
 * Register a form as a WebMCP tool.
 * Silently no-ops if WebMCP is not supported.
 */
export async function registerFormTool(
  form: HTMLFormElement,
  metadata: ToolMetadata,
  execute: (params: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  if (!isWebMCPSupported()) return;

  // Unregister any previously-registered tool for this same form element
  const existing = registeredTools.get(form);
  if (existing) {
    await unregisterFormTool(form);
  }

  await navigator.modelContext!.registerTool({
    name: metadata.name,
    description: metadata.description,
    inputSchema: metadata.inputSchema,
    execute,
  });

  registeredTools.set(form, metadata.name);
}

/**
 * Unregister the WebMCP tool associated with a form element.
 * Silently no-ops if not registered or WebMCP not supported.
 */
export async function unregisterFormTool(form: HTMLFormElement): Promise<void> {
  if (!isWebMCPSupported()) return;

  const name = registeredTools.get(form);
  if (!name) return;

  try {
    await navigator.modelContext!.unregisterTool(name);
  } catch {
    // Tool may have already been removed — ignore
  }

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
