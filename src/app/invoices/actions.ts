"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { documents, extractions, grnLines, grns, invoiceLines, invoices, payments, purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import { requireLab, audit } from "@/lib/auth/server";
import { runRules, type ValidationResult } from "@/lib/validation/engine";
import { matchRules, type MatchContext } from "@/lib/validation/matching";
import { failedState, formValues, str, type FormState } from "@/lib/forms";
import { round2 } from "@/lib/generator/money";
import { CORPUS_TODAY, addDays } from "@/lib/generator/dates";
import type { LabSession } from "@/lib/auth/server";
import { INVOICE_FORM_LINES } from "./constants";
import { EXTRACTION_HEADER_FIELDS, EXTRACTION_LINE_FIELDS, extractionToInvoice } from "./extraction";

type Inv = typeof invoices.$inferSelect;

/** Build the three-way match context for an invoice from its stored rows (after extraction) or from submitted values. */
export async function buildMatchContext(session: LabSession, inv: Inv, lines: { lineNo: number; poLineNo: number | null; itemCode: string | null; quantity: number; uom: string; unitPrice: number; discountPct: number; taxCode: string; taxRate: number; taxAmount: number; lineTotal: number }[]): Promise<MatchContext> {
  const tdb = session.tdb;
  const vendor = await tdb.one(vendors, eq(vendors.taxId, inv.printedVendorTaxId));
  const po = inv.printedPoNumber ? await tdb.one(purchaseOrders, eq(purchaseOrders.number, inv.printedPoNumber)) : null;
  const poLines = po ? await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] }) : [];
  const itemIds = poLines.map((l) => l.itemId).filter(Boolean) as string[];
  const { items } = await import("@/db/schema");
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
  const sameVendor = vendor ? await tdb.list(invoices, { where: and(eq(invoices.vendorId, vendor.id), ne(invoices.id, inv.id), sql`substr(${invoices.invoiceDate}::text, 1, 4) = ${inv.invoiceDate.slice(0, 4)}`)! }) : [];
  return {
    invoice: {
      number: inv.number, printedPoNumber: inv.printedPoNumber, printedVendorName: inv.printedVendorName, printedVendorTaxId: inv.printedVendorTaxId, printedIban: inv.printedIban,
      invoiceDate: inv.invoiceDate, currency: inv.currency, subtotal: Number(inv.subtotal), taxTotal: Number(inv.taxTotal), grandTotal: Number(inv.grandTotal), lines,
    },
    vendor: vendor ? { code: vendor.code, name: vendor.name, iban: vendor.iban, taxCertExpiry: vendor.taxCertExpiry, status: vendor.status, blacklisted: vendor.blacklisted } : null,
    po: po ? { number: po.number, currency: po.currency, vendorCode: poVendor?.code ?? "", lines: poLines.map((l) => ({ lineNo: l.lineNo, itemCode: itemRows.find((i) => i.id === l.itemId)?.code ?? "", quantity: Number(l.quantity), uom: l.uom, unitPrice: Number(l.unitPrice), discountPct: Number(l.discountPct), taxCode: l.taxCode })) } : null,
    receivedByPoLine,
    previouslyInvoicedByPoLine,
    otherInvoiceNumbers: sameVendor.map((o) => o.number),
    today: CORPUS_TODAY,
  };
}

export async function runMatch(session: LabSession, inv: Inv): Promise<ValidationResult> {
  const lines = await session.tdb.list(invoiceLines, { where: eq(invoiceLines.invoiceId, inv.id), orderBy: [{ column: invoiceLines.lineNo }] });
  const poLines = inv.purchaseOrderId ? await session.tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, inv.purchaseOrderId) }) : [];
  const { items } = await import("@/db/schema");
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const itemRows = itemIds.length ? await session.tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const ctx = await buildMatchContext(
    session,
    inv,
    lines.map((l) => ({
      lineNo: l.lineNo, poLineNo: poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? null, itemCode: itemRows.find((i) => i.id === l.itemId)?.code ?? null,
      quantity: Number(l.quantity), uom: l.uom, unitPrice: Number(l.unitPrice), discountPct: Number(l.discountPct), taxCode: l.taxCode, taxRate: Number(l.taxRate), taxAmount: Number(l.taxAmount), lineTotal: Number(l.lineTotal),
    })),
  );
  return runRules(matchRules, ctx);
}

/**
 * Student submits what they extracted from the PDF. The submission is stored
 * as an extraction (graded in P2) and the three-way match runs on the
 * submitted values, so a wrong extraction produces different findings than
 * the printed document would.
 */
