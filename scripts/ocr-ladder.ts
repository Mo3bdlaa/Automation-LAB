/**
 * P3 acceptance test: prove the difficulty ladder is real.
 *
 * For a sample of generated invoices it renders every level, rasterises page 1,
 * runs an OCR engine over it, and reports the share of ground-truth field values
 * the OCR output actually contains. A ladder that works shows accuracy falling
 * monotonically from level 1 (native text) to level 5 (a handled photograph).
 *
 * Tesseract is used because it is free and scriptable, not because the lab
 * prescribes an engine: which OCR a student points at these documents is part
 * of the exercise. Install it with `apt-get install tesseract-ocr
 * tesseract-ocr-ara`; the Arabic data is needed for the Arabic-first documents.
 *
 *   pnpm ocr:ladder --docs=10 [--language=ar] [--dpi=300]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, pool, schema } from "../src/db/client";
import { blobStore } from "../src/lib/blob";
import { degradeDocument, renderDocument } from "../src/lib/documents/service";
import { closeRenderer } from "../src/lib/documents/renderer";
import { closeDegrader, rasterisePages } from "../src/lib/documents/degrade";
import { LEVELS } from "../src/lib/documents/levels";
import { normaliseText } from "../src/lib/grading/normalise";

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};
const SAMPLE = arg("docs", 10);
const DPI = arg("dpi", 300);
/** Limit the sample to documents printed in one script: en, ar or bilingual. */
const LANGUAGE = process.argv.find((a) => a.startsWith("--language="))?.split("=")[1];

function haveTesseract(): boolean {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Tesseract language data for a document, by the script it was printed in. */
function langFor(documentLanguage: string): string {
  return documentLanguage === "en" ? "eng" : "ara+eng";
}

function ocr(png: Buffer, workDir: string, lang: string): string {
  const file = path.join(workDir, `page-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  writeFileSync(file, png);
  try {
    return execFileSync("tesseract", [file, "stdout", "-l", lang, "--psm", "6"], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 }).toString();
  } finally {
    rmSync(file, { force: true });
  }
}

/**
 * Share of ground-truth values the OCR text contains, ignoring layout. Each
 * value comes with its alternate readings; finding any one of them counts.
 */
function recall(text: string, values: string[][]): number {
  const hay = normaliseText(text).replace(/\s+/g, "");
  const wanted = values.map((vs) => vs.map((v) => normaliseText(v).replace(/\s+/g, "")).filter((v) => v.length >= 3)).filter((vs) => vs.length);
  if (!wanted.length) return 0;
  return wanted.filter((vs) => vs.some((v) => hay.includes(v))).length / wanted.length;
}

async function main() {
  if (!haveTesseract()) {
    console.error("Tesseract is not installed. `apt-get install -y tesseract-ocr`, then run this again.");
    process.exit(2);
  }
  const languages = execFileSync("tesseract", ["--list-langs"], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  if (!languages.includes("ara")) {
    console.error("Tesseract has no Arabic data. `apt-get install -y tesseract-ocr-ara`, then run this again.");
    process.exit(2);
  }
  const docs = await db
    .select()
    .from(schema.documents)
    .where(LANGUAGE ? and(eq(schema.documents.kind, "invoice"), eq(schema.documents.language, LANGUAGE as "en" | "ar" | "bilingual")) : eq(schema.documents.kind, "invoice"))
    .orderBy(sql`random()`)
    .limit(SAMPLE);
  if (!docs.length) {
    console.error("No invoice documents found. Provision a sandbox first.");
    process.exit(2);
  }
  const workDir = mkdtempSync(path.join(tmpdir(), "ocr-ladder-"));
  const totals = new Map<number, number[]>(LEVELS.map((l) => [l, []]));
  // Kept apart so a weak result in one script cannot hide behind the other.
  const byScript = new Map<string, Map<number, number[]>>();

  for (const [i, doc] of docs.entries()) {
    const truth = await db.select().from(schema.groundTruth).where(eq(schema.groundTruth.documentId, doc.id));
    // Either script of a bilingual value counts: the document prints both.
    const values = truth.map((t) => [t.value, ...(t.alternates ?? [])]);
    if (!byScript.has(doc.language)) byScript.set(doc.language, new Map(LEVELS.map((l) => [l, []])));
    for (const level of LEVELS) {
      let [file] = await db.select().from(schema.documentFiles).where(and(eq(schema.documentFiles.documentId, doc.id), eq(schema.documentFiles.level, level)));
      if (!file) {
        if (level === 1) await renderDocument(doc.id);
        else await degradeDocument(doc.id, level);
        [file] = await db.select().from(schema.documentFiles).where(and(eq(schema.documentFiles.documentId, doc.id), eq(schema.documentFiles.level, level)));
      }
      const bytes = await blobStore().get(file.blobKey);
      if (!bytes) throw new Error(`missing blob for ${doc.number} L${level}`);
      const [png] = await rasterisePages(bytes, DPI);
      const r = recall(ocr(png, workDir, langFor(doc.language)), values);
      totals.get(level)!.push(r);
      byScript.get(doc.language)!.get(level)!.push(r);
      process.stdout.write(`\r${i + 1}/${docs.length} ${doc.number} L${level} ${(r * 100).toFixed(0)}%   `);
    }
  }
  rmSync(workDir, { recursive: true, force: true });

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log(`\n\nOCR recall of ground-truth values, ${docs.length} invoices at ${DPI} dpi\n`);
  let previous = Infinity;
  let monotonic = true;
  for (const level of LEVELS) {
    const m = mean(totals.get(level)!);
    console.log(`  L${level}  ${(m * 100).toFixed(1).padStart(5)}%   ${"█".repeat(Math.round(m * 40))}`);
    if (m > previous + 0.005) monotonic = false;
    previous = m;
  }
  console.log("\nBy the script the vendor printed in:");
  for (const [lang, m] of [...byScript.entries()].sort()) {
    const n = m.get(1)!.length;
    console.log(`  ${lang.padEnd(9)} (${String(n).padStart(2)} docs)  ${LEVELS.map((l) => `L${l} ${(mean(m.get(l)!) * 100).toFixed(0).padStart(3)}%`).join("  ")}`);
  }
  console.log(`\nMonotonic decrease from L1 to L5: ${monotonic ? "yes" : "NO"}`);
  await closeDegrader();
  await closeRenderer();
  await pool.end();
  process.exit(monotonic ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
