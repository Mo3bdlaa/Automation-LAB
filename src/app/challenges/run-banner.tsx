import type { Dictionary } from "@/i18n";
import { abandonRunAction, closeRunAction } from "./actions";
import { scenarioBySlug } from "@/lib/challenge/scenarios";

/**
 * The bar that crosses the application while a run is open.
 *
 * It is rendered by the layout rather than by the pages, so it is genuinely on
 * every screen: the single most confusing thing a challenge can do is score
 * somebody without making it obvious that the clock was running. It used to be
 * a card on three pages, which meant it was absent from the eighty-odd screens
 * where the work actually happens.
 *
 * The clock is not shown ticking. It would need a client component on every
 * page, and a number that disagrees with the server's by a second or two is
 * worse than a start time that is simply true — the run's own page has the
 * elapsed figure, and the bar carries `data-started-at` for anything counting.
 */
export function RunBanner({ t, run }: { t: Dictionary; run: { id: string; scenario: string; mode: string; startedAt: string; targets: number; closed: number } }) {
  const tc = t.challenge;
  const scenario = scenarioBySlug(run.scenario);
  const scored = run.mode === "scored";
  const done = Math.min(run.closed, run.targets);
  return (
    <div
      className="run-bar"
      id="active-run"
      data-testid="active-run"
      data-run-id={run.id}
      data-scenario={run.scenario}
      data-mode={run.mode}
      data-started-at={run.startedAt}
      data-targets={run.targets}
      data-closed={run.closed}
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--al-lab-glow)" strokeWidth="1.5" aria-hidden="true">
          <path d="M8 1.7 9.9 5.6l4.3.6-3.1 3 .7 4.3L8 11.5 4.2 13.5l.7-4.3-3.1-3 4.3-.6L8 1.7Z" />
        </svg>
        {scored ? tc.scoredMode : tc.practiceMode} · {scenario?.title ?? run.scenario}
      </span>

      <span className="flex items-center gap-2.5">
        <span className="text-[12.5px] text-[#d9c3b6]">
          {done} / {run.targets} {tc.items.toLowerCase()}
        </span>
        <span className="run-progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={run.targets} aria-label={tc.running}>
          <span style={{ width: `${run.targets ? Math.round((100 * done) / run.targets) : 0}%` }} />
        </span>
      </span>

      <span className="ms-auto flex items-center gap-3.5">
        <span className="text-[12.5px] text-[#d9c3b6]">
          {tc.startedAt} {run.startedAt.slice(11, 16)}
        </span>
        <form action={abandonRunAction}>
          <input type="hidden" name="runId" value={run.id} />
          <button id="run-abandon" data-testid="run-abandon" type="submit" className="al-btn secondary" style={{ minHeight: "2rem", padding: "0 .875rem", fontSize: ".78125rem", background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.35)" }}>
            {tc.abandon}
          </button>
        </form>
        <form action={closeRunAction}>
          <input type="hidden" name="runId" value={run.id} />
          <button id="run-close" data-testid="run-close" type="submit" className="al-btn" style={{ minHeight: "2rem", padding: "0 1rem", fontSize: ".78125rem", background: "var(--al-lab-glow)", borderColor: "var(--al-lab-glow)", color: "var(--al-lab-deep)" }}>
            {tc.close}
          </button>
        </form>
      </span>
    </div>
  );
}
