import { claimNext, complete, fail, requeueStale } from "./queue";
import { handlers } from "./handlers";

export interface RunReport {
  processed: number;
  failed: number;
  elapsedMs: number;
}

export async function runJobs(opts: { maxJobs?: number; timeBudgetMs?: number; log?: (m: string) => void } = {}): Promise<RunReport> {
  const log = opts.log ?? (() => {});
  const start = Date.now();
  const maxJobs = opts.maxJobs ?? 50;
  const budget = opts.timeBudgetMs ?? 55_000;
  let processed = 0;
  let failed = 0;
  await requeueStale();
  while (processed + failed < maxJobs && Date.now() - start < budget) {
    const job = await claimNext();
    if (!job) break;
    const handler = handlers[job.kind];
    log(`→ ${job.kind} ${job.id} (attempt ${job.attempts})`);
    try {
      if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
      await handler(job, log);
      await complete(job);
      processed++;
    } catch (e) {
      log(`✗ ${job.kind} ${job.id}: ${e instanceof Error ? e.message : String(e)}`);
      await fail(job, e);
      failed++;
    }
  }
  return { processed, failed, elapsedMs: Date.now() - start };
}

let inFlight: Promise<unknown> | null = null;

/**
 * Best-effort in-process processing after an enqueue. Local dev needs no
 * worker; on Vercel this piggybacks on the request's `after()` window and the
 * cron route picks up anything left. Runs in rounds until the queue is empty
 * or nothing was processed in a round. Set JOBS_KICK=0 to disable (e.g. when
 * a dedicated worker runs).
 */
export function kickJobs(): void {
  if (process.env.JOBS_KICK === "0") return;
  if (inFlight) return;
  const budget = Number(process.env.JOBS_KICK_BUDGET_MS ?? 240_000);
  const run = () => {
    inFlight = (async () => {
      for (let round = 0; round < 50; round++) {
        const r = await runJobs({ maxJobs: 500, timeBudgetMs: budget, log: (m) => console.log(`[jobs] ${m}`) });
        if (r.processed + r.failed === 0) break;
      }
    })()
      .catch((e) => console.error("[jobs] kick failed", e))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
  // Prefer Next's after() so serverless functions keep the process alive; fall back to a plain timer.
  import("next/server")
    .then((m) => {
      try {
        m.after(run);
      } catch {
        setTimeout(run, 10);
      }
    })
    .catch(() => setTimeout(run, 10));
}
