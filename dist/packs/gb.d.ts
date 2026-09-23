/**
 * packs/gb.ts: United Kingdom country pack.
 *
 * Redacts personal identifiers (UK GDPR) and adds formats with checksums for NHS
 * numbers and UK VAT numbers. Sources: HMRC NIM39110 (NINO), NHS Data Dictionary,
 * HMRC VAT, Royal Mail; see docs/design/country-packs.md.
 */
import type { CountryPack } from './types.js';
/** NHS number: mod 11 over 10 digits (weights 10..2; a check of 10 is never issued). */
export declare function isValidNhsNumber(raw: string): boolean;
/** UK VAT: 9 or 12 digits with the mod 97 or mod 9755 check; GD and HA formats pass. */
export declare function isValidUkVat(raw: string): boolean;
export declare const unitedKingdom: CountryPack;
//# sourceMappingURL=gb.d.ts.map