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

// src/packs/sg.ts
var sg_exports = {};
__export(sg_exports, {
  singapore: () => singapore
});
module.exports = __toCommonJS(sg_exports);
var singapore = {
  id: "sg",
  name: "Singapore",
  rules: [
    // Redact: personal identifiers
    { id: "sg.passport", label: "Passport number", action: "redact", match: /\b(passport (number|no))\b/ },
    {
      id: "sg.dob",
      label: "Date of birth",
      action: "redact",
      autocomplete: ["bday", "bday-day", "bday-month", "bday-year"],
      match: /\b(date of birth|dob|birth ?date)\b/
    },
    // Format: business and address fields
    {
      id: "sg.uen",
      label: "UEN",
      action: "format",
      match: /\b(uen|unique entity number|business registration (number|no))\b/,
      pattern: "^(\\d{8}[A-Za-z]|(19|20)\\d{7}[A-Za-z]|[TSRtsr]\\d{2}[A-Za-z]{2}\\d{4}[A-Za-z])$",
      maxLength: 10,
      hint: "UEN, e.g. 201912345K"
    },
    {
      id: "sg.postal",
      label: "Postal code",
      action: "format",
      autocomplete: ["postal-code"],
      match: /\b(postal code|post code|postcode|zip( code)?)\b/,
      pattern: "^\\d{6}$",
      maxLength: 6,
      hint: "6-digit postal code"
    },
    {
      id: "sg.phone",
      label: "Phone number",
      action: "format",
      autocomplete: ["tel", "tel-national"],
      match: /\b(mobile( number| no)?|phone( number| no)?|handphone|hp (number|no)|contact (number|no))\b/,
      pattern: "^(\\+65[\\s-]?)?[3689]\\d{3}[\\s-]?\\d{4}$",
      hint: "8-digit Singapore number, optional +65"
    }
  ]
};
