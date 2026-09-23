/**
 * sensitive.ts: Classify form fields as blocked, redacted or formatted.
 *
 * Core rules are always on: credentials, payment card data and the national IDs
 * whose processing is most restricted. Country packs add redact and format rules.
 * Site owners override per field with data-webmcp-sensitive="allow|redact|block".
 */

import type { CountryPack, FieldAction, FieldRule } from './packs/types.js';

export type { CountryPack, FieldAction, FieldRule } from './packs/types.js';

// ---------------------------------------------------------------------------
// Core rules (always on)
// ---------------------------------------------------------------------------

export const CORE_RULES: FieldRule[] = [
  // Credentials and authentication factors (NIST SP 800-63B, PSD2 SCA, RBI AFA)
  {
    id: 'core.otp',
    label: 'One-time code',
    action: 'block',
    autocomplete: ['one-time-code'],
    match: /\b(otp|one time (pass(word|code)?|code)|verification code|auth(entication)? code|2fa|mfa|totp|sms code|bestätigungscode)\b|ओटीपी|सत्यापन कोड/,
  },
  {
    id: 'core.password',
    label: 'Password',
    action: 'block',
    autocomplete: ['current-password', 'new-password', 'webauthn'],
    match: /\b(password|passcode|passwd|passwort|mot de passe)\b/,
  },
  {
    id: 'core.secret-pin',
    label: 'PIN',
    action: 'block',
    match: /\b(upi pin|m ?pin|atm pin|card pin|debit pin|transaction pin|t ?pin|pin number|security pin)\b|यूपीआई पिन/,
  },
  {
    id: 'core.security-answer',
    label: 'Security answer',
    action: 'block',
    match: /\b((security|secret) (question|answer)|maiden name|memorable (word|answer)|first pet)\b/,
  },
  // Payment card data (PCI DSS v4.0.1 Req 3.3.1): the user enters it, never the agent
  {
    id: 'core.card-number',
    label: 'Card number',
    action: 'block',
    autocomplete: ['cc-number'],
    match: /\b(card ?(number|no)|credit card|debit card|cc ?num(ber)?|ccnum|kartennummer|numéro de carte)\b/,
  },
  {
    id: 'core.card-csc',
    label: 'Card security code',
    action: 'block',
    autocomplete: ['cc-csc'],
    match: /\b(cvv2?|cvc2?|csc|cvn|card (security|verification) code|security code)\b/,
  },
  {
    id: 'core.card-expiry',
    label: 'Card expiry',
    action: 'block',
    autocomplete: ['cc-exp', 'cc-exp-month', 'cc-exp-year'],
    match: /\b((card|cc) exp\w*|exp(iry|iration)? (date|month|year|mm|yy)|valid (thru|through))\b/,
  },
  // National IDs whose processing is most restricted
  {
    id: 'in.aadhaar',
    label: 'Aadhaar number',
    action: 'block',
    match: /\b(aadhaa?r|adhaar|aadhaar vid)\b|आधार|ஆதார்|আধার|ఆధార్/,
  },
  {
    id: 'us.ssn',
    label: 'Social Security number',
    action: 'block',
    match: /\b(ssn|social security( number| no)?|soc sec)\b/,
  },
  {
    id: 'sg.nric',
    label: 'NRIC/FIN',
    action: 'block',
    match: /\b(nric|uinfin|nric ?\/? ?fin|fin (number|no))\b/,
  },
  {
    id: 'nl.bsn',
    label: 'BSN',
    action: 'block',
    match: /\b(bsn|burgerservicenummer|sofi ?nummer)\b/,
  },
  {
    id: 'ie.ppsn',
    label: 'PPS number',
    action: 'block',
    match: /\b(ppsn|pps (number|no)|personal public service)\b/,
  },
  {
    id: 'be.rrn',
    label: 'National register number',
    action: 'block',
    match: /\b(rijksregisternummer|registre national|niss|insz|national register number)\b/,
  },
];

// ---------------------------------------------------------------------------
// Pack registry (IIFE packs queue themselves on window before or after core loads)
// ---------------------------------------------------------------------------

type PackQueueWindow = { __AUTO_WEBMCP_PACKS?: CountryPack[] };

