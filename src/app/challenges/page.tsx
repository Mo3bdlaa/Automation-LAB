import Link from "next/link";
import { i18n } from "@/i18n/server";
import { getLabSession, getPrincipal } from "@/lib/auth/server";
import { Page, Section, Status, TableWrap } from "@/components/ui";
import { ScenarioCard, ScoreBadge, formatDuration } from "@/components/challenge";
import { SCENARIOS, scenarioBySlug } from "@/lib/challenge/scenarios";
import { leaderboard, personalBests, runsFor } from "@/lib/challenge/runs";
import { boardWithNames } from "@/lib/challenge/board";

export const dynamic = "force-dynamic";

/**
 * The hub: every scenario, your open run if you have one, and your history.
 * Readable signed out, because someone deciding whether to take part should be
 * able to see what they would be taking on.
 */
export default async function ChallengesPage() {
  const { t } = await i18n();
  const tc = t.challenge;
  const principal = await getPrincipal();
  const session = principal ? await getLabSession() : null;
  const bests = session ? await personalBests(session) : new Map();
  const history = session ? await runsFor(session, 15) : [];
  /*
   * A few names off the top of the board.
   *
   * Signed out, this page was four cards and then nothing, which reads as
   * unfinished — and it was hiding the one thing that shows the challenge is
   * real and being played. The flagship scenario only: the full board has a
   * tab per scenario and this is a taste, not a replacement.
   */
  const boards = await Promise.all(SCENARIOS.map(async (sc) => ({ scenario: sc, rows: await leaderboard(sc.slug, "all", 5) })));
  // Whichever scenario people are actually playing. Pinning this to one
  // scenario would leave the section empty while three others had results,
  // which is the worst of both: a heading and nothing under it.
  const busiest = boards.filter((b) => b.rows.length).sort((a, b) => b.rows.length - a.rows.length)[0] ?? null;
  const top = busiest ? await boardWithNames(busiest.rows) : [];

  return (
    <Page title={tc.title} subtitle={tc.intro}>

      <Section title={tc.scenarios} testId="challenge-scenarios">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" id="scenario-cards" data-testid="scenario-cards">
          {SCENARIOS.map((s) => {
            const best = bests.get(s.slug);
            return <ScenarioCard key={s.slug} scenario={s} t={t} best={best ? { score: Number(best.score), runId: best.id } : null} />;
          })}
        </div>
      </Section>

      {top.length ? (
        <Section title={`${tc.board} · ${busiest!.scenario.title}`} testId="challenge-board-preview">
          <TableWrap>
            <table id="board-preview-table" data-testid="board-preview-table" className="al-table">
              <thead>
                <tr>
                  <th style={{ width: "3rem" }}>#</th>
                  <th>{tc.who}</th>
                  <th className="num">{tc.score}</th>
                  <th className="num">{tc.duration}</th>
                  <th>{tc.certificate}</th>
                </tr>
              </thead>
              <tbody>
                {top.map((e) => (
                  <tr key={e.rank} id={`board-preview-row-${e.rank}`} data-testid={`board-preview-row-${e.rank}`} data-score={e.score} data-name={e.name}>
                    <td className="num">{e.rank}</td>
                    <td>
                      {e.name}
                      {e.location ? <span className="text-muted"> · {e.location}</span> : null}
                    </td>
                    <td className="num">{e.score.toFixed(1)}</td>
                    <td className="num">{formatDuration(e.durationMs)}</td>
                    <td>
                      {e.certificate ? (
                        <Link href={`/verify/${encodeURIComponent(e.certificate)}`} className="mono text-xs">
                          {e.certificate}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-2 text-sm">
            <Link id="challenge-board-all" data-testid="challenge-board-all" href="/leaderboard">
              {tc.board} →
            </Link>
          </p>
        </Section>
      ) : null}

      {session ? (
        <Section title={tc.myRuns} testId="challenge-my-runs">
          <TableWrap>
            <table id="runs-table" data-testid="runs-table" className="al-table">
              <thead>
                <tr>
                  <th>{tc.scenarios}</th>
                  <th>{tc.practiceMode}/{tc.scoredMode}</th>
                  <th>{tc.startedAt}</th>
                  <th>{tc.duration}</th>
                  <th className="num">{tc.score}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const scenario = scenarioBySlug(r.scenario);
                  return (
                    <tr key={r.id} id={`runs-row-${r.id}`} data-testid={`runs-row-${r.id}`} data-status={r.status} data-mode={r.mode}>
                      <td>{scenario?.title ?? r.scenario}</td>
                      <td>
                        <Status status={r.mode === "scored" ? "scored" : "practice"} /> <Status status={r.status} />
                      </td>
                      <td className="text-sm">{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td className="text-sm">{formatDuration(r.durationMs)}</td>
                      <td className="num">
                        <ScoreBadge score={r.score === null ? null : Number(r.score)} passMark={scenario?.passMark} />
                      </td>
                      <td>
                        {r.status === "completed" ? (
                          <Link id={`runs-result-${r.id}`} data-testid={`runs-result-${r.id}`} href={`/runs/${r.id}`}>
                            {tc.result}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted" data-testid="runs-empty">
                      {tc.noRuns}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableWrap>
        </Section>
      ) : null}
    </Page>
  );
}
