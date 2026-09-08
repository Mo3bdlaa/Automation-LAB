import { apiSession } from "@/lib/auth/server";
import { conflict, notFound, ok } from "@/lib/api/http";
import { runById } from "@/lib/challenge/runs";
import { closeRun } from "@/lib/challenge/score";
import { scenarioBySlug } from "@/lib/challenge/scenarios";
import { serialiseRun } from "@/lib/challenge/serialise";
import { issueCertificate } from "@/lib/challenge/certificate";

/**
 * Closes a run and grades it. This is where the feedback withheld during the
 * run is handed back: the score, the breakdown and what was missed.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const run = await runById(s, id);
  if (!run) return notFound("Run");
  const scenario = scenarioBySlug(run.scenario);
  if (!scenario) return conflict(`Scenario ${run.scenario} is no longer available.`);
  const { run: closed, result } = await closeRun(s, run, scenario);
  const certified = await issueCertificate(s, closed, scenario);
  return ok({
    run: serialiseRun(certified),
    result: { score: result.score, processed: result.processed, channel: result.channel, parameters: result.parameters, notes: result.notes },
    passMark: scenario.passMark,
    passed: result.score >= scenario.passMark,
  });
}
