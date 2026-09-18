import Link from "next/link";
import type { Dictionary } from "@/i18n";
import { COMPANY } from "@/lib/generator/vocab";
import { NAV_GROUPS } from "./nav-model";
import { HomeIcon, StarIcon } from "./icons";
import { SideToggle } from "./side-toggle";

/**
 * The module navigation.
 *
 * Grouped by where the work sits rather than listed flat, and headed by the
 * company whose system this is — the participant is meant to feel they have
 * been given a login to Al-Nahda's ERP, not opened a training applet.
 *
 * The challenge is last, separated by a rule and coloured in the lab's clay,
 * because it is a different kind of thing from posting a goods receipt.
 *
 * On a phone the list folds behind the button in the header; at a desk there
 * is no button and the list is simply the nav. The links are in the DOM
 * either way, so folding costs nothing to anything reading the page.
 */
export function Sidebar({ t, locale, staff, current }: { t: Dictionary; locale: string; staff: boolean; current: string }) {
  const here = (href: string) => current === href || (href !== "/" && current.startsWith(`${href}/`));
  return (
    <nav className="side" id="nav-main" data-testid="nav-main" aria-label={t.navGroups.modules}>
      <div className="side-head">
      <Link href="/" id="nav-home" data-testid="nav-home" className="side-brand">
        <span className="logo" aria-hidden="true">
          {COMPANY.shortName.slice(0, 2).toUpperCase()}
        </span>
        <span style={{ overflow: "hidden" }}>
          <span className="side-company">{locale === "ar" ? COMPANY.nameAr : COMPANY.shortName}</span>
          <span className="side-module">{t.navGroups.procureToPay}</span>
        </span>
      </Link>
        <SideToggle label={t.navGroups.modules} />
      </div>

      <div className="side-nav" id="nav-modules">
          <Link href="/" id="nav-dashboard" data-testid="nav-dashboard" className="side-link" aria-current={current === "/" ? "page" : undefined}>
            <HomeIcon />
            {t.nav.dashboard}
          </Link>

          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="side-group">{t.navGroups[group.label]}</div>
              {group.links.map((l) => (
                <Link key={l.id} id={l.id} data-testid={l.id} href={l.href} className="side-link" aria-current={here(l.href) ? "page" : undefined}>
                  <span style={{ flexGrow: 1 }}>{t.nav[l.key]}</span>
                </Link>
              ))}
            </div>
          ))}

          {staff ? (
            <div>
              <div className="side-group">{t.navGroups.staff}</div>
              <Link id="nav-instructor" data-testid="nav-instructor" href="/instructor" className="side-link" aria-current={here("/instructor") ? "page" : undefined}>
                <span style={{ flexGrow: 1 }}>{t.nav.instructor}</span>
              </Link>
            </div>
          ) : null}

          <div className="side-lab">
            <Link id="nav-challenges" data-testid="nav-challenges" href="/challenges" className="side-lab-link" aria-current={here("/challenges") ? "page" : undefined}>
              <StarIcon />
              {t.nav.challenges}
            </Link>
            <Link id="nav-leaderboard" data-testid="nav-leaderboard" href="/leaderboard" className="side-link" style={{ paddingInlineStart: "2.125rem" }}>
              {t.nav.leaderboard}
            </Link>
            <a id="nav-api-docs" data-testid="nav-api-docs" href="/api/docs" className="side-link" style={{ paddingInlineStart: "2.125rem" }}>
              {t.nav.apiDocs}
            </a>
          </div>
      </div>
    </nav>
  );
}
