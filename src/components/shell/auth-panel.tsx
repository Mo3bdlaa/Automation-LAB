import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";

/**
 * The frame around signing in and signing up.
 *
 * Both pages were a heading and a form on an empty page, which is what a form
 * looks like when nobody has decided what it is for. The panel beside it says
 * what is on the other side of the button — and the last line says out loud
 * that automating this page is allowed, which on a site whose whole point is
 * robots is not a detail somebody should have to guess at.
 */
export function AuthPanel({ title, lead, children, t }: { title: string; lead?: ReactNode; children: ReactNode; t: Dictionary }) {
  return (
    <main className="mx-auto flex w-full max-w-[62.5rem] flex-1 flex-col overflow-hidden border-x border-border bg-surface lg:flex-row">
      <div className="flex flex-col gap-5 p-11 lg:w-[35rem] lg:flex-shrink-0">
        <div>
          <h1 className="display text-[1.8125rem]" id="page-title" data-testid="page-title">
            {title}
          </h1>
          {lead ? <p className="mt-2 text-sm text-muted">{lead}</p> : null}
        </div>
        {children}
        <p className="mt-auto pt-6 text-[12.5px] leading-relaxed text-muted">{t.auth.botNote}</p>
      </div>

      <aside className="flex flex-1 flex-col justify-center gap-6 bg-shell p-11 text-shell-text">
        <h2 className="display text-[1.6875rem] leading-snug">{t.auth.panelTitle}</h2>
        <p className="text-sm leading-relaxed text-[#c7d4e0]">{t.auth.panelLead}</p>
        <div className="flex flex-col gap-3.5 border-t border-white/15 pt-6">
          {t.auth.facts.map((f) => (
            <div key={f.label} className="flex items-baseline gap-3.5">
              <span className="mono w-[4.875rem] flex-shrink-0 text-[1.125rem] font-medium">{f.value}</span>
              <span className="text-[13.5px] leading-snug text-[#a9bdce]">{f.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#8ca3b8]">{t.specimenLong}</p>
      </aside>
    </main>
  );
}
