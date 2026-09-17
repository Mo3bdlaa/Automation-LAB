import type { Dictionary } from "@/i18n";
import { NAV_GROUPS } from "./nav-model";

/**
 * The breadcrumb, worked out from the path.
 *
 * Two levels is the whole of it: the module, and the record inside it. The
 * application is not deeper than that, and a trail that invents ancestors
 * nobody navigated through is worse than none.
 *
 * A record's own segment is shown as it appears in the URL, which is the
 * document's number — INV-24-0416 rather than a row id — because that is what
 * the participant and their bot both call it.
 */
export function crumbsFor(pathname: string, t: Dictionary): { label: string; href?: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return [{ label: t.nav.dashboard }];

  const root = `/${segments[0]}`;
  const link = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.href === root);
  const known: Record<string, string> = {
    "/challenges": t.nav.challenges,
    "/leaderboard": t.nav.leaderboard,
    "/instructor": t.nav.instructor,
    "/account": t.nav.account,
    "/sandbox": t.nav.sandbox,
    "/rules": t.nav.rules,
  };
  const moduleLabel = link ? t.nav[link.key] : (known[root] ?? segments[0]);

  // One segment: the module itself is where you are.
  if (segments.length === 1) return [{ label: moduleLabel }];

  // Deeper: the module is a link, the record is where you are. Anything past
  // the record (an edit form, a validation screen) names the action instead.
  const record = decodeURIComponent(segments[1]);
  if (segments.length === 2) return [{ label: moduleLabel, href: root }, { label: record }];
  return [
    { label: moduleLabel, href: root },
    { label: record, href: `${root}/${segments[1]}` },
    { label: segments.slice(2).map(decodeURIComponent).join(" · ") },
  ];
}
