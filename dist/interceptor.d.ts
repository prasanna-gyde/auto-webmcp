/**
 * interceptor.ts — Form submit interception for agent-invoked submissions
 *
 * WebMCP's `execute` callback receives form parameters and is expected to
 * return a result. This module bridges the gap: it fills form fields with
 * the agent-supplied values, submits the form, and resolves the execute
 * promise with a structured response.
 */
import { ResolvedConfig } from './config.js';
declare global {
    interface SubmitEvent {
        /** True when the form was submitted by an AI agent via WebMCP */
        agentInvoked?: boolean;
        /** Call to return a structured result to the agent */
        respondWith?: (promise: Promise<unknown>) => void;
    }
}
export interface ExecuteResult {
    success: boolean;
    data?: Record<string, unknown>;
    url?: string;
    error?: string;
}
/**
 * Build an `execute` function for a form tool.
 *
 * When the agent calls execute(params):
 *  1. Fills form fields with the supplied params
 *  2. Fires a submit event (or auto-submits if configured)
 *  3. Resolves with structured form data once submitted
 */
export declare function buildExecuteHandler(form: HTMLFormElement, config: ResolvedConfig): (params: Record<string, unknown>) => Promise<ExecuteResult>;
//# sourceMappingURL=interceptor.d.ts.map