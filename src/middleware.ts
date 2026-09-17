import { NextResponse, type NextRequest } from "next/server";

/**
 * Puts the path on a request header so the layout can read it.
 *
 * A server layout is not told which page it is wrapping, and the shell needs
 * to know: the sidebar marks where you are, and the breadcrumb names it. This
 * is the documented way to pass it down without turning the whole shell into
 * a client component.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything but the things that are not pages.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
