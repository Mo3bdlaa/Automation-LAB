import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import type { Principal } from "@/lib/identity";

const links: { key: keyof Dictionary["nav"]; href: string; id: string }[] = [
  { key: "dashboard", href: "/", id: "nav-dashboard" },
  { key: "vendors", href: "/vendors", id: "nav-vendors" },
  { key: "items", href: "/items", id: "nav-items" },
  { key: "rfqs", href: "/rfqs", id: "nav-rfqs" },
  { key: "purchaseOrders", href: "/purchase-orders", id: "nav-purchase-orders" },
  { key: "deliveries", href: "/deliveries", id: "nav-deliveries" },
  { key: "grns", href: "/grns", id: "nav-grns" },
  { key: "invoices", href: "/invoices", id: "nav-invoices" },
  { key: "payments", href: "/payments", id: "nav-payments" },
  { key: "rules", href: "/rules", id: "nav-rules" },
  { key: "sandbox", href: "/sandbox", id: "nav-sandbox" },
];

export function Nav({ t, locale, principal }: { t: Dictionary; locale: Locale; principal: Principal | null }) {
  return (
    <header className="shell">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-2">
        <Link id="nav-home" data-testid="nav-home" href="/" className="shell-title">
          <span className="logo" aria-hidden="true">
            AL
          </span>
          {t.appName}
        </Link>
        {principal ? (
          <nav id="nav-main" data-testid="nav-main" className="flex flex-wrap gap-0.5">
            {links.map((l) => (
              <Link key={l.id} id={l.id} data-testid={l.id} href={l.href}>
                {t.nav[l.key]}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="ms-auto flex items-center gap-3 shell-meta">
          <a id="nav-language" data-testid="nav-language" href={`/lang?to=${locale === "ar" ? "en" : "ar"}`}>
            {t.nav.language}
          </a>
          {principal ? (
            <>
              <span id="nav-user" data-testid="nav-user" data-user-id={principal.userId} data-roles={principal.roles.join(",")}>
                {principal.displayName}
              </span>
              <form action="/logout" method="post">
                <button id="nav-logout" data-testid="nav-logout" type="submit">
                  {t.nav.logout}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
      <div className="specimen-bar" data-testid="specimen-banner">
        {t.specimen}
      </div>
    </header>
  );
}
