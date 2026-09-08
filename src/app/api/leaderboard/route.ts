import { ok, badRequest } from "@/lib/api/http";
import { leaderboard } from "@/lib/challenge/runs";
import { boardWithNames } from "@/lib/challenge/board";
import { isScenarioSlug, SCENARIOS } from "@/lib/challenge/scenarios";

/**
 * The public board. No credentials: a leaderboard people cannot show to anyone
 * is not a leaderboard. It carries only what its owners opted in to publish.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scenario = url.searchParams.get("scenario") ?? SCENARIOS[0].slug;
  if (!isScenarioSlug(scenario)) return badRequest("Unknown scenario.", { scenarios: SCENARIOS.map((s) => s.slug) });
  const channelParam = url.searchParams.get("channel") ?? "all";
  if (!["ui", "api", "all"].includes(channelParam)) return badRequest("Channel must be ui, api or all.");
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25) || 25));
  const rows = await leaderboard(scenario, channelParam as "ui" | "api" | "all", limit);
  return ok({ scenario, channel: channelParam, entries: await boardWithNames(rows) });
}
