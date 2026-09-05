import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, dictionary, dir, isLocale, type Locale } from "./index";

export async function currentLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
}

export async function i18n() {
  const locale = await currentLocale();
  return { locale, t: dictionary(locale), dir: dir(locale) };
}
