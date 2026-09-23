"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/packs/gb.ts
var gb_exports = {};
__export(gb_exports, {
  isValidNhsNumber: () => isValidNhsNumber,
  isValidUkVat: () => isValidUkVat,
  unitedKingdom: () => unitedKingdom
});
module.exports = __toCommonJS(gb_exports);
function isValidNhsNumber(raw) {
  const v = raw.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(v))
    return false;
  let sum = 0;
  for (let i = 0; i < 9; i++)
    sum += Number(v[i]) * (10 - i);
  let check = 11 - sum % 11;
  if (check === 11)
    check = 0;
  return check !== 10 && check === Number(v[9]);
}
function isValidUkVat(raw) {
  let v = raw.replace(/\s/g, "").toUpperCase().replace(/^(GB|XI)/, "");
  if (/^(GD[0-4]\d{2}|HA[5-9]\d{2})$/.test(v))
    return true;
  if (/^\d{12}$/.test(v))
    v = v.slice(0, 9);
  if (!/^\d{9}$/.test(v))
    return false;
  let total = 0;
  for (let i = 0; i < 7; i++)
    total += Number(v[i]) * (8 - i);
  total += Number(v.slice(7));
  return total % 97 === 0 || (total + 55) % 97 === 0;
}
var unitedKingdom = {
  id: "gb",
  name: "United Kingdom",
  rules: [
    // Redact: personal identifiers
    {
      id: "gb.nino",
      label: "National Insurance number",
      action: "redact",
      match: /\b(national insurance( number| no)?|ni (number|no)|nino)\b/,
      pattern: "^(?!BG|GB|KN|NK|NT|TN|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?[A-D]$",
      hint: "uppercase, e.g. AB 12 34 56 C"
    },
    {
      id: "gb.nhs",
      label: "NHS number",
      action: "redact",
      match: /\b(nhs (number|no)|chi (number|no))\b/,
      pattern: "^\\d{3}[\\s-]?\\d{3}[\\s-]?\\d{4}$",
      hint: "10 digits, e.g. 943 476 5919",
      validate: isValidNhsNumber
    },
    { id: "gb.utr", label: "UTR", action: "redact", match: /\b(utr|unique tax(payer)? reference)\b/, pattern: "^\\d{5}\\s?\\d{5}[Kk]?$", hint: "10-digit UTR" },
    {
      id: "gb.bank-account",
      label: "Bank account number",
      action: "redact",
      match: /\b((bank )?account (number|no)|acct (no|number))\b/,
      exclude: /\b(holder|name|type|sort)\b/,
      pattern: "^\\d{8}$",
      maxLength: 8,
      hint: "8-digit account number"
    },
    { id: "gb.passport", label: "Passport number", action: "redact", match: /\b(passport (number|no))\b/, pattern: "^\\d{9}$", maxLength: 9 },
    { id: "gb.dl", label: "Driving licence number", action: "redact", match: /\b(driving licen[cs]e( number| no)?|licen[cs]e (number|no))\b/ },
    {
      id: "gb.dob",
      label: "Date of birth",
      action: "redact",
      autocomplete: ["bday", "bday-day", "bday-month", "bday-year"],
      match: /\b(date of birth|dob|birth ?date)\b/
    },
    // Format: bank, business and address fields
    { id: "gb.sort-code", label: "Sort code", action: "format", match: /\b(sort ?code)\b/, pattern: "^\\d{2}-?\\d{2}-?\\d{2}$", maxLength: 8, hint: "e.g. 12-34-56" },
    {
      id: "gb.company-number",
      label: "Company number",
      action: "format",
      match: /\b(company (registration )?(number|no)|companies house( number)?|crn)\b/,
      pattern: "^([A-Za-z]{2}\\d{6}|\\d{8})$",
      maxLength: 8,
      hint: "8 characters, e.g. 01234567 or SC123456"
    },
    {
      id: "gb.vat",
      label: "UK VAT number",
      action: "format",
      match: /\b(vat (registration )?(number|no|reg)|vat id)\b/,
      pattern: "^((GB|XI)\\s?)?(\\d{3}\\s?\\d{4}\\s?\\d{2}(\\s?\\d{3})?|GD[0-4]\\d{2}|HA[5-9]\\d{2})$",
      hint: "e.g. GB 999 9999 73",
      validate: isValidUkVat
    },
    {
      id: "gb.postcode",
      label: "Postcode",
      action: "format",
      autocomplete: ["postal-code"],
      match: /\b(post ?code|postal code|zip( code)?)\b/,
      pattern: "^([A-Za-z]{1,2}\\d[A-Za-z\\d]?\\s?\\d[A-Za-z]{2}|[Gg][Ii][Rr]\\s?0[Aa]{2})$",
      maxLength: 8,
      hint: "e.g. SW1A 1AA"
    },
    {
      id: "gb.phone",
      label: "Phone number",
      action: "format",
      autocomplete: ["tel", "tel-national"],
      match: /\b(mobile( number| no)?|phone( number| no)?|telephone( number)?|contact (number|no))\b/,
      pattern: "^(\\+44\\s?|0)(\\d\\s?){9,10}$",
      hint: "UK number, e.g. 07700 900123"
    }
  ]
};
