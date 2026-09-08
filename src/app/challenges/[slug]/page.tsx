import Link from "next/link";
import { notFound } from "next/navigation";
import { i18n } from "@/i18n/server";
import { getLabSession, getPrincipal } from "@/lib/auth/server";
import { Button, LinkButton, Page, Section, TableWrap } from "@/components/ui";
import { JudgingTable, ScoreBadge, formatDuration } from "@/components/challenge";
import { DIFFICULTY_LABELS, scenarioBySlug } from "@/lib/challenge/scenarios";
import { activeRun, leaderboard, personalBests } from "@/lib/challenge/runs";
import { boardWithNames } from "@/lib/challenge/board";
import { queueSources } from "@/lib/api/work-items";
import { RunBanner } from "../run-banner";
import { resetForRunAction, startRunAction } from "../actions";
import { Walkthrough } from "./walkthrough";

export const dynamic = "force-dynamic";

export default async function ScenarioPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const tc = t.challenge;
  const { slug } = await params;
  const sp = await searchParams;
  const scenario = scenarioBySlug(slug);
  if (!scenario) notFound();

  const principal = await getPrincipal();
  const session = principal ? await getLabSession() : null;
  const open = session ? await activeRun(session) : null;
  const bests = session ? await personalBests(session) : new Map();
  const best = bests.get(scenario.slug);
  const queued = session ? (await queueSources(session, scenario.queue)).length : null;
  const board = await boardWithNames(await leaderboard(scenario.slug, "all", 10));
  const problem = typeof sp.problem === "string" ? sp.problem : null;

  return (
    <Page
      title={scenario.title}
      subtitle={scenario.tagline}
      actions={
        <div className="flex gap-2">
          <LinkButton testId="scenario-pdd" href={`/challenges/${scenario.slug}/pdd.pdf`} variant="secondary">
            {tc.docPdd}
          </LinkButton>
          <LinkButton testId="scenario-sdd" href={`/challenges/${scenario.slug}/sdd.docx`} variant="secondary">
            {tc.docSdd}
          </LinkButton>
        </div>
      }
    >
      {open ? <RunBanner t={t} run={{ id: open.id, scenario: open.scenario, mode: open.mode, startedAt: open.startedAt.toISOString(), targets: open.targets.length }} /> : null}

      {problem === "queue_short" ? (
        <div className="flash mb-4" data-status="error" id="scenario-problem" data-testid="scenario-problem" data-problem={problem}>
          {tc.queueShort}{" "}
          <form action={resetForRunAction} className="mt-2">
            <input type="hidden" name="scenario" value={scenario.slug} />
            <Button testId="scenario-reset" variant="secondary">
              {tc.resetSandbox}
            </Button>
          </form>
        </div>
      ) : problem === "already_running" ? (
        <div className="flash mb-4" data-status="error" id="scenario-problem" data-testid="scenario-problem" data-problem={problem}>
          {tc.alreadyRunning}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="al-card mb-5" id="scenario-brief" data-testid="scenario-brief">
            <p className="mb-3">{scenario.brief}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <dt className="text-muted">{tc.difficulty}</dt>
                <dd data-testid="scenario-difficulty">{DIFFICULTY_LABELS[scenario.difficulty]}</dd>
              </div>
              <div>
                <dt className="text-muted">{tc.items}</dt>
                <dd data-testid="scenario-target-size">{scenario.targetSize}</dd>
              </div>
              <div>
                <dt className="text-muted">{tc.parTime}</dt>
                <dd>{Math.round((scenario.parSecondsPerItem * scenario.targetSize) / 60)}m</dd>
              </div>
              <div>
                <dt className="text-muted">{tc.documents}</dt>
                <dd>{scenario.documentUnderstanding ? tc.documentsYes : tc.documentsNo}</dd>
              </div>
            </dl>
            {session ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <form action={startRunAction}>
                  <input type="hidden" name="scenario" value={scenario.slug} />
                  <input type="hidden" name="mode" value="scored" />
                  <Button testId="scenario-start-scored" disabled={Boolean(open)}>
                    {tc.start}
                  </Button>
                </form>
                <form action={startRunAction}>
                  <input type="hidden" name="scenario" value={scenario.slug} />
                  <input type="hidden" name="mode" value="practice" />
                  <Button testId="scenario-start-practice" variant="secondary" disabled={Boolean(open)}>
                    {tc.practice}
                  </Button>
                </form>
                {queued !== null ? (
                  <span className="text-xs text-muted" id="scenario-queue-depth" data-testid="scenario-queue-depth" data-available={queued}>
                    {queued} / {scenario.targetSize}
                  </span>
                ) : null}
                {best ? (
                  <span className="text-xs text-muted">
                    {tc.best} <ScoreBadge score={Number(best.score)} passMark={scenario.passMark} testId="scenario-personal-best" />
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm">
                <Link id="scenario-signup" data-testid="scenario-signup" href="/register">
                  {tc.heroCta}
                </Link>
              </p>
            )}
          </section>

          <Section title={tc.judging} testId="scenario-judging">
            <p className="mb-2 text-sm text-muted">
              {tc.passMark}: {scenario.passMark} / 100
            </p>
            <TableWrap>
              <JudgingTable scenario={scenario} t={t} />
            </TableWrap>
          </Section>

          <Section title={tc.rules} testId="scenario-rules">
            <ul className="flex flex-wrap gap-2" id="scenario-rule-list" data-testid="scenario-rule-list">
              {scenario.rules.map((id) => (
                <li key={id} id={`scenario-rule-${id}`} data-testid={`scenario-rule-${id}`} className="rounded border border-border px-2 py-0.5 text-xs">
                  <Link href={`/rules#rule-${id}`}>{id}</Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={tc.board} testId="scenario-board">
            <TableWrap>
              <table id="board-table" data-testid="board-table" className="al-table">
                <thead>
                  <tr>
                    <th className="num">{tc.rank}</th>
                    <th>{tc.participant}</th>
                    <th className="num">{tc.score}</th>
                    <th>{tc.duration}</th>
                    <th>{tc.channel}</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((e) => (
                    <tr key={e.rank} id={`board-row-${e.rank}`} data-testid={`board-row-${e.rank}`} data-score={e.score}>
                      <td className="num">{e.rank}</td>
                      <td>
                        {e.name}
                        {e.location ? <span className="ms-2 text-xs text-muted">{e.location}</span> : null}
                      </td>
                      <td className="num">
                        <ScoreBadge score={e.score} passMark={scenario.passMark} />
                      </td>
                      <td>{formatDuration(e.durationMs)}</td>
                      <td>{e.channel}</td>
                    </tr>
                  ))}
                  {board.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted" data-testid="board-empty">
                        {tc.boardEmpty}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </TableWrap>
          </Section>
        </div>

        <Walkthrough scenario={scenario} labels={{ title: tc.steps, handles: tc.handles, hide: tc.guideHide, show: tc.guideShow }} />
      </div>
    </Page>
  );
}
