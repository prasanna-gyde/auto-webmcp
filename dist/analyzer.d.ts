/**
 * analyzer.ts — Infer tool name, description, and JSON Schema from form DOM
 */
import { JsonSchema } from './schema.js';
import { FormOverride } from './config.js';
export interface ToolMetadata {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    /** Key → DOM element for fields not addressable by name (id-keyed or ARIA-role controls). */
    fieldElements?: Map<string, Element>;
}
/** Reset form index counter (useful in tests) */
export declare function resetFormIndex(): void;
/** Derive ToolMetadata from a <form> element */
export declare function analyzeForm(form: HTMLFormElement, override?: FormOverride): ToolMetadata;
//# sourceMappingURL=analyzer.d.ts.map