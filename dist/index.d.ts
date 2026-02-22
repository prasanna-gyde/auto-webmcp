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
import { AutoWebMCPConfig } from './config.js';
export type { AutoWebMCPConfig } from './config.js';
export type { ToolMetadata } from './analyzer.js';
export type { JsonSchema, JsonSchemaProperty } from './schema.js';
export interface AutoWebMCPHandle {
    /** Stop observing and unregister all tools */
    destroy: () => Promise<void>;
    /** Return all currently registered tools */
    getTools: () => Array<{
        form: HTMLFormElement;
        name: string;
    }>;
    /** True if running in a WebMCP-capable browser */
    isSupported: boolean;
}
/**
 * Initialize auto-webmcp.
 *
 * @param config — Optional configuration (all fields optional)
 * @returns A handle to inspect or tear down the instance
 */
export declare function autoWebMCP(config?: AutoWebMCPConfig): Promise<AutoWebMCPHandle>;
//# sourceMappingURL=index.d.ts.map