/** Packs from config plus any queued by IIFE pack scripts, de-duplicated by id. */
export function getActivePacks(configured: CountryPack[]): CountryPack[] {
  const queued = typeof window !== 'undefined' ? (window as unknown as PackQueueWindow).__AUTO_WEBMCP_PACKS ?? [] : [];
  const byId = new Map<string, CountryPack>();
  for (const pack of [...configured, ...queued]) {
    if (pack && Array.isArray(pack.rules)) byId.set(pack.id, pack);
  }
  return Array.from(byId.values());
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface FieldClassification {
  rule: FieldRule;
  action: FieldAction;
}

type Override = 'allow' | 'redact' | 'block';

function readOverride(el: Element): Override | null {
  const raw = el.getAttribute('data-webmcp-sensitive')?.trim().toLowerCase();
  return raw === 'allow' || raw === 'redact' || raw === 'block' ? raw : null;
}

/** Lowercased text describing a field, with _ - . collapsed to spaces for \b matching. */
function fieldText(el: Element, labelText: string): string {
  const parts = [
    el.getAttribute('name'),
    el.id,
    labelText,
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
  ];
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([0-9])/g, '$1 $2');
}

function autocompleteTokens(el: Element): string[] {
  return (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

function ruleMatches(rule: FieldRule, text: string, tokens: string[]): boolean {
  if (rule.autocomplete?.some((t) => tokens.includes(t))) return true;
  if (!rule.match || !rule.match.test(text)) return false;
  return !(rule.exclude && rule.exclude.test(text));
}

const OVERRIDE_RULE: FieldRule = { id: 'site.override', label: 'Sensitive field', action: 'block' };

/**
 * Decide how a field is exposed. Core rules win over packs; the first match wins.
 * Returns null for ordinary fields.
 */
export function classifyField(el: Element, labelText: string, packs: CountryPack[]): FieldClassification | null {
  const override = readOverride(el);
  if (override === 'allow') return null;

  const text = fieldText(el, labelText);
  const tokens = autocompleteTokens(el);
  let matched: FieldRule | null = null;
  for (const rule of CORE_RULES) {
    if (ruleMatches(rule, text, tokens)) { matched = rule; break; }
  }
  if (!matched) {
    outer: for (const pack of packs) {
      for (const rule of pack.rules) {
        if (ruleMatches(rule, text, tokens)) { matched = rule; break outer; }
      }
    }
  }

  if (override) return { rule: matched ?? { ...OVERRIDE_RULE, action: override }, action: override };
  return matched ? { rule: matched, action: matched.action } : null;
}

// ---------------------------------------------------------------------------
// Per-tool policy
// ---------------------------------------------------------------------------

export interface SensitivePolicy {
  /** Fields hidden from the agent; the user must complete them. */
  blocked: Array<{ key: string; label: string; ruleId: string }>;
  /** Schema keys whose values are masked in tool results. */
  redacted: Set<string>;
  /** Schema key to rule, for format/redact validation. */
  rules: Map<string, FieldRule>;
}

export function createPolicy(): SensitivePolicy {
  return { blocked: [], redacted: new Set(), rules: new Map() };
}

export function hasSensitiveFields(policy: SensitivePolicy | undefined): boolean {
  return !!policy && (policy.blocked.length > 0 || policy.redacted.size > 0);
}

/** Add a rule's pattern, length limit and hint to a schema property. */
export function applyRuleToSchema(
  prop: { pattern?: string; maxLength?: number; description?: string; type?: string },
  rule: FieldRule,
): void {
  if (prop.type !== 'string') return;
  if (rule.pattern && !prop.pattern) prop.pattern = rule.pattern;
  if (rule.maxLength && !prop.maxLength) prop.maxLength = rule.maxLength;
  if (rule.hint) prop.description = prop.description ? `${prop.description} (${rule.hint})` : rule.hint;
}

/** Mask all but the last 4 characters of a value, keeping separators. */
export function maskValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskValue);
  if (typeof value !== 'string' || value === '') return value;
  const chars = Array.from(value);
  const alnumIdx = chars.map((c, i) => (/[A-Za-z0-9]/.test(c) ? i : -1)).filter((i) => i >= 0);
  const keep = alnumIdx.length > 4 ? new Set(alnumIdx.slice(-4)) : new Set<number>();
  return chars.map((c, i) => (/[A-Za-z0-9]/.test(c) && !keep.has(i) ? 'X' : c)).join('');
}

/**
 * Restrict values returned to the agent to exposed schema keys, masking redacted
 * ones. Hidden inputs, passwords and blocked fields never leave the page.
 */
export function sanitizeValues(
  values: Record<string, unknown>,
  exposedKeys: Set<string> | undefined,
  policy: SensitivePolicy | undefined,
): Record<string, unknown> {
  if (!exposedKeys) return values;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!exposedKeys.has(key)) continue;
    out[key] = policy?.redacted.has(key) ? maskValue(value) : value;
  }
  return out;
}
