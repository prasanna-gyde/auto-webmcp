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
export interface FillWarning {
    field: string;
    type: 'clamped' | 'not_filled' | 'missing_required' | 'type_mismatch' | 'alias_resolved' | 'blocked_submit' | 'timeout';
    message: string;
    original?: unknown;
    actual?: unknown;
}
export interface ValidationError {
    field: string;
    /** HTML ValidityState key: valueMissing, typeMismatch, patternMismatch, tooLong, tooShort, rangeUnderflow, rangeOverflow, stepMismatch, customError, badInput */
    constraint: string;
    message: string;
}
export interface StructuredExecuteData {
    status: 'success' | 'partial' | 'error' | 'awaiting_user_action' | 'timed_out' | 'blocked_invalid';
    filled_fields: Record<string, unknown>;
    skipped_fields: string[];
    missing_required: string[];
    warnings: FillWarning[];
    /** Structured per-field validation errors (populated on blocked_invalid status). */
    validation_errors?: ValidationError[];
    /** Field values captured from the form before the agent filled it. */
    existing_values?: Record<string, unknown>;
}
/**
 * Build an `execute` function for a form tool.
 *
 * When the agent calls execute(params):
 *  1. Fills form fields with the supplied params
 *  2. Fires a submit event (or auto-submits if configured)
 *  3. Resolves with structured form data once submitted
 */
export declare function buildExecuteHandler(form: HTMLFormElement, config: ResolvedConfig, toolName: string, metadata?: ToolMetadata): (params: Record<string, unknown>, client?: unknown) => Promise<ExecuteResult>;
export declare function fillElement(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | Element, value: unknown): void;
/**
 * Fill a lookup/typeahead input (e.g. Salesforce Account Name): type the search
 * text, wait for a [role="listbox"] dropdown to appear, then click the best match.
 * Used for <input role="combobox" aria-autocomplete="list"> elements.
 *
 * Exported for use by the orphan execute handler in discovery.ts.
 */
export declare function fillLookupInput(el: Element, value: unknown): Promise<void>;
export declare function fillComboboxButton(el: Element, value: unknown): Promise<void>;
//# sourceMappingURL=interceptor.d.ts.map