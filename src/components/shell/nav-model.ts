import type { Dictionary } from "@/i18n";

export interface NavLink {
  key: keyof Dictionary["nav"];
  href: string;
  id: string;
}

export interface NavGroup {
  /** The dictionary key for the group heading, or null for the ungrouped top. */
  label: keyof Dictionary["navGroups"];
  links: NavLink[];
}

/**
 * The application's modules, grouped the way the work moves through them.
 *
 * The order is the process: a request for quotation becomes an order, the
 * order is delivered, the delivery is receipted, the invoice is matched
 * against both, and then it is paid. Somebody who has never seen the system
 * can follow that without being told, which a flat alphabetical strip of
 * thirteen links did not allow.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "procureToPay",
    links: [
      { key: "rfqs", href: "/rfqs", id: "nav-rfqs" },
      { key: "purchaseOrders", href: "/purchase-orders", id: "nav-purchase-orders" },
      { key: "deliveries", href: "/deliveries", id: "nav-deliveries" },
      { key: "grns", href: "/grns", id: "nav-grns" },
      { key: "invoices", href: "/invoices", id: "nav-invoices" },
      { key: "payments", href: "/payments", id: "nav-payments" },
    ],
  },
  {
    label: "masterData",
    links: [
      { key: "vendors", href: "/vendors", id: "nav-vendors" },
      { key: "items", href: "/items", id: "nav-items" },
    ],
  },
  {
    label: "reference",
    links: [
      { key: "rules", href: "/rules", id: "nav-rules" },
      { key: "sandbox", href: "/sandbox", id: "nav-sandbox" },
      { key: "account", href: "/account", id: "nav-account" },
    ],
  },
];

/** What a visitor who has not signed in can reach. */
export const PUBLIC_LINKS: NavLink[] = [
  { key: "challenges", href: "/challenges", id: "nav-challenges" },
  { key: "leaderboard", href: "/leaderboard", id: "nav-leaderboard" },
];
