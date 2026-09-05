/**
 * Postgres-backed job queue. Small on purpose: one table, SKIP LOCKED claims,
 * bounded retries. Runs from (a) `pnpm worker` locally or on a VPS, (b)
 * `POST /api/jobs/run` for Vercel Cron, and (c) `kickJobs()` right after an
 * enqueue so local development needs no second process.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { Job, JobKind } from "@/db/schema";

export async function enqueue(kind: JobKind, payload: Record<string, unknown>, opts: { tenantId?: string | null; priority?: number } = {}): Promise<Job> {
  const [job] = await db
    .insert(schema.jobs)
    .values({ kind, payload, tenantId: opts.tenantId ?? null, priority: opts.priority ?? 0 })
    .returning();
  return job;
}

/** Claim the next runnable job atomically. */
export async function claimNext(): Promise<Job | null> {
  const rows = await db.execute(sql`
    UPDATE jobs SET status = 'running', started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_after <= now()
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`);
  const r = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[]);
  const row = r[0];
  if (!row) return null;
  return {
    id: row.id as string,
    tenantId: (row.tenant_id as string) ?? null,
    kind: row.kind as JobKind,
    payload: row.payload as Record<string, unknown>,
    status: row.status as Job["status"],
    priority: row.priority as number,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    error: (row.error as string) ?? null,
    runAfter: new Date(row.run_after as string),
    createdAt: new Date(row.created_at as string),
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at as string) : null,
  };
}

export async function complete(job: Job): Promise<void> {
  await db.update(schema.jobs).set({ status: "done", finishedAt: new Date(), error: null }).where(eq(schema.jobs.id, job.id));
}

export async function fail(job: Job, err: unknown): Promise<void> {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}`.slice(0, 4000) : String(err);
  const retry = job.attempts < job.maxAttempts;
  const backoffMs = Math.min(60_000, 2_000 * 2 ** job.attempts);
  await db
    .update(schema.jobs)
    .set({
      status: retry ? "queued" : "failed",
      error: message,
      finishedAt: retry ? null : new Date(),
      runAfter: retry ? new Date(Date.now() + backoffMs) : job.runAfter,
    })
    .where(eq(schema.jobs.id, job.id));
}

export async function pendingCount(tenantId: string, kind?: JobKind): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.tenantId, tenantId), kind ? eq(schema.jobs.kind, kind) : undefined, sql`${schema.jobs.status} in ('queued','running')`));
  return Number(row?.n ?? 0);
}

export async function recentJobs(tenantId: string, limit = 10): Promise<Job[]> {
  return db.select().from(schema.jobs).where(eq(schema.jobs.tenantId, tenantId)).orderBy(sql`${schema.jobs.createdAt} desc`).limit(limit);
}

/** Requeue jobs that were claimed but whose worker died (running for too long). */
export async function requeueStale(maxRunMs = 10 * 60_000): Promise<number> {
  const rows = await db
    .update(schema.jobs)
    .set({ status: "queued" })
    .where(and(eq(schema.jobs.status, "running"), lte(schema.jobs.startedAt, new Date(Date.now() - maxRunMs))))
    .returning({ id: schema.jobs.id });
  return rows.length;
}
