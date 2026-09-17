import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { PUBLIC_LINKS } from "./nav-model";

/**
 * What a visitor sees before signing in.
 *
 * An ordinary product header: the name, a few places to go, and the two
 * things a visitor is here to do. No module navigation, because none of it
 * would work — and no sign-in wall either, since the challenge and the
 * leaderboard are open to anyone.
 */
export function PublicHeader({ t, locale, current }: { t: Dictionary; locale: Locale; current: string }) {
  return (
    <header className="pub">
      <div className="pub-inner">
        <Link href="/" id="nav-home" data-testid="nav-home" className="pub-brand">
          <span className="logo" aria-hidden="true">
            AL
          </span>
          {t.appName}
        </Link>
        <nav id="nav-public" data-testid="nav-public" aria-label={t.navGroups.modules}>
          {PUBLIC_LINKS.map((l) => (
            <Link key={l.id} id={l.id} data-testid={l.id} href={l.href} aria-current={current.startsWith(l.href) ? "page" : undefined}>
              {t.nav[l.key]}
            </Link>
          ))}
          <a href="/api/docs" id="nav-api-docs" data-testid="nav-api-docs">
            {t.nav.apiDocs}
          </a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: ".625rem" }}>
          <a id="nav-language" data-testid="nav-language" href={`/lang?to=${locale === "ar" ? "en" : "ar"}`} style={{ fontSize: ".8125rem", color: "var(--al-muted)" }}>
            {t.nav.language}
          </a>
          <Link id="nav-signin" data-testid="nav-signin" href="/login" className="al-btn secondary">
            {t.nav.signIn}
          </Link>
          <Link id="nav-signup" data-testid="nav-signup" href="/register" className="al-btn">
            {t.nav.signUp}
          </Link>
        </div>
      </div>
    </header>
  );
}
