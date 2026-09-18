import Link from "next/link";
import { notFound } from "next/navigation";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Button, LinkButton, Page, Section, TableWrap } from "@/components/ui";
import { JudgingTable, formatDuration, scenarioName } from "@/components/challenge";
import { PARAMETERS, scenarioBySlug, type Parameter } from "@/lib/challenge/scenarios";
import { percentileFor, runById } from "@/lib/challenge/runs";
import { publishRunAction } from "@/app/challenges/actions";

export const dynamic = "force-dynamic";

/** What happened in one run: the score, where it came from, and what to fix. */
export default async function RunResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await i18n();
  const tc = t.challenge;
  const session = await requireLab();
  const { id } = await params;
  const run = await runById(session, id);
  if (!run) notFound();
  const scenario = scenarioBySlug(run.scenario);
  if (!scenario) notFound();

  const { department, name } = scenarioName(scenario);
  const score = run.score === null ? null : Number(run.score);
  const passed = score !== null && score >= scenario.passMark;
  const percentile = run.publish && score !== null ? await percentileFor(run.scenario, score) : null;
  const stored = run.breakdown?.parameters ?? [];
  const values = Object.fromEntries(
    PARAMETERS.map((key) => {
      const found = stored.find((p) => p.key === key);
      return [key, { points: found?.points ?? 0, detail: found?.detail ?? "" }];
    }),
  ) as Record<Parameter, { points: number; detail: string }>;

  return (
    <Page
      title={name}
      subtitle={`${department ? `${department} · ` : ""}${run.mode === "scored" ? tc.scoredMode : tc.practiceMode} · ${tc.level} ${run.level}`}
      actions={
        <LinkButton testId="run-back" href={`/challenges/${scenario.slug}`} variant="secondary">
          {name}
        </LinkButton>
      }
    >
      {/*
        The result reads as a result. It used to be the same blue whether the
        run passed or not, which is the one thing somebody wants to know from
        across the room — so the verdict now colours the rule above the card
        and the number itself, and the number is set in the mono face like
        every other figure in the application.
      */}
      <section
        className="al-card mb-5"
        style={{ borderTop: `3px solid ${passed ? "var(--al-success)" : "var(--al-warning)"}` }}
        id="run-result"
        data-testid="run-result"
        data-run-id={run.id}
        data-score={score ?? ""}
        data-passed={passed ? "1" : "0"}
        data-mode={run.mode}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: passed ? "var(--al-success)" : "var(--al-warning)" }} id="run-verdict" data-testid="run-verdict">
              {passed ? tc.passed : tc.notPassed}
            </div>
            <div className="mono text-[3.25rem] font-medium leading-none" id="run-score" data-testid="run-score">
              {score === null ? "—" : score.toFixed(1)}
              <span className="text-lg text-muted"> / 100</span>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              {tc.passMark} {scenario.passMark}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            <dt className="text-muted">{tc.items}</dt>
            <dd id="run-processed" data-testid="run-processed">
              {run.processedCount} / {run.targets.length}
            </dd>
            <dt className="text-muted">{tc.duration}</dt>
            <dd>{formatDuration(run.durationMs)}</dd>
            <dt className="text-muted">{tc.channel}</dt>
            <dd id="run-channel" data-testid="run-channel">{run.channel ?? "—"}</dd>
            {percentile !== null ? (
              <>
                <dt className="text-muted">{tc.board}</dt>
                <dd id="run-percentile" data-testid="run-percentile">top {100 - percentile}%</dd>
              </>
            ) : null}
          </dl>
        </div>
      </section>

      <Section title={tc.breakdown} testId="run-breakdown">
        <TableWrap>
          <JudgingTable scenario={scenario} t={t} values={values} />
        </TableWrap>
      </Section>

      {run.breakdown?.notes?.length ? (
        <Section title={tc.missed} testId="run-notes">
          <ul id="run-note-list" data-testid="run-note-list" className="text-sm">
            {run.breakdown.notes.map((n, i) => (
              <li key={i} data-testid={`run-note-${i + 1}`} className="border-b border-border py-1">
                {n}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {run.mode === "scored" && run.status === "completed" ? (
        <Section title={tc.board} testId="run-publish">
          <p className="mb-2 text-sm text-muted" id="run-publish-state" data-testid="run-publish-state" data-published={run.publish ? "1" : "0"}>
            {run.publish ? tc.published : tc.unpublished}
          </p>
          <form action={publishRunAction}>
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="publish" value={run.publish ? "0" : "1"} />
            <Button testId="run-publish-toggle" variant={run.publish ? "secondary" : "primary"}>
              {run.publish ? tc.unpublish : tc.publish}
            </Button>
          </form>
        </Section>
      ) : null}

      {run.certificateCode ? (
        <Section title={tc.certificate} testId="run-certificate">
          <p className="mb-2 text-sm text-success">{tc.certificateReady}</p>
          <p className="mb-3 text-sm">
            {tc.verifyAt}{" "}
            <Link id="run-certificate-verify" data-testid="run-certificate-verify" href={`/verify/${run.certificateCode}`}>
              /verify/{run.certificateCode}
            </Link>
          </p>
          <LinkButton testId="run-certificate-download" href={`/verify/${run.certificateCode}/certificate.pdf`} download={`automation-lab-${scenario.slug}.pdf`}>
            {tc.downloadCertificate}
          </LinkButton>
        </Section>
      ) : null}

    </Page>
  );
}
