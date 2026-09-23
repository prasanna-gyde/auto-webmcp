// src/packs/in.ts
var GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function isValidGstin(raw) {
  const v = raw.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v))
    return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = GSTIN_CHARS.indexOf(v[i]);
    const product = code * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + product % 36;
  }
  return GSTIN_CHARS[(36 - sum % 36) % 36] === v[14];
}
var india = {
  id: "in",
  name: "India",
  rules: [
    // Redact: personal identifiers
    {
      id: "in.pan",
      label: "PAN",
      action: "redact",
      match: /\b(pan|pan (number|no|card)|permanent account number)\b|पैन|स्थायी खाता संख्या/,
      exclude: /\b(company|pan india)\b/,
      pattern: "^[A-Za-z]{3}[ABCFGHJLPTabcfghjlpt][A-Za-z]\\d{4}[A-Za-z]$",
      maxLength: 10,
      hint: "10 characters, e.g. ABCDE1234F"
    },
    {
      id: "in.upi",
      label: "UPI ID",
      action: "redact",
      match: /\b(upi (id|address|handle)|vpa|virtual payment address)\b|यूपीआई आईडी/,
      pattern: "^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$",
      hint: "UPI ID, e.g. name@bank"
    },
    {
      id: "in.bank-account",
      label: "Bank account number",
      action: "redact",
      match: /\b((bank )?account (number|no)|a\/?c (no|number)|acct (no|number))\b|खाता संख्या/,
      exclude: /\b(holder|name|type|ifsc)\b/,
      pattern: "^\\d{9,18}$",
      hint: "9 to 18 digits"
    },
    { id: "in.passport", label: "Passport number", action: "redact", match: /\b(passport (number|no))\b|पासपोर्ट/, pattern: "^[A-Za-z]\\d{7}$", maxLength: 8 },
    { id: "in.epic", label: "Voter ID (EPIC)", action: "redact", match: /\b(epic (number|no)?|voter (id|card))\b|मतदाता/ },
    { id: "in.dl", label: "Driving licence number", action: "redact", match: /\b(driving licen[cs]e|dl (number|no)|licen[cs]e (number|no))\b/ },
    { id: "in.abha", label: "ABHA number", action: "redact", match: /\b(abha( number| address)?|health id)\b|आभा/ },
    { id: "in.uan", label: "UAN", action: "redact", match: /\b(uan|universal account number)\b/, pattern: "^\\d{12}$" },
    // Format: business and address fields
    {
      id: "in.gstin",
      label: "GSTIN",
      action: "format",
      match: /\b(gstin|gst (number|no|id|registration)|gst in)\b|जीएसटी/,
      pattern: "^\\d{2}[A-Za-z]{5}\\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$",
      maxLength: 15,
      hint: "15 characters, e.g. 27ABCDE1234F1Z5",
      validate: isValidGstin
    },
    { id: "in.ifsc", label: "IFSC", action: "format", match: /\b(ifsc( code)?)\b/, pattern: "^[A-Za-z]{4}0[A-Za-z0-9]{6}$", maxLength: 11, hint: "11 characters, 5th is 0, e.g. HDFC0001234" },
    { id: "in.tan", label: "TAN", action: "format", match: /\b(tan( number| no)?)\b/, pattern: "^[A-Za-z]{4}\\d{5}[A-Za-z]$", maxLength: 10 },
    { id: "in.cin", label: "CIN", action: "format", match: /\b(cin|corporate identity number)\b/, pattern: "^[LUlu]\\d{5}[A-Za-z]{2}\\d{4}[A-Za-z]{3}\\d{6}$", maxLength: 21 },
    {
      id: "in.pincode",
      label: "PIN code",
      action: "format",
      autocomplete: ["postal-code"],
      match: /\b(pin ?code|postal code|post code|zip( code)?)\b|पिन कोड/,
      pattern: "^[1-9]\\d{5}$",
      maxLength: 6,
      hint: "6-digit PIN code"
    },
    {
      id: "in.mobile",
      label: "Mobile number",
      action: "format",
      autocomplete: ["tel", "tel-national"],
      match: /\b(mobile( number| no)?|phone( number| no)?|contact (number|no)|whatsapp( number)?)\b|मोबाइल/,
      pattern: "^(\\+91[\\s-]?|0)?[6-9]\\d{9}$",
      hint: "10-digit Indian mobile, optional +91"
    }
  ]
};
export {
  india,
  isValidGstin
};
