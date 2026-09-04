import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/identity/session";

export function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.nextUrl.origin), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
