/**
 * analyzer.ts — Infer tool name, description, and JSON Schema from form DOM
 */
import { JsonSchema } from './schema.js';
import { FormOverride } from './config.js';
export interface ToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}
export interface ToolMetadata {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    annotations?: ToolAnnotations;
    /** Key → DOM element for fields not addressable by name (id-keyed or ARIA-role controls). */
    fieldElements?: Map<string, Element>;
}
/** Reset form index counter (useful in tests) */
export declare function resetFormIndex(): void;
/** Derive ToolMetadata from a <form> element */
export declare function analyzeForm(form: HTMLFormElement, override?: FormOverride): ToolMetadata;
/**
 * Derive ToolMetadata from a group of form controls that are NOT inside a <form>.
 * Used by discovery.ts's orphan-input scanner for pages like newsletter landing pages.
 */
export declare function analyzeOrphanInputGroup(container: Element, inputs: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement>, submitBtn: HTMLButtonElement | HTMLInputElement | null): ToolMetadata;
//# sourceMappingURL=analyzer.d.ts.map