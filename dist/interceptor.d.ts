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
declare global {
    interface SubmitEvent {
        /** True when the form was submitted by an AI agent via WebMCP */
        agentInvoked?: boolean;
        /** Call to return a structured result to the agent */
        respondWith?: (promise: Promise<unknown>) => void;
    }
}
export interface ExecuteResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
}
/**
 * Build an `execute` function for a form tool.
 *
 * When the agent calls execute(params):
 *  1. Fills form fields with the supplied params
 *  2. Fires a submit event (or auto-submits if configured)
 *  3. Resolves with structured form data once submitted
 */
export declare function buildExecuteHandler(form: HTMLFormElement, config: ResolvedConfig, toolName: string, metadata?: ToolMetadata): (params: Record<string, unknown>) => Promise<ExecuteResult>;
/**
 * Fill a single form control or ARIA element with the given value.
 * Exported for use by orphan-input (formless) tool handlers in discovery.ts.
 */
export declare function fillElement(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | Element, value: unknown): void;
//# sourceMappingURL=interceptor.d.ts.map