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
import { lineMoney, round2, TAX_CODES, totals, type TaxCode } from "@/lib/generator/money";
import { CORPUS_TODAY } from "@/lib/generator/dates";
import { gradeDefects, scoreInvoiceExtraction, type DefectGrade, type ExtractionScore } from "@/lib/grading/score";
import { emitWebhook } from "@/lib/webhooks/emit";
import { participantPdfsEager } from "@/lib/documents/participant-pdfs";
import { enqueue } from "@/lib/jobs/queue";

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

/** One line of a vendor invoice as somebody types it in. */
export interface InvoiceEntryLine {
  itemCode?: string;
  description?: string;
  quantity: number;
  uom?: string;
  unitPrice: number;
  discountPct?: number;
  taxCode?: string;
}

export interface InvoiceEntryInput {
  /** The vendor's own invoice number, as printed on the paper. */
  number: string;
  poNumber?: string;
  /** Only needed when there is no purchase order to take the vendor from. */
  vendorCode?: string;
  invoiceDate?: string;
  dueDate?: string;
  currency?: string;
  /**
   * What the paper says about the vendor. Left blank they are taken from the
   * master, which is the clean case; typed differently they are how a changed
   * bank account or a mistyped tax number reaches the match, which is the
   * whole point of keeping them separate from the master in the first place.
   */
  printedVendorName?: string;
  printedVendorTaxId?: string;
  printedIban?: string;
  printedBankName?: string;
  /** Blank means "add up the lines"; a figure means "this is what the paper says". */
  subtotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  lines: InvoiceEntryLine[];
}

export type RecordInvoiceResult =
  | { ok: true; internalNumber: string; status: Invoice["status"]; violations: Violation[] }
  | { ok: false; error: "validation_failed"; message: string; violations: Violation[] };

/**
 * Register a vendor invoice that arrived on paper.
 *
 * Accounts payable in any ERP has this screen: the invoice is in your hand,
 * you key it against the order, and the system tells you whether it agrees
 * with what was ordered and what was received. The lab's own invoices arrive
 * already printed, because reading them is the exercise — but a participant
 * who wants to see the far side of the three-way match had nowhere to enter
 * one, and an ERP replica missing accounts payable entry is missing a room.
 *
 * What is typed is kept as typed. The printed vendor details, the totals and
 * the line prices all go in exactly as given, and the match then runs against
 * the master and the purchase order — so keying a figure wrong here produces
 * the same violation, with the same rule ID, as a misread on a scan.
 */
