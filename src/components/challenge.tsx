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

export function ScenarioCard({ scenario, t, best }: { scenario: Scenario; t: Dictionary; best?: { score: number; runId: string } | null }) {
  const tc = t.challenge;
  // Scenario titles read "Accounts payable: invoice processing". The half
  // before the colon is the department, which is worth showing as a label
  // rather than burying in a sentence — it is how somebody finds the one they
  // came for.
  const [department, ...rest] = scenario.title.split(":");
  const tail = rest.join(":").trim();
  // "Accounts payable: invoice processing" — the tail is lower case because it
  // continues a sentence. Standing alone as a heading it needs its capital.
  const name = tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : scenario.title;
  return (
    <article className="al-card flex flex-col gap-3" id={`scenario-card-${scenario.slug}`} data-testid={`scenario-card-${scenario.slug}`} data-difficulty={scenario.difficulty}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">{rest.length ? department : DIFFICULTY_LABELS[scenario.difficulty]}</span>
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
        {PARAMETERS.map((key) => (
          <tr key={key} id={`judging-${key}`} data-testid={`judging-${key}`} data-max={scenario.weights[key]} data-points={values?.[key]?.points}>
            <td>{PARAMETER_LABELS[key]}</td>
            <td className="num">{values ? `${values[key].points} / ${scenario.weights[key]}` : scenario.weights[key]}</td>
            <td className="text-sm text-muted">{values ? values[key].detail : PARAMETER_MEANINGS[key]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
