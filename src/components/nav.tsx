import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import type { Principal } from "@/lib/identity";

const links: { key: keyof Dictionary["nav"]; href: string; id: string }[] = [
  { key: "dashboard", href: "/", id: "nav-dashboard" },
  { key: "vendors", href: "/vendors", id: "nav-vendors" },
  { key: "items", href: "/items", id: "nav-items" },
  { key: "purchaseOrders", href: "/purchase-orders", id: "nav-purchase-orders" },
  { key: "rules", href: "/rules", id: "nav-rules" },
  { key: "sandbox", href: "/sandbox", id: "nav-sandbox" },
];

export function Nav({ t, locale, principal }: { t: Dictionary; locale: Locale; principal: Principal | null }) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-2">
        <Link id="nav-home" data-testid="nav-home" href="/" className="font-semibold text-primary">
          {t.appName}
        </Link>
        {principal ? (
          <nav id="nav-main" data-testid="nav-main" className="flex flex-wrap gap-1">
            {links.map((l) => (
              <Link key={l.id} id={l.id} data-testid={l.id} href={l.href} className="rounded px-2 py-1 text-sm hover:bg-bg">
                {t.nav[l.key]}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="ms-auto flex items-center gap-3 text-sm">
          <a id="nav-language" data-testid="nav-language" href={`/lang?to=${locale === "ar" ? "en" : "ar"}`} className="text-muted hover:text-ink">
            {t.nav.language}
          </a>
          {principal ? (
            <>
              <span id="nav-user" data-testid="nav-user" data-user-id={principal.userId} className="text-muted">
                {principal.displayName}
              </span>
              <form action="/logout" method="post">
                <button id="nav-logout" data-testid="nav-logout" type="submit" className="text-muted hover:text-ink">
                  {t.nav.logout}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
      <div className="bg-accent/10 text-center text-[11px] tracking-wide text-critical" id="specimen-banner" data-testid="specimen-banner">
        {t.specimen}
      </div>
    </header>
  );
}
