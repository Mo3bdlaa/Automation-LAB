/**
 * Invoice domain service: extraction, three-way match, grading and the AP
 * decisions. The UI server actions and the REST API both call these functions,
 * so a bot and a human are held to exactly the same rules.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  documents, extractions, grnLines, grns, invoiceLines, invoices, items, payments, purchaseOrderLines, purchaseOrders, seededDefects, vendors,
  type Invoice,
} from "@/db/schema";
import type { LabSession } from "@/lib/auth/server";
import { audit } from "@/lib/auth/server";
import { runRules, type ValidationResult, type Violation } from "@/lib/validation/engine";
import { matchRules, type MatchContext } from "@/lib/validation/matching";
import { round2 } from "@/lib/generator/money";
import { CORPUS_TODAY } from "@/lib/generator/dates";
import { gradeDefects, scoreInvoiceExtraction, type DefectGrade, type ExtractionScore } from "@/lib/grading/score";
import { emitWebhook } from "@/lib/webhooks/emit";

export type MatchLine = MatchContext["invoice"]["lines"][number];

/** Builds the three-way match context for an invoice from a set of field values. */
export async function buildMatchContext(session: LabSession, inv: Invoice, lines: MatchLine[]): Promise<MatchContext> {
  const tdb = session.tdb;
  const vendor = await tdb.one(vendors, eq(vendors.taxId, inv.printedVendorTaxId));
  const po = inv.printedPoNumber ? await tdb.one(purchaseOrders, eq(purchaseOrders.number, inv.printedPoNumber)) : null;
  const poLines = po ? await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] }) : [];
  const itemIds = poLines.map((l) => l.itemId).filter(Boolean) as string[];
  const itemRows = itemIds.length ? await tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const poVendor = po ? await tdb.one(vendors, eq(vendors.id, po.vendorId)) : null;

  const receivedByPoLine = new Map<number, number>();
  const previouslyInvoicedByPoLine = new Map<number, number>();
  if (po) {
    const gs = await tdb.list(grns, { where: and(eq(grns.purchaseOrderId, po.id), eq(grns.status, "posted"))! });
    const gl = gs.length ? await tdb.list(grnLines, { where: inArray(grnLines.grnId, gs.map((g) => g.id)) }) : [];
    for (const l of gl) {
      const pl = poLines.find((p) => p.id === l.purchaseOrderLineId);
      if (pl) receivedByPoLine.set(pl.lineNo, round2((receivedByPoLine.get(pl.lineNo) ?? 0) + Number(l.quantityAccepted)));
    }
    const others = await tdb.list(invoices, { where: and(eq(invoices.purchaseOrderId, po.id), ne(invoices.id, inv.id), inArray(invoices.status, ["extracted", "matched", "approved", "paid"]))! });
    const ol = others.length ? await tdb.list(invoiceLines, { where: inArray(invoiceLines.invoiceId, others.map((o) => o.id)) }) : [];
    for (const l of ol) {
      const pl = poLines.find((p) => p.id === l.purchaseOrderLineId);
      if (pl) previouslyInvoicedByPoLine.set(pl.lineNo, round2((previouslyInvoicedByPoLine.get(pl.lineNo) ?? 0) + Number(l.quantity)));
    }
  }
  const sameVendor = vendor
    ? await tdb.list(invoices, { where: and(eq(invoices.vendorId, vendor.id), ne(invoices.id, inv.id), sql`substr(${invoices.invoiceDate}::text, 1, 4) = ${inv.invoiceDate.slice(0, 4)}`)! })
    : [];
  return {
    invoice: {
      number: inv.number, printedPoNumber: inv.printedPoNumber, printedVendorName: inv.printedVendorName, printedVendorTaxId: inv.printedVendorTaxId,
      printedIban: inv.printedIban, invoiceDate: inv.invoiceDate, currency: inv.currency,
      subtotal: Number(inv.subtotal), taxTotal: Number(inv.taxTotal), grandTotal: Number(inv.grandTotal), lines,
    },
    vendor: vendor ? { code: vendor.code, name: vendor.name, iban: vendor.iban, taxCertExpiry: vendor.taxCertExpiry, status: vendor.status, blacklisted: vendor.blacklisted } : null,
    po: po ? { number: po.number, currency: po.currency, vendorCode: poVendor?.code ?? "", lines: poLines.map((l) => ({ lineNo: l.lineNo, itemCode: itemRows.find((i) => i.id === l.itemId)?.code ?? "", quantity: Number(l.quantity), uom: l.uom, unitPrice: Number(l.unitPrice), discountPct: Number(l.discountPct), taxCode: l.taxCode })) } : null,
    receivedByPoLine,
    previouslyInvoicedByPoLine,
    otherInvoiceNumbers: sameVendor.map((o) => o.number),
    today: CORPUS_TODAY,
  };
}

