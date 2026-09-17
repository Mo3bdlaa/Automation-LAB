import Link from "next/link";
import { i18n } from "@/i18n/server";
import { getLabSession, getPrincipal } from "@/lib/auth/server";
import { Page, Section, Status, TableWrap } from "@/components/ui";
import { ScenarioCard, ScoreBadge, formatDuration } from "@/components/challenge";
import { SCENARIOS, scenarioBySlug } from "@/lib/challenge/scenarios";
import { personalBests, runsFor } from "@/lib/challenge/runs";

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
