/**
 * sensitive.ts: Classify form fields as blocked, redacted or formatted.
 *
 * Core rules are always on: credentials, payment card data and the national IDs
 * whose processing is most restricted. Country packs add redact and format rules.
 * Site owners override per field with data-webmcp-sensitive="allow|redact|block".
 */
import type { CountryPack, FieldAction, FieldRule } from './packs/types.js';
export type { CountryPack, FieldAction, FieldRule } from './packs/types.js';
export declare const CORE_RULES: FieldRule[];
/** Packs from config plus any queued by IIFE pack scripts, de-duplicated by id. */
export declare function getActivePacks(configured: CountryPack[]): CountryPack[];
export interface FieldClassification {
    rule: FieldRule;
    action: FieldAction;
}
/**
 * Decide how a field is exposed. Core rules win over packs; the first match wins.
 * Returns null for ordinary fields.
 */
export declare function classifyField(el: Element, labelText: string, packs: CountryPack[]): FieldClassification | null;
export interface SensitivePolicy {
    /** Fields hidden from the agent; the user must complete them. */
    blocked: Array<{
        key: string;
        label: string;
        ruleId: string;
    }>;
    /** Schema keys whose values are masked in tool results. */
    redacted: Set<string>;
    /** Schema key to rule, for format/redact validation. */
    rules: Map<string, FieldRule>;
}
export declare function createPolicy(): SensitivePolicy;
export declare function hasSensitiveFields(policy: SensitivePolicy | undefined): boolean;
/** Add a rule's pattern, length limit and hint to a schema property. */
export declare function applyRuleToSchema(prop: {
    pattern?: string;
    maxLength?: number;
    description?: string;
    type?: string;
}, rule: FieldRule): void;
/** Mask all but the last 4 characters of a value, keeping separators. */
export declare function maskValue(value: unknown): unknown;
/**
 * Restrict values returned to the agent to exposed schema keys, masking redacted
 * ones. Hidden inputs, passwords and blocked fields never leave the page.
 */
export declare function sanitizeValues(values: Record<string, unknown>, exposedKeys: Set<string> | undefined, policy: SensitivePolicy | undefined): Record<string, unknown>;
//# sourceMappingURL=sensitive.d.ts.map