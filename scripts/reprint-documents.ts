/**
 * Reprints PDFs that already exist, without regenerating the data behind them.
 *
 * `pnpm db:seed --force` is the wrong tool for a template change: it rebuilds
 * the transaction set and clears every participant's work, because the rows
 * they were working against stop existing. When only the printing changed —
 * a template edit, a font, the specimen footer — the rows are fine and it is
 * the paper that is stale. This re-renders each document in place: the blob
 * key is derived from (tenant, document, level), so every file is overwritten
 * where it already sits and nothing downstream has to learn a new address.
 *
 *   pnpm docs:reprint                  (the shared master set, every level it has)
 *   pnpm docs:reprint --kind=invoice   (one kind — matches on a prefix)
 *   pnpm docs:reprint --all            (participants' own documents too)
 *   pnpm docs:reprint --dry-run        (count what would be reprinted)
 *
 * Levels 2 to 5 are derived from the level-1 PDF, so a document that has them
 * gets them rebuilt from the fresh level 1 in the same pass. Levels that were
 * never produced are not produced now: that is `--levels` on the seed, and it
 * is a different decision.
 *
 * Needs a browser, so it is a local or CI operation pointed at the target
 * database, never something the deployed app does on a request.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { db, pool, schema } from "../src/db/client";
import { degradeDocument, renderDocument } from "../src/lib/documents/service";
import { closeRenderer } from "../src/lib/documents/renderer";
import { closeDegrader } from "../src/lib/documents/degrade";
import { ensureSharedTenant } from "../src/lib/corpus/persist";

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main() {
  const all = process.argv.includes("--all");
  const dryRun = process.argv.includes("--dry-run");
  const kind = argValue("kind");

  const shared = await ensureSharedTenant();
  const docs = await db
    .select({ id: schema.documents.id, kind: schema.documents.kind, number: schema.documents.number })
    .from(schema.documents)
    .where(all ? undefined : eq(schema.documents.tenantId, shared))
    .orderBy(asc(schema.documents.number));

  const wanted = kind ? docs.filter((d) => d.kind.startsWith(kind)) : docs;
  if (!wanted.length) {
    console.log(kind ? `No documents of kind ${kind}.` : "No documents to reprint.");
    return;
  }

  // One query for the extra levels rather than one per document: the master set
  // is a few hundred documents and four levels each.
  const extras = new Map<string, number[]>();
  for (const row of await db
    .select({ documentId: schema.documentFiles.documentId, level: schema.documentFiles.level })
    .from(schema.documentFiles)
    .where(inArray(schema.documentFiles.documentId, wanted.map((d) => d.id)))) {
    if (row.level === 1) continue;
    extras.set(row.documentId, [...(extras.get(row.documentId) ?? []), row.level].sort((a, b) => a - b));
  }

  const files = wanted.length + [...extras.values()].reduce((n, l) => n + l.length, 0);
  console.log(`${wanted.length} document(s), ${files} file(s)${all ? ", every tenant" : ", shared master set"}${kind ? `, kind ${kind}` : ""}`);
  if (dryRun) return;

  const started = Date.now();
  let done = 0;
  for (const doc of wanted) {
    await renderDocument(doc.id);
    done++;
    for (const level of extras.get(doc.id) ?? []) {
      await degradeDocument(doc.id, level);
      done++;
    }
    if (done % 50 < 1 + (extras.get(doc.id)?.length ?? 0)) {
      const rate = done / ((Date.now() - started) / 1000);
      console.log(`  ${done}/${files} (${rate.toFixed(1)}/s)`);
    }
  }
  console.log(`reprinted ${done} file(s) in ${Math.round((Date.now() - started) / 1000)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDegrader();
    await closeRenderer();
    await pool.end();
  });
