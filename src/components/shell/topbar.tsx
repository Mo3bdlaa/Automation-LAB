import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import type { Principal } from "@/lib/identity";
import { EnvChip } from "./env-chip";
import { SearchIcon } from "./icons";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = [...parts[0]][0] ?? "";
  const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * The bar above the content: where you are, one search box, who you are.
 *
 * The search box is a real form pointed at /search, so a bot can use it the
 * same way a person does, and it is the only search in the application —
 * every list screen filters, but finding a document by its number is one
 * thing in one place.
 */
export function TopBar({ t, locale, principal, crumbs }: { t: Dictionary; locale: Locale; principal: Principal; crumbs: { label: string; href?: string }[] }) {
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label={t.common.breadcrumb}>
        <Link href="/">{t.appShortName}</Link>
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} style={{ display: "contents" }}>
            <span aria-hidden="true">/</span>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="crumb-here">{c.label}</span>}
          </span>
        ))}
      </nav>

      <form className="topbar-search" action="/search" method="get" role="search">
        <SearchIcon />
        <label htmlFor="global-search" className="sr-only">
          {t.common.search}
        </label>
        <input id="global-search" data-testid="global-search" name="q" type="search" placeholder={t.common.searchPlaceholder} />
      </form>

      <div className="topbar-end">
        <EnvChip t={t} />
        <a id="nav-language" data-testid="nav-language" href={`/lang?to=${locale === "ar" ? "en" : "ar"}`} style={{ fontSize: ".8125rem", color: "var(--al-muted)" }}>
          {t.nav.language}
        </a>
        <Link
          href="/account"
          id="nav-user"
          data-testid="nav-user"
          data-user-id={principal.userId}
          data-roles={principal.roles.join(",")}
          style={{ display: "flex", alignItems: "center", gap: ".5rem", textDecoration: "none", color: "var(--al-text)" }}
        >
          <span className="avatar" aria-hidden="true">
            {initials(principal.displayName)}
          </span>
          <span style={{ fontSize: ".78125rem", fontWeight: 600 }}>{principal.displayName}</span>
        </Link>
        <form action="/logout" method="post">
          <button id="nav-logout" data-testid="nav-logout" type="submit" className="al-btn secondary" style={{ minHeight: "2rem", padding: "0 .625rem", fontSize: ".78125rem" }}>
            {t.nav.logout}
          </button>
        </form>
      </div>
    </header>
  );
}
