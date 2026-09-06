/**
 * JSON shapes for the REST API.
 *
 * The invoice serialiser enforces the same rule as the UI: while an invoice is
 * pending extraction, its printed values are hidden. Otherwise a bot could skip
 * document understanding entirely by reading the answer from the API.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { LabSession } from "@/lib/auth/server";
import { isStaff } from "@/lib/identity";
import {
  deliveryNoteLines, documentFiles, documents, employees, extractions, grnLines, grns, invoiceLines, invoices, items,
  purchaseOrderLines, purchaseOrders, quoteLines, quotes, receipts, rfqLines, seededDefects, vendorDocuments, vendors,
  type DeliveryNote, type Grn, type Invoice, type Item, type Payment, type PurchaseOrder, type Rfq, type Vendor,
} from "@/db/schema";

export const num = (v: string | null) => (v === null ? null : Number(v));

export function serialiseVendor(v: Vendor, shared: boolean) {
  return {
    code: v.code, name: v.name, nameAr: v.nameAr, legalForm: v.legalForm, category: v.category,
    crNumber: v.crNumber, crExpiry: v.crExpiry, taxId: v.taxId, taxCertExpiry: v.taxCertExpiry,
    iban: v.iban, bankName: v.bankName, swift: v.swift, currency: v.currency, paymentTermsDays: v.paymentTermsDays,
    contactName: v.contactName, email: v.email, phone: v.phone, addressLine: v.addressLine, city: v.city, country: v.country,
    rating: v.rating, blacklisted: v.blacklisted, status: v.status, readOnly: shared,
  };
}

export function serialiseItem(i: Item, shared: boolean) {
  return { code: i.code, name: i.name, nameAr: i.nameAr, category: i.category, uom: i.uom, taxCode: i.taxCode, unitPrice: num(i.unitPrice), currency: i.currency, active: i.active, readOnly: shared };
}

export async function serialisePurchaseOrder(session: LabSession, po: PurchaseOrder, withLines = true) {
  const tdb = session.tdb;
  const [vendor] = await tdb.list(vendors, { where: eq(vendors.id, po.vendorId), limit: 1 });
  const empIds = [po.buyerId, po.requesterId, po.approverId].filter(Boolean) as string[];
  const emps = empIds.length ? await tdb.list(employees, { where: inArray(employees.id, empIds) }) : [];
  const lines = withLines ? await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] }) : [];
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const its = itemIds.length ? await tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const doc = (await tdb.list(documents, { where: and(eq(documents.kind, "purchase_order"), eq(documents.sourceId, po.id))!, limit: 1 }))[0];
  return {
    number: po.number, status: po.status, vendorCode: vendor?.code ?? null, vendorName: vendor?.name ?? null,
    orderDate: po.orderDate, expectedDeliveryDate: po.expectedDeliveryDate, currency: po.currency, paymentTermsDays: po.paymentTermsDays,
    buyer: emps.find((e) => e.id === po.buyerId)?.code ?? null,
    requester: emps.find((e) => e.id === po.requesterId)?.code ?? null,
    approver: emps.find((e) => e.id === po.approverId)?.code ?? null,
    subtotal: num(po.subtotal), taxTotal: num(po.taxTotal), grandTotal: num(po.grandTotal), notes: po.notes, historical: po.historical,
    documentId: doc?.id ?? null,
    ...(withLines
      ? {
          lines: lines.map((l) => ({
            lineNo: l.lineNo, itemCode: its.find((i) => i.id === l.itemId)?.code ?? null, description: l.description,
            quantity: num(l.quantity), uom: l.uom, unitPrice: num(l.unitPrice), discountPct: num(l.discountPct),
            taxCode: l.taxCode, taxAmount: num(l.taxAmount), lineTotal: num(l.lineTotal),
          })),
        }
      : {}),
  };
}

export async function serialiseRfq(session: LabSession, rfq: Rfq) {
  const tdb = session.tdb;
  const lines = await tdb.list(rfqLines, { where: eq(rfqLines.rfqId, rfq.id), orderBy: [{ column: rfqLines.lineNo }] });
  const qs = await tdb.list(quotes, { where: eq(quotes.rfqId, rfq.id), orderBy: [{ column: quotes.grandTotal }] });
  const vs = qs.length ? await tdb.list(vendors, { where: inArray(vendors.id, qs.map((q) => q.vendorId)) }) : [];
  const qLines = qs.length ? await tdb.list(quoteLines, { where: inArray(quoteLines.quoteId, qs.map((q) => q.id)) }) : [];
  const qDocs = qs.length ? await tdb.list(documents, { where: and(eq(documents.kind, "quote"), inArray(documents.sourceId, qs.map((q) => q.id)))! }) : [];
  const itemIds = [...lines.map((l) => l.itemId), ...qLines.map((l) => l.itemId)].filter(Boolean) as string[];
  const its = itemIds.length ? await tdb.list(items, { where: inArray(items.id, [...new Set(itemIds)]) }) : [];
  const code = (id: string | null) => its.find((i) => i.id === id)?.code ?? null;
  const [po] = rfq.purchaseOrderId ? await tdb.list(purchaseOrders, { where: eq(purchaseOrders.id, rfq.purchaseOrderId), limit: 1 }) : [];
  return {
    number: rfq.number, status: rfq.status, issueDate: rfq.issueDate, dueDate: rfq.dueDate, notes: rfq.notes,
    purchaseOrderNumber: po?.number ?? null,
    lines: lines.map((l) => ({ lineNo: l.lineNo, itemCode: code(l.itemId), description: l.description, quantity: num(l.quantity), uom: l.uom })),
    quotes: qs.map((q) => ({
      id: q.id, number: q.number, vendorCode: vs.find((v) => v.id === q.vendorId)?.code ?? null, status: q.status,
      quoteDate: q.quoteDate, validUntil: q.validUntil, leadTimeDays: q.leadTimeDays, currency: q.currency,
      subtotal: num(q.subtotal), taxTotal: num(q.taxTotal), grandTotal: num(q.grandTotal),
      documentId: qDocs.find((d) => d.sourceId === q.id)?.id ?? null,
      lines: qLines.filter((l) => l.quoteId === q.id).sort((a, b) => a.lineNo - b.lineNo).map((l) => ({ lineNo: l.lineNo, itemCode: code(l.itemId), description: l.description, quantity: num(l.quantity), uom: l.uom, unitPrice: num(l.unitPrice), taxCode: l.taxCode, lineTotal: num(l.lineTotal) })),
    })),
  };
}

export async function serialiseDeliveryNote(session: LabSession, dn: DeliveryNote) {
  const tdb = session.tdb;
  const lines = await tdb.list(deliveryNoteLines, { where: eq(deliveryNoteLines.deliveryNoteId, dn.id), orderBy: [{ column: deliveryNoteLines.lineNo }] });
  const poLines = await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, dn.purchaseOrderId) });
  const [po] = await tdb.list(purchaseOrders, { where: eq(purchaseOrders.id, dn.purchaseOrderId), limit: 1 });
  const [vendor] = await tdb.list(vendors, { where: eq(vendors.id, dn.vendorId), limit: 1 });
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const its = itemIds.length ? await tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const doc = (await tdb.list(documents, { where: and(eq(documents.kind, "delivery_note"), eq(documents.sourceId, dn.id))!, limit: 1 }))[0];
  const [grn] = await tdb.list(grns, { where: eq(grns.deliveryNoteId, dn.id), limit: 1 });
  return {
    id: dn.id, number: dn.number, status: dn.status, purchaseOrderNumber: po?.number ?? null, vendorCode: vendor?.code ?? null,
    deliveryDate: dn.deliveryDate, carrier: dn.carrier, vehicle: dn.vehicle, packages: dn.packages,
    grnNumber: grn?.number ?? null, documentId: doc?.id ?? null,
    lines: lines.map((l) => ({
      lineNo: l.lineNo, poLineNo: poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? null,
      itemCode: its.find((i) => i.id === l.itemId)?.code ?? null, description: l.description, quantity: num(l.quantity), uom: l.uom,
    })),
  };
}

export async function serialiseGrn(session: LabSession, g: Grn) {
  const tdb = session.tdb;
  const lines = await tdb.list(grnLines, { where: eq(grnLines.grnId, g.id), orderBy: [{ column: grnLines.lineNo }] });
  const poLines = await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, g.purchaseOrderId) });
  const [po] = await tdb.list(purchaseOrders, { where: eq(purchaseOrders.id, g.purchaseOrderId), limit: 1 });
  const [vendor] = await tdb.list(vendors, { where: eq(vendors.id, g.vendorId), limit: 1 });
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const its = itemIds.length ? await tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const doc = (await tdb.list(documents, { where: and(eq(documents.kind, "grn"), eq(documents.sourceId, g.id))!, limit: 1 }))[0];
  return {
    number: g.number, status: g.status, purchaseOrderNumber: po?.number ?? null, vendorCode: vendor?.code ?? null,
    receivedDate: g.receivedDate, notes: g.notes, documentId: doc?.id ?? null,
    lines: lines.map((l) => ({
      lineNo: l.lineNo, poLineNo: poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? null,
      itemCode: its.find((i) => i.id === l.itemId)?.code ?? null, description: l.description,
      quantityReceived: num(l.quantityReceived), quantityAccepted: num(l.quantityAccepted), quantityRejected: num(l.quantityRejected),
      uom: l.uom, rejectionReason: l.rejectionReason,
    })),
  };
}

export async function serialisePayment(session: LabSession, p: Payment) {
  const tdb = session.tdb;
  const [inv] = await tdb.list(invoices, { where: eq(invoices.id, p.invoiceId), limit: 1 });
  const [vendor] = p.vendorId ? await tdb.list(vendors, { where: eq(vendors.id, p.vendorId), limit: 1 }) : [];
  const [rc] = await tdb.list(receipts, { where: eq(receipts.paymentId, p.id), limit: 1 });
  const doc = rc ? (await tdb.list(documents, { where: and(eq(documents.kind, "receipt"), eq(documents.sourceId, rc.id))!, limit: 1 }))[0] : undefined;
  return {
    number: p.number, paidDate: p.paidDate, amount: num(p.amount), currency: p.currency, method: p.method, reference: p.reference,
    ibanPaidTo: p.ibanPaidTo, invoiceInternalNumber: inv?.internalNumber ?? null, vendorCode: vendor?.code ?? null,
    receipt: rc ? { number: rc.number, receiptDate: rc.receiptDate, amount: num(rc.amount), documentId: doc?.id ?? null } : null,
  };
}

/**
 * Invoice JSON. While the invoice is pending extraction only its envelope is
 * returned; after extraction the student sees the values they submitted, and
 * staff always see the stored document.
 */
