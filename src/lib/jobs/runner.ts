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
  // Rolled-over rate-limit windows are dead weight. Pruned here rather than on
  // the request path, where it would cost every caller to benefit none of them.
  const { pruneRateLimits } = await import("../api/rate-limit");
  await pruneRateLimits().catch(() => 0);
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
 * Work the queue until it is empty, once. Exported so a route can hand it to
 * Next's `after()` itself — see the note on kickJobs about why doing that from
 * here is not reliable.
 */
export function drainJobs(): Promise<unknown> {
  if (inFlight) return inFlight;
  const budget = Number(process.env.JOBS_KICK_BUDGET_MS ?? 60_000);
  const rounds = Number(process.env.JOBS_KICK_ROUNDS ?? 6);
  inFlight = (async () => {
    for (let round = 0; round < rounds; round++) {
      const r = await runJobs({ maxJobs: 100, timeBudgetMs: budget, log: (m) => console.log(`[jobs] ${m}`) });
      if (r.processed + r.failed === 0) break;
    }
  })()
    .catch((e) => console.error("[jobs] drain failed", e))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Best-effort in-process processing after an enqueue.
 *
 * It reaches for Next's `after()` through a dynamic import, which is why a
 * route that needs the work to actually happen should call `after(drainJobs)`
 * itself instead: `after()` has to be called inside the request, and by the
 * time this import resolves the request may be over. It then throws, the
 * timer fallback takes its place, and on a serverless host the instance is
 * frozen the moment the response is sent — the job stays queued until the
 * nightly cron. That is exactly what a download of a just-created document
 * did on the deployed lab: three queued renders, none of them run, no error
 * anywhere. Local development is unaffected, which is what hid it.
 *
 * Set JOBS_KICK=0 to disable (e.g. when a dedicated worker runs).
 */
export function kickJobs(): void {
  if (process.env.JOBS_KICK === "0") return;
  if (inFlight) return;
  // Bounded on purpose: a web process must not grind through an unbounded
  // backlog. Whatever is left is picked up by the next kick or by the cron
  // route (/api/jobs/run), which is what runs on a deployed lab.
  const run = () => drainJobs();
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
