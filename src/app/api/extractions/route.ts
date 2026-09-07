import { z } from "zod";
import { eq } from "drizzle-orm";
import { invoices } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { conflict, created, notFound, problem, readJson } from "@/lib/api/http";
import { extractionToInvoice, flattenApiExtraction } from "@/lib/services/extraction";
import { submitExtraction } from "@/lib/services/invoices";
import { defaultLevel } from "@/lib/lab-settings";

const Body = z.object({
  internalNumber: z.string().min(1),
  fields: z
    .object({
      number: z.string().optional(),
      invoiceDate: z.string().optional(),
      dueDate: z.string().optional(),
      poNumber: z.string().nullish(),
      currency: z.string().optional(),
      vendorName: z.string().optional(),
      vendorTaxId: z.string().optional(),
      iban: z.string().optional(),
      bankName: z.string().optional(),
      subtotal: z.union([z.string(), z.number()]).optional(),
      taxTotal: z.union([z.string(), z.number()]).optional(),
      grandTotal: z.union([z.string(), z.number()]).optional(),
    })
    .default({}),
  lines: z
    .array(
      z.object({
        poLineNo: z.number().int().nullish(),
        itemCode: z.string().nullish(),
        description: z.string().nullish(),
        quantity: z.number(),
        uom: z.string().default(""),
        unitPrice: z.number(),
        taxRate: z.number().default(0),
        taxAmount: z.number().nullish(),
        lineTotal: z.number().nullish(),
      }),
    )
    .min(1),
  /** Optional per-field confidence (0..1), keyed like the ground truth: `number`, `vendor.iban`, `lines[0].quantity`. */
  confidence: z.record(z.string(), z.number().min(0).max(1)).optional(),
  /** Which difficulty level the bot read. Defaults to the level the instructor set. */
  level: z.number().int().min(1).max(5).optional(),
});

/**
 * Submits what a bot read from the invoice PDF. The three-way match runs on the
 * submitted values, and the submission is graded against the ground truth the
 * generator stored when it created the document.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const { internalNumber, fields, lines, confidence } = parsed.data;
  const level = parsed.data.level ?? (await defaultLevel());

  const inv = await s.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv) return notFound("Invoice");
  if (s.tdb.isReadOnlyRow(inv)) return problem(403, "read_only", "Shared corpus records cannot be changed.");
  if (!["pending_extraction", "extracted", "exception", "matched"].includes(inv.status)) {
    return conflict(`Invoice ${internalNumber} is ${inv.status}; extraction is closed.`, { status: inv.status });
  }

  const flat = flattenApiExtraction({ fields, lines });
  const { asStored, lines: matchLines } = extractionToInvoice(inv, flat);
  const outcome = await submitExtraction(s, inv, flat, asStored, matchLines, "api", { confidence, level });
  return created({
    extractionId: outcome.extractionId,
    level,
    invoice: { internalNumber: inv.internalNumber, status: outcome.status },
    match: { ok: outcome.ok, violations: outcome.violations },
    grade: {
      score: outcome.score.score,
      matchedFields: outcome.score.matched,
      totalFields: outcome.score.total,
      extraLines: outcome.score.extraLines,
      missingLines: outcome.score.missingLines,
      defects: { caught: outcome.defects.caught, missed: outcome.defects.missed, falsePositives: outcome.defects.falsePositives, recall: outcome.defects.recall, precision: outcome.defects.precision },
    },
  });
}
