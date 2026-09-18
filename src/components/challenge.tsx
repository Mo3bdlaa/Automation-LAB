/**
 * Challenge presentation pieces, shared by the hub, a scenario page and a run
 * result. Every one carries a stable id, like the rest of the application:
 * a participant may well end up automating these screens too.
 */
import Link from "next/link";
import type { Dictionary } from "@/i18n";
import { DIFFICULTY_LABELS, PARAMETER_LABELS, PARAMETER_MEANINGS, PARAMETERS, type Parameter, type Scenario } from "@/lib/challenge/scenarios";

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function ScoreBadge({ score, passMark, testId }: { score: number | null; passMark?: number; testId?: string }) {
  if (score === null) return <span className="text-muted">—</span>;
  const passed = passMark === undefined ? null : score >= passMark;
  return (
    <span
      id={testId}
      data-testid={testId}
      data-score={score}
      className={`inline-block rounded px-2 py-0.5 font-semibold tabular-nums ${passed === null ? "bg-surface" : passed ? "bg-[#e6f4ea] text-success" : "bg-[#fdf6e7] text-warning"}`}
    >
      {score.toFixed(1)}
    </span>
  );
}

/**
 * A scenario's title split into the department and the name.
 *
 * Titles read "Accounts payable: invoice processing" — one sentence, so the
 * half after the colon is lower case. Standing alone as a heading it needs its
 * capital, and putting it after another word needs the colon gone, or a result
 * page ends up titled "Result: Warehouse: goods receipt".
 */
export function scenarioName(scenario: Scenario): { department: string | null; name: string } {
  const [department, ...rest] = scenario.title.split(":");
  const tail = rest.join(":").trim();
  if (!tail) return { department: null, name: scenario.title };
  return { department, name: tail.charAt(0).toUpperCase() + tail.slice(1) };
}

export function ScenarioCard({ scenario, t, best }: { scenario: Scenario; t: Dictionary; best?: { score: number; runId: string } | null }) {
  const tc = t.challenge;
  // Scenario titles read "Accounts payable: invoice processing". The half
  // before the colon is the department, which is worth showing as a label
  // rather than burying in a sentence — it is how somebody finds the one they
  // came for.
  const { department, name } = scenarioName(scenario);
  return (
    <article className="al-card flex flex-col gap-3" id={`scenario-card-${scenario.slug}`} data-testid={`scenario-card-${scenario.slug}`} data-difficulty={scenario.difficulty}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">{department ?? DIFFICULTY_LABELS[scenario.difficulty]}</span>
          <h2 className="text-[1.0625rem] font-semibold leading-snug">
            <Link id={`scenario-link-${scenario.slug}`} data-testid={`scenario-link-${scenario.slug}`} href={`/challenges/${scenario.slug}`} className="text-ink no-underline hover:text-primary">
              {name}
            </Link>
          </h2>
        </span>
        {best ? (
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted">
            {tc.best}
            <ScoreBadge score={best.score} passMark={scenario.passMark} testId={`scenario-best-${scenario.slug}`} />
          </span>
        ) : null}
      </div>

      <p className="flex-1 text-sm leading-relaxed text-muted">{scenario.tagline}</p>

      <dl className="grid grid-cols-3 gap-2 border-y border-border py-2.5 text-xs">
        <div>
          <dt className="text-muted">{tc.items}</dt>
          <dd className="mono text-[0.875rem]" data-testid={`scenario-items-${scenario.slug}`}>{scenario.targetSize}</dd>
        </div>
        <div>
          <dt className="text-muted">{tc.parTime}</dt>
          <dd className="mono text-[0.875rem]">{Math.round((scenario.parSecondsPerItem * scenario.targetSize) / 60)}m</dd>
        </div>
        <div>
          <dt className="text-muted">{tc.documents}</dt>
          <dd className="text-[0.875rem]">{scenario.documentUnderstanding ? "PDF" : "UI"}</dd>
        </div>
      </dl>

      {/*
        The card used to have no action on it at all: the only way in was to
        know that the heading was a link. On the page whose whole job is
        getting somebody into a run, that is the wrong thing to leave implicit.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          id={`scenario-open-${scenario.slug}`}
          data-testid={`scenario-open-${scenario.slug}`}
          href={`/challenges/${scenario.slug}`}
          className="al-btn lab"
          style={{ minHeight: "2.25rem", fontSize: ".8125rem" }}
        >
          {tc.open}
        </Link>
        <a
          id={`scenario-pdd-${scenario.slug}`}
          data-testid={`scenario-pdd-${scenario.slug}`}
          href={`/challenges/${scenario.slug}/pdd.pdf`}
          className="text-[12.5px] font-medium"
        >
          {tc.pdd}
        </a>
      </div>
    </article>
  );
}

/** The published weighting, so nobody has to guess what the score rewards. */
export function JudgingTable({ scenario, t, values }: { scenario: Scenario; t: Dictionary; values?: Record<Parameter, { points: number; detail: string }> }) {
  return (
    <table className="al-table" id="judging-table" data-testid="judging-table">
      <thead>
        <tr>
          <th>{t.challenge.judging}</th>
          <th className="num">{values ? t.challenge.score : "%"}</th>
          <th>{values ? t.challenge.breakdown : t.challenge.judging}</th>
        </tr>
      </thead>
      <tbody>
        {PARAMETERS.map((key) => {
          const max = scenario.weights[key];
          const points = values?.[key]?.points ?? 0;
          // A bar, because "16.7 / 20" and "7.4 / 10" are the same shape on
          // the page and different in what they cost you. Full marks are
          // green, a shortfall is the warning colour; nothing is red, because
          // dropping points is not an error.
          const pct = max > 0 ? Math.max(0, Math.min(100, (points / max) * 100)) : 0;
          return (
            <tr key={key} id={`judging-${key}`} data-testid={`judging-${key}`} data-max={max} data-points={values?.[key]?.points}>
              <td>{PARAMETER_LABELS[key]}</td>
              <td className="num">{values ? `${points} / ${max}` : max}</td>
              <td className="text-sm text-muted">
                {values ? (
                  <span className="flex flex-col gap-1.5">
                    <span>{values[key].detail}</span>
                    <span className="block h-1.5 w-full max-w-[16rem] overflow-hidden rounded-full" style={{ background: "#edf1f4" }}>
                      <span className="block h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 99.5 ? "var(--al-success)" : "var(--al-warning)" }} />
                    </span>
                  </span>
                ) : (
                  PARAMETER_MEANINGS[key]
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