export async function submitExtractionAction(internalNumber: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv || session.tdb.isReadOnlyRow(inv)) return failedState([{ ruleId: "INV-NOT-FOUND", severity: "error", message: "Invoice not found." }], values);
  if (!["pending_extraction", "extracted", "exception", "matched"].includes(inv.status)) return failedState([{ ruleId: "INV-STATE", severity: "error", message: `Invoice is ${inv.status}; extraction is closed.` }], values);

  const fields: Record<string, string> = {};
  for (const k of EXTRACTION_HEADER_FIELDS) fields[k] = str(values, k);
  for (let n = 1; n <= INVOICE_FORM_LINES; n++) for (const k of EXTRACTION_LINE_FIELDS) if (str(values, `line${n}${k}`)) fields[`line${n}${k}`] = str(values, `line${n}${k}`);
  const { asStored, lines } = extractionToInvoice(inv, fields);
  if (lines.length === 0) return failedState([{ ruleId: "INV-LINE-MIN", severity: "error", message: "Enter at least one line." }], values);
  const ctx = await buildMatchContext(session, asStored, lines);
  const result = runRules(matchRules, ctx);

  const doc = await session.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!);
  if (doc) await session.tdb.insert(extractions, { documentId: doc.id, userId: session.principal.userId, source: "ui", fields, matchResult: { ok: result.ok, violations: result.violations } });
  await session.tdb.update(invoices, { status: result.ok ? "matched" : "exception", updatedAt: new Date() }, eq(invoices.id, inv.id));
  await audit(session, "invoice.extract", "invoice", inv.internalNumber, { ok: result.ok, violations: result.violations.map((v) => v.ruleId) });
  redirect(`/invoices/${encodeURIComponent(inv.internalNumber)}?extracted=1`);
}

export async function rematchAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const internalNumber = String(formData.get("internalNumber") ?? "");
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv || session.tdb.isReadOnlyRow(inv) || inv.status === "pending_extraction") redirect(`/invoices/${encodeURIComponent(internalNumber)}`);
  const doc = await session.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!);
  const last = doc ? (await session.tdb.list(extractions, { where: and(eq(extractions.documentId, doc.id), sql`${extractions.fields} ? 'number'`)!, orderBy: [{ column: extractions.submittedAt, direction: "desc" }], limit: 1 }))[0] : null;
  let result: ValidationResult;
  if (last) {
    const { asStored, lines } = extractionToInvoice(inv, last.fields);
    result = runRules(matchRules, await buildMatchContext(session, asStored, lines));
  } else {
    result = await runMatch(session, inv);
  }
  if (doc) await session.tdb.insert(extractions, { documentId: doc.id, userId: session.principal.userId, source: "ui", fields: last ? { ...last.fields, rematch: "1" } : { rematch: "1" }, matchResult: { ok: result.ok, violations: result.violations } });
  if (["extracted", "matched", "exception"].includes(inv.status)) await session.tdb.update(invoices, { status: result.ok ? "matched" : "exception", updatedAt: new Date() }, eq(invoices.id, inv.id));
  redirect(`/invoices/${encodeURIComponent(internalNumber)}?rematched=1`);
}

export async function decideInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const internalNumber = String(formData.get("internalNumber") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv || session.tdb.isReadOnlyRow(inv)) redirect(`/invoices/${encodeURIComponent(internalNumber)}`);
  if (decision === "approve" && ["matched", "exception", "extracted"].includes(inv.status)) {
    await session.tdb.update(invoices, { status: "approved", updatedAt: new Date() }, eq(invoices.id, inv.id));
    await audit(session, "invoice.approve", "invoice", inv.internalNumber, { previousStatus: inv.status });
    redirect(`/invoices/${encodeURIComponent(internalNumber)}?approved=1`);
  }
  if (decision === "reject" && !["paid", "rejected"].includes(inv.status)) {
    await session.tdb.update(invoices, { status: "rejected", updatedAt: new Date() }, eq(invoices.id, inv.id));
    await audit(session, "invoice.reject", "invoice", inv.internalNumber, { previousStatus: inv.status });
    redirect(`/invoices/${encodeURIComponent(internalNumber)}?rejected=1`);
  }
  if (decision === "pay" && inv.status === "approved") {
    const year = CORPUS_TODAY.slice(0, 4);
    const existing = await session.tdb.list(payments, { where: and(eq(payments.tenantId, session.tenant.id), sql`${payments.number} like ${"PAY-" + year + "-9%"}`)!, orderBy: [{ column: payments.number, direction: "desc" }], limit: 1 });
    const seq = existing[0] ? Number(existing[0].number.slice(-5)) + 1 : 90001;
    await session.tdb.insert(payments, {
      number: `PAY-${year}-${String(seq).padStart(5, "0")}`, invoiceId: inv.id, vendorId: inv.vendorId, paidDate: CORPUS_TODAY, amount: inv.grandTotal, currency: inv.currency,
      method: "bank_transfer", reference: `TRF${Date.now().toString().slice(-10)}`, ibanPaidTo: inv.printedIban,
    });
    await session.tdb.update(invoices, { status: "paid", updatedAt: new Date() }, eq(invoices.id, inv.id));
    await audit(session, "invoice.pay", "invoice", inv.internalNumber, { amount: inv.grandTotal, dueDate: inv.dueDate, late: inv.dueDate < addDays(CORPUS_TODAY, 0) });
    redirect(`/invoices/${encodeURIComponent(internalNumber)}?paid=1`);
  }
  redirect(`/invoices/${encodeURIComponent(internalNumber)}`);
}
