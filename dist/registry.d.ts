/**
 * registry.ts: Wrapper around the WebMCP Imperative API (document.modelContext)
 */
import { ToolMetadata, ToolAnnotations } from './analyzer.js';
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
/**
 * Resolve the active ModelContext. Prefers the spec location (document.modelContext)
 * and falls back to navigator.modelContext for older Chrome builds and polyfills.
 */
export declare function getModelContext(): ModelContextLike | null;
/** True if the browser exposes a WebMCP ModelContext */
export declare function isWebMCPSupported(): boolean;
/**
 * Register a tool definition and return an AbortController that unregisters it.
 * Returns null if WebMCP is unsupported or registration was rejected.
 */
export declare function registerToolDefinition(toolDef: WebMCPTool, debug?: boolean): Promise<AbortController | null>;
/** Unregister a tool registered via registerToolDefinition. */
export declare function unregisterToolDefinition(name: string, controller: AbortController | undefined): Promise<void>;
/**
 * Register a form as a WebMCP tool.
 * Silently no-ops if WebMCP is not supported.
 */
export declare function registerFormTool(form: HTMLFormElement, metadata: ToolMetadata, execute: ExecuteFn, debug?: boolean): Promise<void>;
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
export {};
//# sourceMappingURL=registry.d.ts.map