/**
 * Field normalisation for grading. A student's extraction is compared with the
 * ground truth after both sides are normalised, so "1,234.50", "1234.5" and
 * "SAR 1234.50" all count as the same number, and Arabic-Indic digits read from
 * an Arabic document count as their Western equivalents.
 */

export type FieldKind = "number" | "percent" | "date" | "identifier" | "iban" | "text" | "uom";

/** Ground-truth field path (e.g. `lines[0].unitPrice`) to the comparison rule. */
export function fieldKind(field: string): FieldKind {
  const leaf = field.replace(/^lines\[\d+\]\./, "").replace(/^vendor\./, "");
  if (leaf === "taxRate") return "percent";
  if (["subtotal", "taxTotal", "grandTotal", "quantity", "unitPrice", "taxAmount", "lineTotal", "lineCount", "paymentTermsDays", "amount", "leadTimeDays", "packages", "quantityReceived", "quantityAccepted", "quantityRejected"].includes(leaf)) return "number";
  if (/date|expiry|validUntil|issued/i.test(leaf)) return "date";
  if (leaf === "iban") return "iban";
  if (["taxId", "crNumber", "number", "poNumber", "itemCode", "deliveryNoteNumber", "rfqNumber", "invoiceNumber", "paymentReference"].includes(leaf)) return "identifier";
  if (leaf === "uom") return "uom";
  return "text";
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC = "۰۱۲۳۴۵۶۷۸۹";

/** Converts Arabic-Indic and Eastern Arabic digits to Western digits. */
export function westernDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const a = ARABIC_INDIC.indexOf(d);
    return String(a >= 0 ? a : EASTERN_ARABIC.indexOf(d));
  });
}

export function parseNumber(raw: string): number | null {
  const s = westernDigits(String(raw ?? ""))
    .replace(/[ \s]/g, "")
    .replace(/[A-Za-z؀-ۿ%]/g, "")
    .replace(/[،,](?=\d{3}\b)/g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.\-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  // Keep only the last decimal point when several survived (e.g. "1.234.50").
  const parts = s.split(".");
  const n = parts.length > 2 ? Number(`${parts.slice(0, -1).join("")}.${parts.at(-1)}`) : Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Normalises common written date formats to ISO `YYYY-MM-DD`, or null. */
export function parseDate(raw: string): string | null {
  const s = westernDigits(String(raw ?? "")).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const named = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{4})$/);
  if (named) {
    const m = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (m) return `${named[3]}-${String(m).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const [, a, b, y] = dmy;
    // Day-first unless the first component cannot be a day.
    if (Number(a) > 12 || Number(b) > 12) {
      if (Number(a) > 12) return `${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
      return `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    }
    return `${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  return null;
}

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normaliseText(raw: string): string {
  return westernDigits(String(raw ?? ""))
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ْ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normaliseIdentifier(raw: string): string {
  return westernDigits(String(raw ?? "")).toUpperCase().replace(/[\s\-_./\\]/g, "");
}

/** Levenshtein similarity in [0,1]. Used for descriptions and names only. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

export interface Comparison {
  match: boolean;
  /** 0..1; below 1 for a near miss on free text, so partial credit is possible later. */
  similarity: number;
  expectedNormalised: string;
  actualNormalised: string;
}

/** Text similarity at or above this counts as a match for descriptions and names. */
export const TEXT_MATCH_THRESHOLD = 0.9;

export function compareField(field: string, expected: string, actual: string): Comparison {
  const kind = fieldKind(field);
  const blank = (actual ?? "").trim() === "";
  if (blank) return { match: (expected ?? "").trim() === "", similarity: 0, expectedNormalised: expected ?? "", actualNormalised: "" };

  switch (kind) {
    case "number":
    case "percent": {
      const e = parseNumber(expected);
      const a = parseNumber(actual);
      const tolerance = kind === "percent" ? 0.051 : 0.005;
      const ok = e !== null && a !== null && Math.abs(e - a) <= tolerance;
      return { match: ok, similarity: ok ? 1 : 0, expectedNormalised: e === null ? String(expected) : String(e), actualNormalised: a === null ? String(actual) : String(a) };
    }
    case "date": {
      const e = parseDate(expected) ?? expected;
      const a = parseDate(actual) ?? actual;
      return { match: e === a, similarity: e === a ? 1 : 0, expectedNormalised: e, actualNormalised: a };
    }
    case "iban":
    case "identifier": {
      const e = normaliseIdentifier(expected);
      const a = normaliseIdentifier(actual);
      return { match: e === a, similarity: e === a ? 1 : 0, expectedNormalised: e, actualNormalised: a };
    }
    case "uom": {
      const e = normaliseIdentifier(expected);
      const a = normaliseIdentifier(actual);
      return { match: e === a, similarity: e === a ? 1 : 0, expectedNormalised: e, actualNormalised: a };
    }
    case "text": {
      const e = normaliseText(expected);
      const a = normaliseText(actual);
      const sim = similarity(e, a);
      return { match: sim >= TEXT_MATCH_THRESHOLD, similarity: sim, expectedNormalised: e, actualNormalised: a };
    }
  }
}
