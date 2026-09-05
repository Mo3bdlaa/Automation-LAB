import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, isLocale } from "@/i18n";

export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  const back = req.headers.get("referer") ?? "/";
  const res = NextResponse.redirect(new URL(back, req.nextUrl.origin));
  if (isLocale(to)) res.cookies.set(LOCALE_COOKIE, to, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  return res;
}
