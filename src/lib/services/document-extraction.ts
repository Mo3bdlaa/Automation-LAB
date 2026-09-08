/**
 * Submitting an extraction of a document that is not an invoice - a commercial
 * registration, a tax card, a delivery note.
 *
 * The invoice path has a taxonomy, a three-way match and a set of decisions
 * hanging off it. This one is simpler on purpose: fields keyed by their
 * ground-truth path, graded against what the generator recorded when it made
 * the document, and stored as an extraction like any other so a run can find it.
 */
import { eq } from "drizzle-orm";
import { documents, extractions, groundTruth, type Document } from "@/db/schema";
import type { LabSession } from "@/lib/auth/server";
import { audit } from "@/lib/auth/server";
import { scoreGenericExtraction, type ExtractionScore } from "@/lib/grading/score";

export interface DocumentExtractionOutcome {
  extractionId: string;
  document: { id: string; kind: Document["kind"]; number: string };
  score: ExtractionScore;
}

export async function submitDocumentExtraction(
  session: LabSession,
  doc: Document,
  fields: Record<string, string>,
  source: "ui" | "api",
  opts: { confidence?: Record<string, number>; level?: number } = {},
): Promise<DocumentExtractionOutcome> {
  const truth = new Map<string, string>();
  const alternates = new Map<string, string[]>();
  for (const g of await session.tdb.list(groundTruth, { where: eq(groundTruth.documentId, doc.id) })) {
    truth.set(g.field, g.value);
    if (g.alternates?.length) alternates.set(g.field, g.alternates);
  }
  const score = scoreGenericExtraction(truth, fields, alternates);
  const [row] = await session.tdb.insert(extractions, {
    documentId: doc.id,
    userId: session.principal.userId,
    source,
    level: opts.level ?? 1,
    fields,
    confidence: opts.confidence ?? null,
    score: score.score.toFixed(4),
    fieldResults: Object.fromEntries(Object.entries(score.fields).map(([k, v]) => [k, { expected: v.expected, actual: v.actual, match: v.match }])),
  });
  await audit(session, "document.extract", "document", doc.number, { kind: doc.kind, source, score: score.score });
  return { extractionId: row.id, document: { id: doc.id, kind: doc.kind, number: doc.number }, score };
}

/** Looks a document up inside the caller's own tenant. */
export async function documentById(session: LabSession, id: string): Promise<Document | null> {
  return session.tdb.one(documents, eq(documents.id, id));
}
