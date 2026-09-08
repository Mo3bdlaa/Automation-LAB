import type { Dictionary } from "@/i18n";
import { Button } from "@/components/ui";
import { abandonRunAction, closeRunAction } from "./actions";
import { scenarioBySlug } from "@/lib/challenge/scenarios";

/**
 * The open-run strip. It appears on every screen while a run is open, because
 * the single most confusing thing a challenge platform can do is score someone
 * without making it obvious that the clock is running.
 */
export function RunBanner({ t, run }: { t: Dictionary; run: { id: string; scenario: string; mode: string; startedAt: string; targets: number } }) {
  const tc = t.challenge;
  const scenario = scenarioBySlug(run.scenario);
  return (
    <section
      className="al-card mb-5 border-s-4 border-s-primary"
      id="active-run"
      data-testid="active-run"
      data-run-id={run.id}
      data-scenario={run.scenario}
      data-mode={run.mode}
      data-started-at={run.startedAt}
      data-targets={run.targets}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="mb-1">
            {tc.running}: {scenario?.title ?? run.scenario} · {run.mode === "scored" ? tc.scoredMode : tc.practiceMode}
          </h2>
          <p className="text-sm text-muted">
            {run.mode === "scored" ? tc.runningLead : null} {tc.startedAt} {run.startedAt.slice(11, 16)} · {run.targets} {tc.items.toLowerCase()}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={closeRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <Button testId="run-close">{tc.close}</Button>
          </form>
          <form action={abandonRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <Button testId="run-abandon" variant="secondary">
              {tc.abandon}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
