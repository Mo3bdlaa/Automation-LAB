import Link from "next/link";
import { i18n } from "@/i18n/server";
import { Page, Section, TableWrap } from "@/components/ui";
import { ScoreBadge, formatDuration } from "@/components/challenge";
import { SCENARIOS, isScenarioSlug } from "@/lib/challenge/scenarios";
import { leaderboard } from "@/lib/challenge/runs";
import { boardWithNames } from "@/lib/challenge/board";

export const dynamic = "force-dynamic";

/** Public: the point of a leaderboard is that it can be shown to people. */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const tc = t.challenge;
  const sp = await searchParams;
  const requested = typeof sp.scenario === "string" && isScenarioSlug(sp.scenario) ? sp.scenario : SCENARIOS[0].slug;
  const channel = sp.channel === "ui" || sp.channel === "api" ? sp.channel : "all";
  const scenario = SCENARIOS.find((s) => s.slug === requested)!;
  const board = await boardWithNames(await leaderboard(requested, channel, 50));

  return (
    <Page title={tc.board} subtitle={scenario.title}>
      <nav className="mb-4 flex flex-wrap gap-2" id="board-scenarios" data-testid="board-scenarios">
        {SCENARIOS.map((s) => (
          <Link
            key={s.slug}
            id={`board-tab-${s.slug}`}
            data-testid={`board-tab-${s.slug}`}
            data-current={s.slug === requested ? "1" : "0"}
            href={`/leaderboard?scenario=${s.slug}${channel === "all" ? "" : `&channel=${channel}`}`}
            className={`rounded border px-3 py-1 text-sm ${s.slug === requested ? "border-primary font-semibold text-primary" : "border-border"}`}
          >
            {s.title}
          </Link>
        ))}
      </nav>
      <nav className="mb-4 flex gap-2 text-sm" id="board-channels" data-testid="board-channels">
        {(["all", "ui", "api"] as const).map((c) => (
          <Link key={c} id={`board-channel-${c}`} data-testid={`board-channel-${c}`} data-current={c === channel ? "1" : "0"} href={`/leaderboard?scenario=${requested}${c === "all" ? "" : `&channel=${c}`}`} className={c === channel ? "font-semibold" : "text-muted"}>
            {c === "all" ? tc.board : c.toUpperCase()}
          </Link>
        ))}
      </nav>

      <Section title={scenario.title} testId="board-section">
        <TableWrap>
          <table id="board-table" data-testid="board-table" className="al-table">
            <thead>
              <tr>
                <th className="num">{tc.rank}</th>
                <th>{tc.participant}</th>
                <th className="num">{tc.score}</th>
                <th>{tc.duration}</th>
                <th>{tc.channel}</th>
                <th>{tc.level}</th>
                <th>{tc.certificate}</th>
              </tr>
            </thead>
            <tbody>
              {board.map((e) => (
                <tr key={e.rank} id={`board-row-${e.rank}`} data-testid={`board-row-${e.rank}`} data-score={e.score} data-name={e.name}>
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
                  <td className="num">{e.level}</td>
                  <td>
                    {e.certificate ? (
                      <Link id={`board-certificate-${e.rank}`} data-testid={`board-certificate-${e.rank}`} href={`/verify/${e.certificate}`}>
                        {e.certificate}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {board.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted" data-testid="board-empty">
                    {tc.boardEmpty}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableWrap>
      </Section>
    </Page>
  );
}
