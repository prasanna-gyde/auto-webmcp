/**
 * registry.ts — Wrapper around navigator.modelContext WebMCP Imperative API
 */
import { ToolMetadata } from './analyzer.js';
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
/** True if the browser supports navigator.modelContext */
export declare function isWebMCPSupported(): boolean;
/**
 * Register a form as a WebMCP tool.
 * Silently no-ops if WebMCP is not supported.
 */
export declare function registerFormTool(form: HTMLFormElement, metadata: ToolMetadata, execute: (params: Record<string, unknown>) => Promise<unknown>): Promise<void>;
/**
 * Unregister the WebMCP tool associated with a form element.
 * Silently no-ops if not registered or WebMCP not supported.
 */
export declare function unregisterFormTool(form: HTMLFormElement): Promise<void>;
/** Get the registered tool name for a form, if any */
export declare function getRegisteredToolName(form: HTMLFormElement): string | undefined;
/** Return a snapshot of all currently registered form→name pairs */
export declare function getAllRegisteredTools(): Array<{
    form: HTMLFormElement;
    name: string;
}>;
/** Unregister all tools (e.g. on teardown) */
export declare function unregisterAll(): Promise<void>;
//# sourceMappingURL=registry.d.ts.map