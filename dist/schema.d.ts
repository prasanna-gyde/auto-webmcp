/**
 * schema.ts — HTML input type → JSON Schema type mapping
 */
export interface JsonSchemaProperty {
    type: string;
    format?: string;
    description?: string;
    title?: string;
    enum?: string[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
}
export interface JsonSchema {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
}
/** Maps an HTML <input type> to a JSON Schema property base */
export declare function inputTypeToSchema(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): JsonSchemaProperty | null;
/** Collect all radio button values for a given name within a form */
export declare function collectRadioEnum(form: HTMLFormElement, name: string): string[];
//# sourceMappingURL=schema.d.ts.map