/** Runs the match against the invoice as stored (the printed truth). Staff and re-checks use this. */
export async function matchStoredInvoice(session: LabSession, inv: Invoice): Promise<ValidationResult> {
  const tdb = session.tdb;
  const lines = await tdb.list(invoiceLines, { where: eq(invoiceLines.invoiceId, inv.id), orderBy: [{ column: invoiceLines.lineNo }] });
  const poLines = inv.purchaseOrderId ? await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, inv.purchaseOrderId) }) : [];
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const itemRows = itemIds.length ? await tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const ctx = await buildMatchContext(
    session,
    inv,
    lines.map((l) => ({
      lineNo: l.lineNo, poLineNo: poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? null, itemCode: itemRows.find((i) => i.id === l.itemId)?.code ?? null,
      quantity: Number(l.quantity), uom: l.uom, unitPrice: Number(l.unitPrice), discountPct: Number(l.discountPct), taxCode: l.taxCode,
      taxRate: Number(l.taxRate), taxAmount: Number(l.taxAmount), lineTotal: Number(l.lineTotal),
    })),
  );
  return runRules(matchRules, ctx);
}

export interface ExtractionOutcome {
  ok: boolean;
  status: Invoice["status"];
  violations: Violation[];
  score: ExtractionScore;
  defects: DefectGrade;
  extractionId: string | null;
}

/**
 * Stores a submitted extraction, runs the match on the submitted values, and
 * grades both the field accuracy and the defects the student caught.
 */
export async function submitExtraction(
  session: LabSession,
  inv: Invoice,
  fields: Record<string, string>,
  asStored: Invoice,
  lines: MatchLine[],
  source: "ui" | "api",
  opts: { confidence?: Record<string, number>; level?: number } = {},
): Promise<ExtractionOutcome> {
  const { confidence, level = 1 } = opts;
  const ctx = await buildMatchContext(session, asStored, lines);
  const result = runRules(matchRules, ctx);

  const doc = await session.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!);
  const truth = new Map<string, string>();
  // A bilingual document prints some values twice; both readings are correct.
  const alternates = new Map<string, string[]>();
  if (doc) {
    const { groundTruth } = await import("@/db/schema");
    for (const g of await session.tdb.list(groundTruth, { where: eq(groundTruth.documentId, doc.id) })) {
      truth.set(g.field, g.value);
      if (g.alternates?.length) alternates.set(g.field, g.alternates);
    }
  }
  const score = scoreInvoiceExtraction(truth, fields, { alternates });
  const seeded = doc ? await session.tdb.list(seededDefects, { where: eq(seededDefects.documentId, doc.id) }) : [];
  // What the same rules say about the document as it was printed. Anything the
  // submission raises that this also raises was not introduced by the reading.
  const inherent = await matchStoredInvoice(session, inv);
  const defects = gradeDefects(
    seeded.map((d) => ({ defectType: d.defectType, details: d.details })),
    result.violations,
    inherent.violations,
  );

  let extractionId: string | null = null;
  if (doc) {
    const [row] = await session.tdb.insert(extractions, {
      documentId: doc.id,
      userId: session.principal.userId,
      source,
      level,
      fields,
      confidence: confidence ?? null,
      score: score.score.toFixed(4),
      fieldResults: Object.fromEntries(Object.entries(score.fields).map(([k, v]) => [k, { expected: v.expected, actual: v.actual, match: v.match }])),
      matchResult: { ok: result.ok, violations: result.violations, defects: { caught: defects.caught, missed: defects.missed, falsePositives: defects.falsePositives } },
    });
    extractionId = row.id;
  }
  const status: Invoice["status"] = result.ok ? "matched" : "exception";
  await session.tdb.update(invoices, { status, updatedAt: new Date() }, eq(invoices.id, inv.id));
  await audit(session, "invoice.extract", "invoice", inv.internalNumber, { source, level, ok: result.ok, score: score.score, violations: result.violations.map((v) => v.ruleId) });
  await emitWebhook(session, "invoice.status_changed", { internalNumber: inv.internalNumber, status, previousStatus: inv.status, score: score.score, violations: result.violations.map((v) => v.ruleId) });
  return { ok: result.ok, status, violations: result.violations, score, defects, extractionId };
}