export async function serialiseInvoice(session: LabSession, inv: Invoice, opts: { withLines?: boolean } = {}) {
  const tdb = session.tdb;
  const staff = isStaff(session.principal);
  const doc = (await tdb.list(documents, { where: and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!, limit: 1 }))[0];
  const file = doc ? (await tdb.list(documentFiles, { where: and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!, limit: 1 }))[0] : undefined;
  const envelope = {
    internalNumber: inv.internalNumber,
    status: inv.status,
    receivedDate: inv.receivedDate,
    documentId: doc?.id ?? null,
    downloadUrl: doc ? `/api/documents/${doc.id}/file` : null,
    documentRendered: Boolean(file),
    uiUrl: `/invoices/${inv.internalNumber}`,
  };
  const hidden = inv.status === "pending_extraction" && !staff;
  if (hidden) return { ...envelope, hidden: true as const, note: "Values are hidden until an extraction is submitted. Download the PDF and POST /api/extractions." };

  const last = doc
    ? (await tdb.list(extractions, { where: eq(extractions.documentId, doc.id), orderBy: [{ column: extractions.submittedAt, direction: "desc" }], limit: 1 }))[0]
    : undefined;
  const lines = opts.withLines === false ? [] : await tdb.list(invoiceLines, { where: eq(invoiceLines.invoiceId, inv.id), orderBy: [{ column: invoiceLines.lineNo }] });
  const [po] = inv.purchaseOrderId ? await tdb.list(purchaseOrders, { where: eq(purchaseOrders.id, inv.purchaseOrderId), limit: 1 }) : [];
  const [vendor] = inv.vendorId ? await tdb.list(vendors, { where: eq(vendors.id, inv.vendorId), limit: 1 }) : [];
  const defects = staff && doc ? await tdb.list(seededDefects, { where: eq(seededDefects.documentId, doc.id) }) : [];
  return {
    ...envelope,
    hidden: false as const,
    source: staff ? ("stored" as const) : ("extracted" as const),
    number: inv.number,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    purchaseOrderNumber: po?.number ?? inv.printedPoNumber,
    printedPoNumber: inv.printedPoNumber,
    printedVendorName: inv.printedVendorName,
    printedVendorTaxId: inv.printedVendorTaxId,
    printedIban: inv.printedIban,
    printedBankName: inv.printedBankName,
    vendorCode: vendor?.code ?? null,
    subtotal: num(inv.subtotal),
    taxTotal: num(inv.taxTotal),
    grandTotal: num(inv.grandTotal),
    ...(opts.withLines === false
      ? {}
      : {
          lines: lines.map((l) => ({
            lineNo: l.lineNo, description: l.description, quantity: num(l.quantity), uom: l.uom, unitPrice: num(l.unitPrice),
            discountPct: num(l.discountPct), taxCode: l.taxCode, taxRate: num(l.taxRate), taxAmount: num(l.taxAmount), lineTotal: num(l.lineTotal),
          })),
        }),
    lastExtraction: last
      ? { id: last.id, submittedAt: last.submittedAt.toISOString(), score: num(last.score), matchOk: last.matchResult?.ok ?? null, violations: last.matchResult?.violations ?? [] }
      : null,
    ...(staff ? { seededDefects: defects.map((d) => ({ defectType: d.defectType, severity: d.severity, details: d.details })) } : {}),
  };
}

export async function serialiseVendorDocuments(session: LabSession, vendorId: string) {
  const tdb = session.tdb;
  const vdocs = await tdb.list(vendorDocuments, { where: eq(vendorDocuments.vendorId, vendorId) });
  if (vdocs.length === 0) return [];
  const docs = await tdb.list(documents, { where: inArray(documents.sourceId, vdocs.map((d) => d.id)) });
  return vdocs.map((d) => {
    const doc = docs.find((x) => x.sourceId === d.id);
    return { kind: d.kind, number: d.number, issuedDate: d.issuedDate, expiryDate: d.expiryDate, issuer: d.issuer, attributes: d.attributes, documentId: doc?.id ?? null, downloadUrl: doc ? `/api/documents/${doc.id}/file` : null };
  });
}
