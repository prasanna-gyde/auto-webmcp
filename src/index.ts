/**
 * index.ts — Entry point & public API for auto-webmcp
 *
 * Zero-config drop-in:
 *   <script src="auto-webmcp.iife.js"></script>
 *
 * ESM usage:
 *   import { autoWebMCP } from 'auto-webmcp';
 *   autoWebMCP({ exclude: ['#login-form'] });
 */

import { AutoWebMCPConfig, resolveConfig } from './config.js';
import { startDiscovery, stopDiscovery } from './discovery.js';
import { unregisterAll, getAllRegisteredTools, isWebMCPSupported } from './registry.js';

export type { AutoWebMCPConfig } from './config.js';
export type { ToolMetadata } from './analyzer.js';
export type { JsonSchema, JsonSchemaProperty } from './schema.js';

export interface AutoWebMCPHandle {
  /** Stop observing and unregister all tools */
  destroy: () => Promise<void>;
  /** Return all currently registered tools */
  getTools: () => Array<{ form: HTMLFormElement; name: string }>;
  /** True if running in a WebMCP-capable browser */
  isSupported: boolean;
}

/**
 * Initialize auto-webmcp.
 *
 * @param config — Optional configuration (all fields optional)
 * @returns A handle to inspect or tear down the instance
 */
export async function autoWebMCP(config?: AutoWebMCPConfig): Promise<AutoWebMCPHandle> {
  const resolved = resolveConfig(config);

  if (resolved.debug) {
    console.debug('[auto-webmcp] Initializing', {
      webmcpSupported: isWebMCPSupported(),
      config: resolved,
    });
  }

  await startDiscovery(resolved);

  return {
    destroy: async () => {
      stopDiscovery();
      await unregisterAll();
    },
    getTools: getAllRegisteredTools,
    isSupported: isWebMCPSupported(),
  };
}

// ---------------------------------------------------------------------------
// Auto-init for IIFE / script-tag usage
// ---------------------------------------------------------------------------

// When loaded as a <script> tag, auto-initialize with zero config.
// Users can prevent this by setting window.__AUTO_WEBMCP_NO_AUTOINIT = true
// before the script loads.

if (
  typeof window !== 'undefined' &&
  !(window as unknown as Record<string, unknown>)['__AUTO_WEBMCP_NO_AUTOINIT']
) {
  void autoWebMCP();
}
