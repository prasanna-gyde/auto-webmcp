// src/packs/us.ts
function isValidRouting(raw) {
  const v = raw.replace(/\D/g, "");
  if (!/^\d{9}$/.test(v))
    return false;
  const prefix = Number(v.slice(0, 2));
  const validPrefix = prefix <= 12 || prefix >= 21 && prefix <= 32 || prefix >= 61 && prefix <= 72 || prefix === 80;
  if (!validPrefix)
    return false;
  const d = Array.from(v, Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}
var VALID_EIN_PREFIXES = new Set(
  "01 02 03 04 05 06 10 11 12 13 14 15 16 20 21 22 23 24 25 26 27 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 71 72 73 74 75 76 77 80 81 82 83 84 85 86 87 88 90 91 92 93 94 95 98 99".split(" ")
);
function isValidEin(raw) {
  const v = raw.replace(/\D/g, "");
  return /^\d{9}$/.test(v) && VALID_EIN_PREFIXES.has(v.slice(0, 2));
}
function isValidNpi(raw) {
  const v = raw.replace(/\D/g, "");
  if (!/^[12]\d{9}$/.test(v))
    return false;
  const digits = Array.from(`80840${v}`, Number).reverse();
  const sum = digits.reduce((acc, d, i) => {
    if (i % 2 === 0)
      return acc + d;
    const doubled = d * 2;
    return acc + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return sum % 10 === 0;
}
var unitedStates = {
  id: "us",
  name: "United States",
  rules: [
    // Redact: personal identifiers (CCPA sensitive personal information, GLBA)
    {
      id: "us.itin",
      label: "ITIN",
      action: "redact",
      match: /\b(itin|individual taxpayer identification( number)?)\b/,
      pattern: "^9\\d{2}-?(5\\d|6[0-5]|7\\d|8[0-8]|9[0-24-9])-?\\d{4}$"
    },
    {
      id: "us.bank-account",
      label: "Bank account number",
      action: "redact",
      match: /\b((bank |checking |savings )?account (number|no)|acct (no|number))\b/,
      exclude: /\b(holder|name|type|routing)\b/,
      pattern: "^\\d{4,17}$",
      hint: "4 to 17 digits"
    },
    {
      id: "us.dob",
      label: "Date of birth",
      action: "redact",
      autocomplete: ["bday", "bday-day", "bday-month", "bday-year"],
      match: /\b(date of birth|dob|birth ?date|birthday)\b/
    },
    { id: "us.dl", label: "Driver's license number", action: "redact", match: /\b(driver'?s? licen[cs]e|dl (number|no)|licen[cs]e (number|no)|state id)\b/ },
    { id: "us.passport", label: "Passport number", action: "redact", match: /\b(passport (number|no))\b/ },
    {
      id: "us.mbi",
      label: "Medicare number",
      action: "redact",
      match: /\b(mbi|medicare (number|id|beneficiary identifier))\b/,
      pattern: "^[1-9][AC-HJKMNP-RT-Yac-hjkmnp-rt-y][AC-HJKMNP-RT-Yac-hjkmnp-rt-y0-9]\\d-?[AC-HJKMNP-RT-Yac-hjkmnp-rt-y][AC-HJKMNP-RT-Yac-hjkmnp-rt-y0-9]\\d-?[AC-HJKMNP-RT-Yac-hjkmnp-rt-y]{2}\\d{2}$"
    },
    // Format: public or business identifiers
    {
      id: "us.routing",
      label: "Routing number",
      action: "format",
      match: /\b(routing( number| no)?|aba( number)?|rtn)\b/,
      pattern: "^\\d{9}$",
      maxLength: 9,
      hint: "9-digit ABA routing number",
      validate: isValidRouting
    },
    {
      id: "us.ein",
      label: "EIN",
      action: "format",
      match: /\b(ein|fein|employer identification( number)?|federal tax id)\b/,
      pattern: "^\\d{2}-?\\d{7}$",
      hint: "EIN, format 12-3456789",
      validate: isValidEin
    },
    { id: "us.npi", label: "NPI", action: "format", match: /\b(npi|national provider identifier)\b/, pattern: "^[12]\\d{9}$", maxLength: 10, validate: isValidNpi },
    {
      id: "us.zip",
      label: "ZIP code",
      action: "format",
      autocomplete: ["postal-code"],
      match: /\b(zip( code)?|postal code)\b/,
      pattern: "^\\d{5}(-\\d{4})?$",
      maxLength: 10,
      hint: "ZIP or ZIP+4, e.g. 94105"
    },
    {
      id: "us.phone",
      label: "Phone number",
      action: "format",
      autocomplete: ["tel", "tel-national"],
      match: /\b(phone( number| no)?|mobile( number)?|cell( phone)?)\b/,
      pattern: "^(\\+?1[-. ]?)?\\(?[2-9]\\d{2}\\)?[-. ]?[2-9]\\d{2}[-. ]?\\d{4}$",
      hint: "10-digit US number, e.g. 415-555-0132"
    }
  ]
};
export {
  isValidEin,
  isValidNpi,
  isValidRouting,
  unitedStates
};
