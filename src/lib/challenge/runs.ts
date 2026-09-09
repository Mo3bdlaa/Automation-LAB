/**
 * Challenge runs: one scored attempt at one scenario.
 *
 * A run is a window in time over a person's own sandbox. Starting it snapshots
 * the work in scope, so what is scored cannot change afterwards; closing it
 * grades everything that happened between the two timestamps. Nothing is
 * attributed to a run retroactively, and only one run can be open at a time -
 * otherwise two runs would claim the same work.
 *
 * Practice runs behave identically but are never ranked and never certified.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { challengeRuns, type ChallengeRun } from "@/db/schema";
import { personUserId } from "@/lib/identity/types";
import type { LabSession } from "@/lib/auth/server";
import { queueSources } from "@/lib/api/work-items";
import { isLevel, type Level } from "@/lib/documents/levels";
import { defaultLevel } from "@/lib/lab-settings";
import { parSeconds, type Scenario } from "./scenarios";

export type StartFailure =
  | { code: "already_running"; message: string; run: ChallengeRun }
  | { code: "queue_short"; message: string; available: number; required: number }
  | { code: "bad_level"; message: string };

export type StartResult = { ok: true; run: ChallengeRun } | ({ ok: false } & StartFailure);

/** The run a person currently has open, if any. */
export async function activeRun(session: LabSession): Promise<ChallengeRun | null> {
  const [row] = await session.tdb.list(challengeRuns, {
    where: and(eq(challengeRuns.userId, personUserId(session.principal)), eq(challengeRuns.status, "running"))!,
    orderBy: [{ column: challengeRuns.startedAt, direction: "desc" }],
    limit: 1,
  });
  return row ?? null;
}

export async function runById(session: LabSession, id: string): Promise<ChallengeRun | null> {
  const row = await session.tdb.one(challengeRuns, eq(challengeRuns.id, id));
  return row && row.userId === personUserId(session.principal) ? row : null;
}

export async function runsFor(session: LabSession, limit = 25): Promise<ChallengeRun[]> {
  return session.tdb.list(challengeRuns, {
    where: eq(challengeRuns.userId, personUserId(session.principal)),
    orderBy: [{ column: challengeRuns.startedAt, direction: "desc" }],
    limit,
  });
}

/** Best completed scored run per scenario for this person. */
export async function personalBests(session: LabSession): Promise<Map<string, ChallengeRun>> {
  const rows = await session.tdb.list(challengeRuns, {
    where: and(eq(challengeRuns.userId, personUserId(session.principal)), eq(challengeRuns.mode, "scored"), eq(challengeRuns.status, "completed"))!,
    orderBy: [{ column: challengeRuns.score, direction: "desc" }],
  });
  const best = new Map<string, ChallengeRun>();
  for (const r of rows) if (!best.has(r.scenario)) best.set(r.scenario, r);
  return best;
}

/**
 * Opens a run. A scored run needs a full queue: a sandbox half-worked from an
 * earlier attempt would score against a shorter list and rank unfairly, so we
 * say so plainly and let the person reset rather than quietly scoring less.
 */
export async function startRun(session: LabSession, scenario: Scenario, opts: { mode: "practice" | "scored"; level?: number }): Promise<StartResult> {
  const open = await activeRun(session);
  if (open) {
    return { ok: false, code: "already_running", message: `You already have a ${open.scenario} run open. Close it before starting another.`, run: open };
  }
  const level = opts.level ?? (await defaultLevel());
  if (!isLevel(level)) return { ok: false, code: "bad_level", message: "Level must be between 1 and 5." };

  const sources = await queueSources(session, scenario.queue, level as Level);
  const required = opts.mode === "scored" ? scenario.targetSize : 1;
  if (sources.length < required) {
    return {
      ok: false,
      code: "queue_short",
      message: `This scenario needs ${required} items and the queue has ${sources.length}. Reset your sandbox to start from a full queue.`,
      available: sources.length,
      required,
    };
  }
  const targets = sources.slice(0, scenario.targetSize).map((s) => s.reference);
  const [run] = await session.tdb.insert(challengeRuns, {
    userId: personUserId(session.principal),
    scenario: scenario.slug,
    mode: opts.mode,
    level,
    targets,
    status: "running",
    startedAt: new Date(),
    datasetVersion: await currentDatasetVersion(),
  });
  return { ok: true, run };
}

