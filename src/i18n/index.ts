import { en, type Dictionary } from "./en";
import { ar } from "./ar";

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "al_lang";

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

export function dictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function dir(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export type { Dictionary };
