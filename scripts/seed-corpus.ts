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
 *   pnpm db:seed --levels     (also produces difficulty levels 2 to 5 up front)
 *
 * `--levels` matters for hosting. Levels 2 to 5 are normally produced on first
 * request, which means the production host needs Chromium. The master set is
 * shared, small and fixed, so producing every level here instead leaves nothing
 * to render at request time and the deployed app needs no browser at all.
 *
 * Regenerating replaces the documents everyone is working against. Do it
 * deliberately: between events, or when the templates change. Work already
 * done against the old set refers to rows that no longer exist.
 */
import { pool } from "../src/db/client";
import { seedSharedCorpus } from "../src/lib/corpus/persist";
import { buildMasterSet, clearAllParticipantWork } from "../src/lib/sandbox/provision";
import { db, schema } from "../src/db/client";
import { and, eq } from "drizzle-orm";
import { degradeDocument } from "../src/lib/documents/service";
import { LEVELS } from "../src/lib/documents/levels";
import { runJobs } from "../src/lib/jobs/runner";
import { closeRenderer } from "../src/lib/documents/renderer";
import { closeDegrader } from "../src/lib/documents/degrade";

/**
 * Produce difficulty levels 2 to 5 for every document in the master set, so a
 * deployed instance never has to run a browser.
 *
 * Scoped to the shared tenant on purpose. Participants' own documents — the
 * goods receipts they post, say — are theirs and short-lived, cleared whenever
 * they reset, and nothing is served from them at a difficulty level.
 */
async function buildEveryLevel() {
  const { ensureSharedTenant } = await import("../src/lib/corpus/persist");
  const shared = await ensureSharedTenant();
  const docs = await db
    .select({ id: schema.documents.id, number: schema.documents.number })
    .from(schema.documents)
    .where(eq(schema.documents.tenantId, shared));
  const wanted = LEVELS.filter((l) => l > 1);
  let done = 0;
  let skipped = 0;
  const started = Date.now();
  for (const doc of docs) {
    for (const level of wanted) {
      const [have] = await db
        .select({ id: schema.documentFiles.id })
        .from(schema.documentFiles)
        .where(and(eq(schema.documentFiles.documentId, doc.id), eq(schema.documentFiles.level, level)));
      if (have) {
        skipped++;
        continue;
      }
      await degradeDocument(doc.id, level);
      done++;
      if (done % 50 === 0) {
        const rate = done / ((Date.now() - started) / 1000);
        console.log(`  ${done} produced (${rate.toFixed(1)}/s), ${docs.length * wanted.length - done - skipped} to go`);
      }
    }
  }
  console.log(`levels 2-5 ready: ${done} produced, ${skipped} already there, ${Math.round((Date.now() - started) / 1000)}s`);
}

async function main() {
  const force = process.argv.includes("--force");
  const levels = process.argv.includes("--levels");
  // Before the master set can be replaced, the work standing on it has to go:
  // a participant's goods receipt references a delivery note that is about to
  // be deleted. Runs, scores and certificates are kept.
  if (force) await clearAllParticipantWork((m) => console.log(m));
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
    }
  }

  // Independent of seeding: producing the levels is something you may want to
  // do to an already-seeded database, typically just before deploying.
  if (levels) {
    await buildEveryLevel();
    await closeDegrader();
    await closeRenderer();
  } else if (!report.skipped || force) {
    await closeDegrader();
    await closeRenderer();
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
