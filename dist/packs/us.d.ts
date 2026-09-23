/**
 * packs/us.ts: United States country pack.
 *
 * SSN is blocked by core rules. This pack redacts personal identifiers and adds
 * formats with checksums for routing, EIN and NPI numbers. Sources: IRS, CMS,
 * ABA, USPS, NANPA; see docs/design/country-packs.md.
 */
import type { CountryPack } from './types.js';
/** ABA routing number: 3-7-1 weighted checksum and a valid Federal Reserve prefix. */
export declare function isValidRouting(raw: string): boolean;
/** EIN: 9 digits with a prefix the IRS assigns. */
export declare function isValidEin(raw: string): boolean;
/** NPI: Luhn check over "80840" followed by the 10 digits. */
export declare function isValidNpi(raw: string): boolean;
export declare const unitedStates: CountryPack;
//# sourceMappingURL=us.d.ts.map