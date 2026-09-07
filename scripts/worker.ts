/**
 * Long-running job worker for local development and VPS deployments.
 * On Vercel the same runner is invoked from /api/jobs/run (cron) and after enqueues.
 */
import { pool } from "../src/db/client";
import { runJobs } from "../src/lib/jobs/runner";
import { closeRenderer } from "../src/lib/documents/renderer";
import { closeDegrader } from "../src/lib/documents/degrade";

const once = process.argv.includes("--once");
const intervalMs = Number(process.env.WORKER_POLL_MS ?? 2000);
let stopping = false;

async function loop() {
  const log = (m: string) => console.log(`[worker] ${m}`);
  do {
    const r = await runJobs({ maxJobs: 100, timeBudgetMs: 5 * 60_000, log });
    if (r.processed || r.failed) log(`processed=${r.processed} failed=${r.failed} in ${r.elapsedMs}ms`);
    if (once) break;
    await new Promise((res) => setTimeout(res, intervalMs));
  } while (!stopping);
  await closeDegrader();
  await closeRenderer();
  await pool.end();
}

process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));
loop().catch((e) => {
  console.error(e);
  process.exit(1);
});
