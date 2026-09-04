/**
 * Check-digit schemes used by the lab's fictional jurisdiction.
 * Students are told these formats so they can write validation rules
 * against them. See docs/data-formats.md.
 */

/** ISO 7064 mod 97-10 as used by IBAN. Returns true if the IBAN is valid. */
export function isValidIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  return mod97(s.slice(4) + s.slice(0, 4)) === 1;
}

/** Compute the two check digits for a country code + BBAN. */
export function ibanCheckDigits(country: string, bban: string): string {
  const rem = mod97(bban + country + "00");
  const check = 98 - rem;
  return check < 10 ? `0${check}` : String(check);
}

export function mod97(s: string): number {
  let rem = 0;
  for (const ch of s) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}

/** Luhn check digit for a numeric payload. */
export function luhnCheckDigit(payload: string): string {
  let sum = 0;
  let dbl = true; // rightmost payload digit is doubled
  for (let i = payload.length - 1; i >= 0; i--) {
    let d = Number(payload[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isLuhnValid(num: string): boolean {
  if (!/^\d{2,}$/.test(num)) return false;
  return luhnCheckDigit(num.slice(0, -1)) === num.slice(-1);
}

/**
 * Tax registration number: 15 digits. Starts with 3, 13 payload digits, Luhn check.
 * (The leading 3 mirrors regional VAT-number conventions without being one.)
 */
export function isValidTaxId(taxId: string): boolean {
  return /^3\d{14}$/.test(taxId) && isLuhnValid(taxId);
}

export function makeTaxId(payload13: string): string {
  const body = "3" + payload13;
  return body + luhnCheckDigit(body);
}

/**
 * Commercial registration number: 10 digits, weighted mod-11 check digit
 * (weights 2..10 from the right, remainder mapped 10→0).
 */
export function crCheckDigit(payload9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(payload9[8 - i]) * (i + 2);
  const r = (11 - (sum % 11)) % 11;
  return String(r === 10 ? 0 : r);
}

export function isValidCrNumber(cr: string): boolean {
  return /^\d{10}$/.test(cr) && crCheckDigit(cr.slice(0, 9)) === cr.slice(9);
}

export function makeCrNumber(payload9: string): string {
  return payload9 + crCheckDigit(payload9);
}
