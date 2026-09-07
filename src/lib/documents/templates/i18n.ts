/**
 * Document language. A vendor prints its own paperwork in its own script, so
 * the same lab produces English, Arabic-first and bilingual documents and a
 * student's extraction has to cope with all three.
 *
 * The rule for every template: whatever the primary script, the values a grader
 * checks stay machine-readable. Dates always carry their ISO form (a Hijri date
 * is printed beside it, never instead of it) and identifiers keep their digits,
 * in Eastern Arabic numerals where a vendor would use them - the grader folds
 * those back to Western digits.
 */
import { hashString } from "../../generator/rng";

export type DocLang = "en" | "ar" | "bilingual";

const EASTERN = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Western digits to Eastern Arabic-Indic. Separators are left alone. */
export function easternDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => EASTERN[Number(d)]);
}

/**
 * Arithmetic ("tabular") Hijri conversion. Civil calendars in the region print
 * the Umm al-Qura date, which follows observation and needs a lookup table;
 * the tabular calendar is within a day of it and, unlike Intl, gives the same
 * answer on every runtime and ICU version - and the lab never grades the Hijri
 * date, it prints it as the extra text a real document carries.
 */
export function hijriFromIso(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  // Gregorian date to Julian Day Number.
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  // Julian Day Number to tabular Hijri (epoch 1 Muharram 1 AH = JDN 1948440).
  const days = jdn - 1948440 + 10632;
  const n = Math.floor((days - 1) / 10631);
  const rest1 = days - 10631 * n + 354;
  const j = Math.floor((10985 - rest1) / 5316) * Math.floor((50 * rest1) / 17719) + Math.floor(rest1 / 5670) * Math.floor((43 * rest1) / 15238);
  const rest2 = rest1 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * rest2) / 709);
  const day = rest2 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

export function hijriLabel(iso: string, useEastern: boolean): string {
  const h = hijriFromIso(iso);
  const s = `${String(h.year).padStart(4, "0")}/${String(h.month).padStart(2, "0")}/${String(h.day).padStart(2, "0")}`;
  return `${useEastern ? easternDigits(s) : s} هـ`;
}

export interface DocLocale {
  lang: DocLang;
  dir: "ltr" | "rtl";
  /** Arabic first, English as the secondary script. */
  arabicFirst: boolean;
  /** This vendor prints numbers in Eastern Arabic numerals. */
  eastern: boolean;
  /** A label with its translation, ordered for this document's script. */
  label(en: string, ar: string): string;
  /** A label with the translation on a line of its own (table headers). */
  labelBlock(en: string, ar: string): string;
  /** Plain-text label, for titles and alt text. */
  plain(en: string, ar: string): string;
  /** A value a grader will read back: digits localised, never reordered. */
  digits(value: string | number): string;
  /** Latin text inside an Arabic document, isolated so bidi leaves it alone. */
  ltr(value: string): string;
  /** A date: always ISO, with the Hijri date beside it on Arabic documents. */
  date(iso: string): string;
  /** Both scripts of a party name, primary first. */
  name(en: string, ar: string | null): string;
}

export function docLocale(lang: DocLang, key = ""): DocLocale {
  const arabicFirst = lang === "ar";
  // Roughly two in five Arabic-first vendors print Eastern numerals. Derived
  // from the vendor key so one vendor is consistent across all its documents.
  const eastern = arabicFirst && hashString(`automation-lab:eastern-digits:${key}`) % 100 < 40;
  const wrap = (v: string) => (arabicFirst ? `<span class="ltr nowrap">${v}</span>` : v);
  const digits = (v: string | number) => wrap(escapeHtml(eastern ? easternDigits(String(v)) : String(v)));
  return {
    lang,
    dir: arabicFirst ? "rtl" : "ltr",
    arabicFirst,
    eastern,
    label(en, ar) {
      if (lang === "en") return escapeHtml(en);
      if (arabicFirst) return `<span class="ar" dir="rtl">${escapeHtml(ar)}</span> <span class="alt">${escapeHtml(en)}</span>`;
      return `${escapeHtml(en)} <span class="ar">${escapeHtml(ar)}</span>`;
    },
    labelBlock(en, ar) {
      if (lang === "en") return escapeHtml(en);
      if (arabicFirst) return `<span class="ar" dir="rtl">${escapeHtml(ar)}</span><span class="alt block">${escapeHtml(en)}</span>`;
      return `${escapeHtml(en)}<span class="ar block">${escapeHtml(ar)}</span>`;
    },
    plain(en, ar) {
      return arabicFirst ? ar : en;
    },
    digits,
    ltr(value) {
      return arabicFirst ? `<span class="ltr">${escapeHtml(value)}</span>` : escapeHtml(value);
    },
    date(iso) {
      const d = digits(iso);
      return lang === "en" ? d : `${d}<span class="hijri"> · ${hijriLabel(iso, eastern)}</span>`;
    },
    name(en, ar) {
      if (!ar || lang === "en") return escapeHtml(en);
      if (arabicFirst) return `<span class="ar" dir="rtl">${escapeHtml(ar)}</span> <span class="alt">${escapeHtml(en)}</span>`;
      return `${escapeHtml(en)} <span class="ar" dir="rtl">${escapeHtml(ar)}</span>`;
    },
  };
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
