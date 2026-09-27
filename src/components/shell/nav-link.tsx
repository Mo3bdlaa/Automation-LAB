"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A navigation link that works out for itself whether it is the page you are
 * on, by reading the path on the client.
 *
 * It used to be told. The middleware put the path on a request header and the
 * layout passed it down — which is the documented way to get the path into a
 * server layout, and is correct exactly once: on the first render. Next does
 * not re-render a layout when you click from one module to a sibling, so on
 * every click after that the shell was still describing the page you came
 * from. Clicking Purchase Orders left the sidebar highlighting Deliveries and
 * the breadcrumb reading "Automation Lab / Deliveries" over the purchase
 * order table, until you reloaded.
 *
 * `exact` is for the dashboard: every path starts with "/".
 */
export function NavLink({
  href,
  exact = false,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href" | "aria-current"> & { href: string; exact?: boolean }) {
  const pathname = usePathname() ?? "/";
  const here = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return <Link href={href} aria-current={here ? "page" : undefined} {...rest} />;
}