/** Abandons a run without scoring it. */
export async function abandonRun(session: LabSession, run: ChallengeRun): Promise<ChallengeRun> {
  const completedAt = new Date();
  const [updated] = await session.tdb.update(
    challengeRuns,
    { status: "abandoned", completedAt, durationMs: completedAt.getTime() - run.startedAt.getTime() },
    eq(challengeRuns.id, run.id),
  );
  return updated;
}

/** True while a scored run is open, which is what withholds grade feedback. */
export async function inScoredRun(session: LabSession): Promise<ChallengeRun | null> {
  const run = await activeRun(session);
  return run && run.mode === "scored" ? run : null;
}

export function runParSeconds(scenario: Scenario, run: ChallengeRun): number {
  return parSeconds(scenario, run.targets.length);
}

/** Sorted board rows: best completed scored run per person, highest first. */
export interface BoardRow {
  runId: string;
  userId: string;
  score: number;
  durationMs: number;
  channel: string | null;
  level: number;
  completedAt: Date;
}

/**
 * Which build of the master set is live. Everything scored is stamped with it,
 * so regenerating the documents starts a clean board rather than mixing runs
 * against different data into one ranking.
 */
export async function currentDatasetVersion(): Promise<number> {
  const { db, schema } = await import("@/db/client");
  const { ensureSharedTenant } = await import("@/lib/corpus/persist");
  const shared = await ensureSharedTenant();
  const [row] = await db.select({ v: schema.tenants.datasetVersion }).from(schema.tenants).where(eq(schema.tenants.id, shared));
  return row?.v ?? 1;
}

export const BOARD_QUERY_LIMIT = 200;

/**
 * The public board reads across every tenant on purpose, so it uses the raw
 * client. It only ever exposes runs whose owner opted in.
 */
export async function leaderboard(scenario: string, channel: "ui" | "api" | "all" = "all", limit = 50, datasetVersion?: number): Promise<BoardRow[]> {
  const { db, schema } = await import("@/db/client");
  const dataset = datasetVersion ?? (await currentDatasetVersion());
  const rows = await db
    .select({
      runId: schema.challengeRuns.id,
      userId: schema.challengeRuns.userId,
      score: schema.challengeRuns.score,
      durationMs: schema.challengeRuns.durationMs,
      channel: schema.challengeRuns.channel,
      level: schema.challengeRuns.level,
      completedAt: schema.challengeRuns.completedAt,
    })
    .from(schema.challengeRuns)
    .where(
      and(
        eq(schema.challengeRuns.scenario, scenario),
        eq(schema.challengeRuns.status, "completed"),
        eq(schema.challengeRuns.mode, "scored"),
        eq(schema.challengeRuns.publish, true),
        channel === "all" ? sql`true` : eq(schema.challengeRuns.channel, channel),
        eq(schema.challengeRuns.datasetVersion, dataset),
        sql`${schema.challengeRuns.score} is not null`,
      ),
    )
    .orderBy(desc(schema.challengeRuns.score), asc(schema.challengeRuns.durationMs))
    .limit(BOARD_QUERY_LIMIT);

  // One entry per person: their best run, ties broken by the faster one.
  const seen = new Set<string>();
  const board: BoardRow[] = [];
  for (const r of rows) {
    if (seen.has(r.userId) || r.score === null || r.completedAt === null) continue;
    seen.add(r.userId);
    board.push({ runId: r.runId, userId: r.userId, score: Number(r.score), durationMs: r.durationMs ?? 0, channel: r.channel, level: r.level, completedAt: r.completedAt });
    if (board.length >= limit) break;
  }
  return board;
}

/** How many published runs sit below this score, as a percentile. */
export async function percentileFor(scenario: string, score: number): Promise<number | null> {
  const { db, schema } = await import("@/db/client");
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      below: sql<number>`count(*) filter (where ${schema.challengeRuns.score} < ${score})`,
    })
    .from(schema.challengeRuns)
    .where(and(eq(schema.challengeRuns.scenario, scenario), eq(schema.challengeRuns.status, "completed"), eq(schema.challengeRuns.mode, "scored"), eq(schema.challengeRuns.publish, true)));
  const total = Number(row?.total ?? 0);
  if (total < 3) return null;
  return Math.round((Number(row.below) / total) * 100);
}
