/**
 * Builds everything every participant shares: the master data corpus, then the
 * transaction set on top of it — orders, quotations, deliveries, invoices,
 * supplier applications, their documents and the ground truth behind them.
 *
 * This is rendered once for every participant there will ever be, so it is the
 * one place the lab does heavy work.
 *
 *   pnpm db:seed              (skips when the corpus is already there)
 *   pnpm db:seed --force      (regenerates it — see below)
 *
 * Regenerating replaces the documents everyone is working against. Do it
 * deliberately: between events, or when the templates change. Work already
 * done against the old set refers to rows that no longer exist.
 */
import { pool } from "../src/db/client";
import { seedSharedCorpus } from "../src/lib/corpus/persist";
import { buildMasterSet } from "../src/lib/sandbox/provision";
import { runJobs } from "../src/lib/jobs/runner";
import { closeRenderer } from "../src/lib/documents/renderer";
import { closeDegrader } from "../src/lib/documents/degrade";

async function main() {
  const force = process.argv.includes("--force");
  const report = await seedSharedCorpus({ force, log: (m) => console.log(m) });
  if (!report.skipped) console.table(report.counts);
  if (report.skipped && !force) {
    console.log("Master data already present; pass --force to regenerate it and the transaction set.");
  } else {
    await buildMasterSet((m) => console.log(m));
    // Render here rather than leaving the queue for a web process to drain:
    // the point of a shared master set is that it is ready before anyone
    // arrives, so `pnpm db:seed` should finish the job it started.
    if (!process.argv.includes("--no-render")) {
      let total = 0;
      for (;;) {
        const r = await runJobs({ maxJobs: 200, timeBudgetMs: 10 * 60_000, log: () => {} });
        total += r.processed;
        console.log(`rendered ${total} documents${r.failed ? ` (${r.failed} failed)` : ""}`);
        if (!r.processed) break;
      }
      await closeDegrader();
      await closeRenderer();
    }
  }
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
