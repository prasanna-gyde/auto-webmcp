/**
 * schema.ts — HTML input type → JSON Schema type mapping
 */
export declare const ARIA_ROLES_TO_SCAN: readonly ["textbox", "combobox", "checkbox", "radio", "switch", "spinbutton", "searchbox", "slider"];
export type AriaRole = typeof ARIA_ROLES_TO_SCAN[number];
export interface JsonSchemaProperty {
    type: string;
    format?: string;
    description?: string;
    title?: string;
    enum?: string[];
    oneOf?: Array<{
        const: string;
        title: string;
        group?: string;
    }>;
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
/** Collect radio button values + label titles as oneOf entries */
export declare function collectRadioOneOf(form: HTMLFormElement, name: string): Array<{
    const: string;
    title: string;
}>;
/** Maps an ARIA role element to a JSON Schema property */
export declare function ariaRoleToSchema(el: Element, role: AriaRole): JsonSchemaProperty;
//# sourceMappingURL=schema.d.ts.map