/**
 * packs/in.ts: India country pack.
 *
 * Aadhaar and UPI PIN are blocked by core rules. This pack redacts personal IDs and
 * adds formats for business and address fields. Regexes follow UIDAI, CBDT, GSTN and
 * RBI published formats; see docs/design/country-packs.md for sources.
 */
import type { CountryPack } from './types.js';
/** GSTIN check character: Luhn mod 36 over the first 14 characters. */
export declare function isValidGstin(raw: string): boolean;
export declare const india: CountryPack;
//# sourceMappingURL=in.d.ts.map