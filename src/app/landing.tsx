import Link from "next/link";
import type { Dictionary } from "@/i18n";
import { SCENARIOS } from "@/lib/challenge/scenarios";
import { COMPANY } from "@/lib/generator/vocab";

/**
 * The front door, for anyone who has not signed in.
 *
 * It used to open on the challenge, which sold the wrong thing: what makes
 * this worth an afternoon is that there is a working procurement system
 * behind it, and the challenge is what you do *in* the system. So the system
 * comes first, the challenge gets its own strip and its own page, and the
 * page ends where a product page ends — with what it costs and what it is.
 */
export function Landing({ t }: { t: Dictionary }) {
  const h = t.home;
  return (
    <main>
      {/* Hero */}
      <section className="border-b border-border bg-surface" id="landing-hero" data-testid="landing-hero">
        <div className="mx-auto flex max-w-[77.5rem] flex-col gap-12 px-8 py-14 lg:flex-row lg:items-center">
          <div className="flex max-w-[33rem] flex-col gap-5">
            <span className="self-start rounded-[3px] border border-[#ebd3c8] bg-lab-wash px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-lab">
              {h.kicker}
            </span>
            <h1 className="display text-[3rem] leading-[1.08]">{h.title}</h1>
            <p className="text-base leading-relaxed text-[#435466]">{h.lead}</p>
            <p className="text-base leading-relaxed text-[#435466]">{h.lead2}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link id="landing-signup" data-testid="landing-signup" href="/register" className="al-btn" style={{ minHeight: "2.875rem", padding: "0 1.375rem", fontSize: "0.9375rem" }}>
                {h.ctaPrimary}
              </Link>
              <Link id="landing-scenarios" data-testid="landing-scenarios" href="/challenges" className="al-btn secondary" style={{ minHeight: "2.875rem", padding: "0 1.375rem", fontSize: "0.9375rem" }}>
                {h.ctaSecondary}
              </Link>
            </div>
            <p className="text-[13px] text-muted">{h.ctaNote}</p>
          </div>

          {/* What you are signing up to look at. */}
          <div className="flex-1 overflow-hidden rounded-lg border border-border-strong shadow-[0_12px_32px_rgba(22,34,46,0.12)]">
            <div className="flex h-8 items-center gap-1.5 border-b border-border bg-[#edf1f4] px-3">
              <span className="h-2 w-2 rounded-full bg-border-strong" />
              <span className="h-2 w-2 rounded-full bg-border-strong" />
              <span className="h-2 w-2 rounded-full bg-border-strong" />
              <span className="mono ms-3 text-[11px] text-muted">{COMPANY.email.split("@")[1]}/invoices</span>
            </div>
            <div className="flex h-[22rem] bg-surface">
              <div className="flex w-[9.25rem] flex-col gap-0.5 bg-shell p-3">
                <span className="px-2 pb-1 pt-1.5 text-[9px] uppercase tracking-[0.1em] text-[#8ca3b8]">{t.navGroups.procureToPay}</span>
                {[t.nav.purchaseOrders, t.nav.deliveries].map((label) => (
                  <span key={label} className="rounded-[3px] px-2 py-1 text-[11px] text-[#c7d4e0]">{label}</span>
                ))}
                <span className="rounded-[3px] bg-white/15 px-2 py-1 text-[11px] font-semibold text-white">{t.nav.invoices}</span>
                <span className="rounded-[3px] px-2 py-1 text-[11px] text-[#c7d4e0]">{t.nav.payments}</span>
                <span className="px-2 pb-1 pt-2.5 text-[9px] uppercase tracking-[0.1em] text-[#8ca3b8]">{t.navGroups.masterData}</span>
                {[t.nav.vendors, t.nav.items].map((label) => (
                  <span key={label} className="rounded-[3px] px-2 py-1 text-[11px] text-[#c7d4e0]">{label}</span>
                ))}
              </div>
              <div className="flex flex-1 flex-col gap-2.5 p-4">
                <span className="text-[15px] font-semibold">{t.nav.invoices}</span>
                <div className="flex gap-3.5 border-b border-border pb-1.5">
                  <span className="-mb-[7px] border-b-2 border-primary pb-1.5 text-[11px] font-semibold text-primary">{h.previewTab}</span>
                </div>
                {PREVIEW.map((row) => (
                  <div key={row.no} className="flex items-center gap-2.5 border-b border-[#edf1f4] py-1.5">
                    <span className="mono w-[4.875rem] text-[10.5px]">{row.no}</span>
                    <span className="flex-1 truncate text-[11px] text-[#435466]">{row.vendor}</span>
                    <span className="mono text-[10.5px]">{row.total}</span>
                    <span className="pill" data-tone={row.tone}>{row.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why it is worth the afternoon */}
      <section className="mx-auto grid max-w-[77.5rem] grid-cols-1 gap-6 px-8 pt-11 md:grid-cols-3" id="landing-pillars" data-testid="landing-pillars">
        {h.pillars.map((p, i) => (
          <div key={p.title} className="al-card flex flex-col gap-2.5" data-testid={`landing-pillar-${i + 1}`}>
            <span className="mono text-[11px] font-medium tracking-wide text-lab">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="text-[17px] font-semibold">{p.title}</h3>
            <p className="text-sm leading-relaxed text-[#435466]">{p.body}</p>
          </div>
        ))}
      </section>

      {/* The challenge gets a strip, not the whole page */}
      <section className="mt-11 border-t border-border bg-surface" id="landing-challenge" data-testid="landing-challenge">
        <div className="mx-auto flex max-w-[77.5rem] flex-col gap-10 px-8 py-9 lg:flex-row lg:items-center">
          <div className="flex max-w-[25rem] flex-col gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-lab">{h.challengeKicker}</span>
            <h2 className="display text-[1.6875rem]">{h.challengeTitle}</h2>
            <p className="text-sm leading-relaxed text-[#435466]">{h.challengeLead}</p>
            <Link id="landing-challenge-cta" data-testid="landing-challenge-cta" href="/challenges" className="mt-1.5 self-start text-sm font-semibold text-lab">
              {h.challengeCta} →
            </Link>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2" id="landing-scenario-cards" data-testid="landing-scenario-cards">
            {SCENARIOS.map((s) => (
              <Link
                key={s.slug}
                id={`landing-scenario-${s.slug}`}
                data-testid={`landing-scenario-${s.slug}`}
                href={`/challenges/${s.slug}`}
                className="flex flex-col gap-1 rounded-md border border-border px-4 py-3.5 text-ink no-underline hover:border-border-strong hover:bg-surface-2"
              >
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{s.title.split(":")[0]}</span>
                <span className="text-[15px] font-semibold">{s.title.split(":").slice(1).join(":").trim() || s.title}</span>
                <span className="text-[12.5px] text-muted">{s.targetSize} · {s.tagline}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Three rows of a worklist, shown at a glance so the front page carries a
 * picture of the thing rather than a description of it. Fixed on purpose:
 * it is a picture, not a live query, and it must render before a visitor has
 * a workspace at all.
 */
const PREVIEW = [
  { no: "INV-24-0416", vendor: "Gulf Steel Supplies Co.", total: "48,300.00", status: "Held", tone: "error" },
  { no: "INV-24-0415", vendor: "Riyadh Cables Est.", total: "12,075.50", status: "To read", tone: "warning" },
  { no: "INV-24-0414", vendor: "Najd Safety Equipment", total: "6,440.00", status: "Approved", tone: "success" },
  { no: "INV-24-0412", vendor: "Al-Faisal Electrical", total: "31,900.00", status: "Held", tone: "error" },
] as const;
