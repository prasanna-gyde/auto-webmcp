# Sensitive fields and country packs

Status: shipped in v0.5.0 (core rules, India and US packs). Planned: Singapore and UK (0.5.x), EU shared rules plus DE, FR, IT, ES, NL (0.6.0).

## Principle

Safety is global, formatting is local.

- **Core rules** are always on. They block credentials, payment card data and the national IDs whose processing is most restricted. A site that never configures a pack is still protected.
- **Country packs** are opt-in. They redact personal identifiers and add JSON Schema patterns so agents format values correctly.
- **Site owners** override per field with `data-webmcp-sensitive="allow|redact|block"`. The operator, not the library, holds the legal basis for processing (for example, Dutch BSN).

This matches how browser agents already behave: Claude in Chrome, Gemini in Chrome and OpenAI's agent hand card details, passwords and OTPs back to the user.

## Tiers

| Tier | Agent sees the field | Value in tool results | Tool annotation |
|---|---|---|---|
| block | No; listed in `requires_user` and the tool description | Never | `consequentialHint` |
| redact | Yes | Masked, last 4 characters kept (`XXXX XXXX 1234`) | `consequentialHint` |
| format | Yes, with `pattern`, `maxLength` and a short hint | Plain | none |

Checksum failures on format fields (GSTIN, ABA routing, EIN, NPI) return an `invalid_format` warning.

Tool results only contain values for fields in the schema. Hidden inputs (CSRF tokens), passwords and blocked fields never leave the page.

## Limits

Packs control what auto-webmcp puts into the agent's context and logs. They cannot stop an agent that reads the DOM or takes screenshots. For KYC and payment pages, also send `Permissions-Policy: tools=()` so no tools register there.

Detection needs a matching label, name, placeholder or autocomplete token. HTML has autocomplete tokens for cards, passwords and OTPs, but none for national IDs, so packs match field text. Checksums are used to validate values, never as the only signal: many 9 to 12 digit numbers pass Luhn or mod-11 by chance.

## Core rules

| Rule | Detection | Basis |
|---|---|---|
| One-time code | `autocomplete=one-time-code`; otp, verification code, 2fa, ओटीपी | NIST SP 800-63B; PSD2 SCA-RTS Art. 4; RBI authentication directions 2025 |
| Password | `current-password`, `new-password`, `webauthn`; password, passcode | NIST SP 800-63B |
| Secret PIN | upi pin, mpin, atm pin, card pin, tpin. Plain "pin" is not matched, so "PIN code" (Indian postal code) stays usable | PCI DSS 3.3.1.3; RBI AFA |
| Security answer | security question/answer, maiden name | NIST SP 800-63B (no KBA) |
| Card number, CSC, expiry | `cc-number`, `cc-csc`, `cc-exp*`; card number, cvv, expiry date | PCI DSS v4.0.1 Req 3.3.1 |
| Aadhaar | aadhaar, आधार and other Indian-script labels | Aadhaar Act s.29; UIDAI masking and Data Vault rules |
| US SSN | ssn, social security | CCPA 1798.140(ae); state SSN laws |
| Singapore NRIC/FIN | nric, uinfin, fin number | PDPC NRIC Advisory Guidelines (2019) |
| Dutch BSN | bsn, burgerservicenummer | UAVG Art. 46; Wabb |
| Irish PPSN | ppsn, pps number | Social Welfare Consolidation Act 2005 s.262 |
| Belgian national register number | rijksregisternummer, registre national, niss, insz | Law of 8 Aug 1983 |

## India pack (`auto-webmcp/packs/in`)

| Field | Tier | Format |
|---|---|---|
| PAN | redact | `^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$` |
| UPI ID | redact | `name@handle` |
| Bank account | redact | 9 to 18 digits |
| Passport, voter ID (EPIC), driving licence, ABHA, UAN | redact | |
| GSTIN | format | 15 characters, Luhn mod 36 check character |
| IFSC | format | `^[A-Z]{4}0[A-Z0-9]{6}$` |
| TAN, CIN | format | |
| PIN code | format | `^[1-9]\d{5}$` |
| Mobile | format | `^(\+91[\s-]?|0)?[6-9]\d{9}$` |

## US pack (`auto-webmcp/packs/us`)

| Field | Tier | Format |
|---|---|---|
| ITIN | redact | IRS Pub 4757 group ranges |
| Bank account | redact | 4 to 17 digits (NACHA) |
| Date of birth | redact | `bday*` tokens |
| Driver's license, passport, Medicare MBI | redact | MBI per CMS spec |
| ABA routing | format | 3-7-1 checksum, Federal Reserve prefixes |
| EIN | format | IRS valid prefixes |
| NPI | format | Luhn with 80840 prefix |
| ZIP / ZIP+4 | format | `^\d{5}(-\d{4})?$` |
| Phone (NANP) | format | |

## Usage

```js
import { autoWebMCP } from 'auto-webmcp';
import { india } from 'auto-webmcp/packs/in';

autoWebMCP({ packs: [india] });
```

Script tag: load the pack before the core bundle.

```html
<script src="https://unpkg.com/auto-webmcp@0.6.0/dist/packs/in.iife.js"></script>
<script src="https://unpkg.com/auto-webmcp@0.6.0/dist/auto-webmcp.iife.js"></script>
```

## Open questions

- **Aadhaar default.** Blocked, because redacting still puts the full number in the agent's transcript. A site can set `data-webmcp-sensitive="redact"`. Get a legal opinion before marketing Aadhaar handling.
- **Automatic pack selection** from `<html lang>` or address fields is not implemented. Labels are ambiguous across countries ("PIN"), and a wrong guess blocks or reformats the wrong fields.
- **Spec.** The WebMCP spec does not address sensitive fields yet. A spec issue is drafted.

## Sources

- PCI DSS v4.0.1, Req 3.3.1 (sensitive authentication data)
- NIST SP 800-63B-4: https://pages.nist.gov/800-63-4/sp800-63b.html
- UIDAI masked Aadhaar: https://www.uidai.gov.in/en/283-faqs/aadhaar-online-services/e-aadhaar/1887-what-is-masked-aadhaar.html
- Aadhaar Act (as amended): https://uidai.gov.in/images/Aadhaar_Act_2016_as_amended.pdf
- PDPC NRIC Advisory Guidelines: https://www.pdpc.gov.sg/guidelines-and-consultation/2020/02/advisory-guidelines-on-the-personal-data-protection-act-for-nric-and-other-national-identification-numbers
- GDPR Art. 87: https://gdpr-info.eu/art-87-gdpr/
- NL Wabb: https://wetten.overheid.nl/BWBR0022428/
- SCA-RTS (Reg. 2018/389): https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32018R0389
- Cal. Civ. Code 1798.140: https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140.
- IRS valid EIN prefixes: https://www.irs.gov/businesses/small-businesses-self-employed/how-eins-are-assigned-and-valid-ein-prefixes
- IRS Pub 4757 (ITIN): https://www.irs.gov/pub/irs-pdf/p4757.pdf
- CMS MBI format: https://www.cms.gov/medicare/new-medicare-card/understanding-the-mbi.pdf
- CMS NPI check digit: https://www.cms.gov/Regulations-and-Guidance/Administrative-Simplification/NationalProvIdentStand/Downloads/NPIcheckdigit.pdf
- WHATWG autofill tokens: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill-detail-tokens
- Chrome WebMCP secure tools: https://developer.chrome.com/docs/ai/webmcp/secure-tools
- Claude in Chrome safety: https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely
