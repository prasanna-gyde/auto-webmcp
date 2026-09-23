/**
 * packs/sg.ts: Singapore country pack.
 *
 * NRIC/FIN and Singpass credentials are blocked by core rules (PDPC NRIC Advisory
 * Guidelines). This pack adds formats for business and address fields. The UEN check
 * letter algorithm is not published, so UEN is pattern-only. Sources:
 * docs/design/country-packs.md.
 */
import type { CountryPack } from './types.js';
export declare const singapore: CountryPack;
//# sourceMappingURL=sg.d.ts.map