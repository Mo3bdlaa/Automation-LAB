import { and, eq, sql } from "drizzle-orm";
import { documents, extractions, invoices } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { conflict, notFound, ok } from "@/lib/api/http";
import { extractionToInvoice } from "@/lib/services/extraction";
import { matchStoredInvoice, submitExtraction } from "@/lib/services/invoices";

/** Re-runs the three-way match on the last extraction, without resubmitting it. */
export async function POST(_req: Request, ctx: { params: Promise<{ internalNumber: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { internalNumber } = await ctx.params;
  const inv = await s.tdb.one(invoices, eq(invoices.internalNumber, decodeURIComponent(internalNumber)));
  if (!inv) return notFound("Invoice");
  if (inv.status === "pending_extraction") return conflict("Submit an extraction before running the match.", { status: inv.status });

  const doc = await s.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!);
  const last = doc
    ? (await s.tdb.list(extractions, { where: and(eq(extractions.documentId, doc.id), sql`${extractions.fields} ? 'number'`)!, orderBy: [{ column: extractions.submittedAt, direction: "desc" }], limit: 1 }))[0]
    : null;
  if (last) {
    const { asStored, lines } = extractionToInvoice(inv, last.fields);
    const outcome = await submitExtraction(s, inv, last.fields, asStored, lines, "api");
    return ok({ match: { ok: outcome.ok, violations: outcome.violations }, grade: { score: outcome.score.score, defects: outcome.defects }, invoice: { internalNumber: inv.internalNumber, status: outcome.status } });
  }
  const result = await matchStoredInvoice(s, inv);
  return ok({ match: { ok: result.ok, violations: result.violations }, invoice: { internalNumber: inv.internalNumber, status: inv.status }, note: "No extraction on file; the stored document was matched." });
}
