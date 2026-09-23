/**
 * packs/types.ts: Shared types for sensitive-field rules and country packs.
 *
 * Packs are plain data plus small validators, with no imports from core, so each
 * pack tree-shakes on its own and its IIFE build stays a few kilobytes.
 */
/**
 * - block: never exposed to agents; the user completes the field.
 * - redact: exposed, but the value is masked in tool results and the tool is consequential.
 * - format: exposed with a JSON Schema pattern and a short description.
 */
export type FieldAction = 'block' | 'redact' | 'format';
export interface FieldRule {
    /** Stable identifier, e.g. "in.gstin". */
    id: string;
    /** Human-readable name used in descriptions and requires_user lists. */
    label: string;
    action: FieldAction;
    /**
     * Tested against the field's normalized text: autocomplete, name, id, label,
     * placeholder, aria-label and title, lowercased with _ - . replaced by spaces.
     */
    match?: RegExp;
    /** autocomplete tokens that identify the field on their own. */
    autocomplete?: string[];
    /** Text that vetoes a `match` hit (e.g. "account holder name"). */
    exclude?: RegExp;
    /** JSON Schema pattern for the value. */
    pattern?: string;
    /** Short hint added to the field description (keep under 80 characters). */
    hint?: string;
    maxLength?: number;
    /** Checksum or validity check; failures produce an invalid_format warning. */
    validate?: (value: string) => boolean;
}
export interface CountryPack {
    /** ISO 3166-1 alpha-2 code, lowercase (e.g. "in", "us"). */
    id: string;
    name: string;
    rules: FieldRule[];
}
//# sourceMappingURL=types.d.ts.map