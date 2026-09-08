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
  return (
    <article className="al-card flex flex-col" id={`scenario-card-${scenario.slug}`} data-testid={`scenario-card-${scenario.slug}`} data-difficulty={scenario.difficulty}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted">{DIFFICULTY_LABELS[scenario.difficulty]}</span>
        {best ? (
          <span className="text-xs text-muted">
            {tc.best} <ScoreBadge score={best.score} passMark={scenario.passMark} testId={`scenario-best-${scenario.slug}`} />
          </span>
        ) : null}
      </div>
      <h2 className="mb-1 text-lg">
        <Link id={`scenario-link-${scenario.slug}`} data-testid={`scenario-link-${scenario.slug}`} href={`/challenges/${scenario.slug}`}>
          {scenario.title}
        </Link>
      </h2>
      <p className="mb-3 flex-1 text-sm text-muted">{scenario.tagline}</p>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">{tc.items}</dt>
          <dd data-testid={`scenario-items-${scenario.slug}`}>{scenario.targetSize}</dd>
        </div>
        <div>
          <dt className="text-muted">{tc.parTime}</dt>
          <dd>{Math.round((scenario.parSecondsPerItem * scenario.targetSize) / 60)}m</dd>
        </div>
        <div>
          <dt className="text-muted">{tc.documents}</dt>
          <dd>{scenario.documentUnderstanding ? "PDF" : "UI"}</dd>
        </div>
      </dl>
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