export type Decision = "approve" | "reject" | "pay";

export interface DecisionOutcome {
  ok: boolean;
  status?: Invoice["status"];
  paymentNumber?: string;
  error?: string;
  message?: string;
}

/** Approve, reject or pay. State transitions are enforced here, not in the UI. */
export async function decideInvoice(session: LabSession, inv: Invoice, decision: Decision): Promise<DecisionOutcome> {
  if (session.tdb.isReadOnlyRow(invoices, inv)) return { ok: false, error: "read_only", message: "Shared corpus records cannot be changed." };

  if (decision === "approve") {
    if (!["matched", "exception", "extracted"].includes(inv.status)) return { ok: false, error: "invalid_state", message: `An invoice in status ${inv.status} cannot be approved.` };
    await session.tdb.update(invoices, { status: "approved", updatedAt: new Date() }, eq(invoices.id, inv.id));
    await audit(session, "invoice.approve", "invoice", inv.internalNumber, { previousStatus: inv.status });
    await emitWebhook(session, "invoice.status_changed", { internalNumber: inv.internalNumber, status: "approved", previousStatus: inv.status });
    return { ok: true, status: "approved" };
  }

  if (decision === "reject") {
    if (["paid", "rejected"].includes(inv.status)) return { ok: false, error: "invalid_state", message: `An invoice in status ${inv.status} cannot be rejected.` };
    await session.tdb.update(invoices, { status: "rejected", updatedAt: new Date() }, eq(invoices.id, inv.id));
    await audit(session, "invoice.reject", "invoice", inv.internalNumber, { previousStatus: inv.status });
    await emitWebhook(session, "invoice.status_changed", { internalNumber: inv.internalNumber, status: "rejected", previousStatus: inv.status });
    return { ok: true, status: "rejected" };
  }

  if (inv.status !== "approved") return { ok: false, error: "invalid_state", message: "Only an approved invoice can be paid." };
  const year = CORPUS_TODAY.slice(0, 4);
  const existing = await session.tdb.list(payments, {
    where: and(eq(payments.tenantId, session.tenant.id), sql`${payments.number} like ${"PAY-" + year + "-9%"}`)!,
    orderBy: [{ column: payments.number, direction: "desc" }],
    limit: 1,
  });
  const seq = existing[0] ? Number(existing[0].number.slice(-5)) + 1 : 90001;
  const number = `PAY-${year}-${String(seq).padStart(5, "0")}`;
  await session.tdb.insert(payments, {
    number, invoiceId: inv.id, vendorId: inv.vendorId, paidDate: CORPUS_TODAY, amount: inv.grandTotal, currency: inv.currency,
    method: "bank_transfer", reference: `TRF${Date.now().toString().slice(-10)}`, ibanPaidTo: inv.printedIban,
  });
  await session.tdb.update(invoices, { status: "paid", updatedAt: new Date() }, eq(invoices.id, inv.id));
  await audit(session, "invoice.pay", "invoice", inv.internalNumber, { amount: inv.grandTotal, payment: number });
  await emitWebhook(session, "invoice.status_changed", { internalNumber: inv.internalNumber, status: "paid", previousStatus: "approved", paymentNumber: number });
  return { ok: true, status: "paid", paymentNumber: number };
}
