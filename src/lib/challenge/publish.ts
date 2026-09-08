/**
 * Appearing on the leaderboard is a choice, and a reversible one. Nothing about
 * a person shows publicly until they say so, and switching it off removes them
 * again - the run keeps its score either way.
 */
import { eq } from "drizzle-orm";
import { challengeRuns, type ChallengeRun } from "@/db/schema";
import { audit, type LabSession } from "@/lib/auth/server";

export async function publishRun(session: LabSession, run: ChallengeRun, publish: boolean): Promise<ChallengeRun> {
  const [updated] = await session.tdb.update(challengeRuns, { publish }, eq(challengeRuns.id, run.id));
  await audit(session, publish ? "run.publish" : "run.unpublish", "challenge_run", run.id, { scenario: run.scenario, score: run.score });
  return updated;
}