export async function recordInvoice(session: LabSession, input: InvoiceEntryInput): Promise<RecordInvoiceResult> {
  const tdb = session.tdb;
  const number = (input.number ?? "").trim();
  const fail = (violations: Violation[]): RecordInvoiceResult => ({ ok: false, error: "validation_failed", message: "The invoice cannot be registered as entered.", violations });
  if (!number) {
    return fail([{ ruleId: "INV-NUMBER-REQUIRED", severity: "error", message: "The vendor's invoice number is required.", field: "number" }]);
  }
  const entered = input.lines.filter((l) => Number(l.quantity) > 0 || (l.itemCode ?? "").trim() || (l.description ?? "").trim());
  if (!entered.length) {
    return fail([{ ruleId: "INV-LINE-MIN", severity: "error", message: "Enter at least one line.", field: "lines" }]);
  }

  const po = input.poNumber?.trim() ? await tdb.one(purchaseOrders, eq(purchaseOrders.number, input.poNumber.trim().toUpperCase())) : null;
  if (input.poNumber?.trim() && !po) {
    return fail([{ ruleId: "INV-PO-UNKNOWN", severity: "error", message: `No purchase order ${input.poNumber.trim()} in this sandbox.`, field: "poNumber" }]);
  }
  const vendor = input.vendorCode?.trim()
    ? await tdb.one(vendors, eq(vendors.code, input.vendorCode.trim().toUpperCase()))
    : po
      ? await tdb.one(vendors, eq(vendors.id, po.vendorId))
      : null;
  if (!vendor) {
    return fail([{ ruleId: "INV-VENDOR-REQUIRED", severity: "error", message: "Choose the vendor, or a purchase order to take it from.", field: "vendorCode" }]);
  }

  const invoiceDate = input.invoiceDate?.trim() || CORPUS_TODAY;
  const codes = entered.map((l) => (l.itemCode ?? "").trim().toUpperCase()).filter(Boolean);
  const itemRows = codes.length ? await tdb.list(items, { where: inArray(items.code, codes) }) : [];
  const poLines = po ? await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] }) : [];

  const lines = entered.map((l, idx) => {
    const itemCode = (l.itemCode ?? "").trim().toUpperCase();
    const item = itemRows.find((i) => i.code === itemCode) ?? null;
    const poLine = item ? (poLines.find((p) => p.itemId === item.id) ?? null) : null;
    const taxCode = (l.taxCode ?? "").trim().toUpperCase() || poLine?.taxCode || item?.taxCode || "S15";
    const rate = TAX_CODES[taxCode as TaxCode]?.rate ?? 0;
    const quantity = Number(l.quantity) || 0;
    const unitPrice = Number(l.unitPrice) || 0;
    const discountPct = Number(l.discountPct) || 0;
    const m = lineMoney({ quantity, unitPrice, discountPct, taxCode: (taxCode in TAX_CODES ? taxCode : "S15") as TaxCode });
    return {
      lineNo: idx + 1, item, poLine, taxCode, taxRate: rate, quantity, unitPrice, discountPct,
      uom: (l.uom ?? "").trim().toUpperCase() || poLine?.uom || item?.uom || "EA",
      description: (l.description ?? "").trim() || item?.name || itemCode || "—",
      taxAmount: m.tax, lineTotal: m.net,
    };
  });
  const computed = totals(lines.filter((l) => l.taxCode in TAX_CODES).map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode as TaxCode })));
  const subtotal = input.subtotal ?? computed.subtotal;
  const taxTotal = input.taxTotal ?? computed.taxTotal;
  const grandTotal = input.grandTotal ?? computed.grandTotal;

  const year = invoiceDate.slice(0, 4);
  const [last] = await tdb.list(invoices, {
    where: and(eq(invoices.tenantId, session.tenant.id), sql`${invoices.internalNumber} like ${`INV-${year}-9%`}`)!,
    orderBy: [{ column: invoices.internalNumber, direction: "desc" }],
    limit: 1,
  });
  const internalNumber = `INV-${year}-${String(last ? Number(last.internalNumber.slice(-5)) + 1 : 90001).padStart(5, "0")}`;

  let inserted!: Invoice;
  let documentId = "";
  await tdb.transaction(async (tx) => {
    const [inv] = await tx.insert(invoices, {
      number, internalNumber, purchaseOrderId: po?.id ?? null, vendorId: vendor.id,
      printedVendorName: input.printedVendorName?.trim() || vendor.name,
      printedVendorTaxId: (input.printedVendorTaxId ?? "").replace(/\s+/g, "") || vendor.taxId,
      printedIban: ((input.printedIban ?? "").replace(/\s+/g, "") || vendor.iban).toUpperCase(),
      printedBankName: input.printedBankName?.trim() || vendor.bankName,
      printedPoNumber: po?.number ?? input.poNumber?.trim() ?? null,
      invoiceDate, dueDate: input.dueDate?.trim() || invoiceDate,
      currency: (input.currency ?? "").trim().toUpperCase() || po?.currency || vendor.currency,
      subtotal: subtotal.toFixed(2), taxTotal: taxTotal.toFixed(2), grandTotal: grandTotal.toFixed(2),
      // Not pending_extraction: nothing is hidden from somebody who typed it.
      status: "extracted", receivedDate: CORPUS_TODAY,
    });
    inserted = inv;
    await tx.insert(
      invoiceLines,
      lines.map((l) => ({
        invoiceId: inv.id, lineNo: l.lineNo, purchaseOrderLineId: l.poLine?.id ?? null, itemId: l.item?.id ?? null, description: l.description,
        quantity: String(l.quantity), uom: l.uom, unitPrice: l.unitPrice.toFixed(4), discountPct: l.discountPct.toFixed(2),
        taxCode: l.taxCode, taxRate: l.taxRate.toFixed(4), taxAmount: l.taxAmount.toFixed(2), lineTotal: l.lineTotal.toFixed(2),
      })),
    );
    // The invoice gets a document of its own, so the registered copy can be
    // printed like any other and the match result has somewhere to hang.
    //
    // No ground truth, deliberately: ground truth is what an extraction is
    // scored against, and these values were typed by the person who would be
    // scored. Recording your own invoice and then "extracting" it would be
    // marking your own homework.
    const [d] = await tx.insert(documents, { kind: "invoice", number, sourceId: inv.id, vendorId: vendor.id, language: "bilingual" });
    documentId = d.id;
  });

  const result = await matchStoredInvoice(session, inserted);
  const status: Invoice["status"] = result.ok ? "matched" : "exception";
  await tdb.update(invoices, { status, updatedAt: new Date() }, eq(invoices.id, inserted.id));
  // The screens and the API both read the match from the last extraction on
  // the document — the same row a re-match writes. Without it a registered
  // invoice would sit in "exception" with nothing on screen saying why.
  await tdb.insert(extractions, {
    documentId, userId: session.principal.userId, source: session.channel, fields: { entry: "1" },
    matchResult: { ok: result.ok, violations: result.violations },
  });
  if (participantPdfsEager()) await enqueue("render_document", { documentId }, { tenantId: session.tenant.id, priority: 5 });
  await audit(session, "invoice.record", "invoice", internalNumber, { lines: lines.length, po: po?.number ?? null, violations: result.violations.map((v) => v.ruleId) });
  await emitWebhook(session, "invoice.status_changed", { internalNumber, status, previousStatus: "extracted", source: "entry" });
  return { ok: true, internalNumber, status, violations: result.violations };
}
