/**
 * Document service: builds template data from rows, renders, stores.
 * Runs inside jobs (and on first download for lazily rendered kinds), so it
 * uses the raw client scoped by the document's own tenant id rather than a
 * request principal.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { Document } from "@/db/schema";
import { blobStore, documentBlobKey } from "../blob";
import { renderHtmlToPdf } from "./renderer";
import { renderPurchaseOrderHtml } from "./templates/purchase-order";
import { renderDeliveryNoteHtml, renderInvoiceHtml, renderQuoteHtml, renderReceiptHtml, renderVendorComplianceHtml, type VendorParty } from "./templates/vendor-documents";
import { renderGrnHtml, renderRfqHtml } from "./templates/internal-documents";
import { ensureSharedTenant } from "../corpus/persist";

export function documentFilename(number: string, vendorName: string, ext = "pdf"): string {
  const slug = vendorName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase()
    .slice(0, 40)
    .replace(/-+$/, "");
  return `${number.replace(/[^\w.-]+/g, "-")}_${slug || "VENDOR"}.${ext}`;
}

/** Document kinds rendered eagerly at provisioning time. Vendor compliance documents render on first download. */
export const EAGER_KINDS = new Set<Document["kind"]>(["rfq", "quote", "purchase_order", "delivery_note", "grn", "invoice", "receipt"]);

async function vendorParty(vendorId: string | null, fallback?: Partial<VendorParty>): Promise<VendorParty> {
  const [v] = vendorId ? await db.select().from(schema.vendors).where(eq(schema.vendors.id, vendorId)) : [];
  if (!v) {
    return {
      code: null, name: fallback?.name ?? "Unknown vendor", nameAr: fallback?.nameAr ?? null, addressLine: fallback?.addressLine ?? "", city: fallback?.city ?? "", country: fallback?.country ?? "",
      taxId: fallback?.taxId ?? "", crNumber: fallback?.crNumber ?? "", iban: fallback?.iban ?? "", bankName: fallback?.bankName ?? "", swift: null, contactName: null, email: null, phone: null,
    };
  }
  return { code: v.code, name: v.name, nameAr: v.nameAr, addressLine: v.addressLine, city: v.city, country: v.country, taxId: v.taxId, crNumber: v.crNumber, iban: v.iban, bankName: v.bankName, swift: v.swift, contactName: v.contactName, email: v.email, phone: v.phone };
}

async function itemsById(ids: (string | null)[]) {
  const clean = [...new Set(ids.filter(Boolean) as string[])];
  const rows = clean.length ? await db.select().from(schema.items).where(inArray(schema.items.id, clean)) : [];
  return new Map(rows.map((i) => [i.id, i]));
}

async function employeesById(ids: (string | null)[]) {
  const clean = [...new Set(ids.filter(Boolean) as string[])];
  const rows = clean.length ? await db.select().from(schema.employees).where(inArray(schema.employees.id, clean)) : [];
  return new Map(rows.map((e) => [e.id, e]));
}

export async function loadPurchaseOrderTemplateData(purchaseOrderId: string, tenantIds: string[]) {
  const [po] = await db.select().from(schema.purchaseOrders).where(and(eq(schema.purchaseOrders.id, purchaseOrderId), inArray(schema.purchaseOrders.tenantId, tenantIds)));
  if (!po) throw new Error(`Purchase order ${purchaseOrderId} not found`);
  const vendor = await vendorParty(po.vendorId);
  const lines = await db.select().from(schema.purchaseOrderLines).where(eq(schema.purchaseOrderLines.purchaseOrderId, po.id)).orderBy(asc(schema.purchaseOrderLines.lineNo));
  const items = await itemsById(lines.map((l) => l.itemId));
  const emps = await employeesById([po.buyerId, po.requesterId, po.approverId]);
  const [cc] = po.costCenterId ? await db.select().from(schema.costCenters).where(eq(schema.costCenters.id, po.costCenterId)) : [];
  const [dl] = po.deliveryLocationId ? await db.select().from(schema.deliveryLocations).where(eq(schema.deliveryLocations.id, po.deliveryLocationId)) : [];
  const buyer = po.buyerId ? emps.get(po.buyerId) : null;
  return {
    number: po.number, orderDate: po.orderDate, expectedDeliveryDate: po.expectedDeliveryDate, currency: po.currency, paymentTermsDays: po.paymentTermsDays, status: po.status, notes: po.notes,
    subtotal: po.subtotal, taxTotal: po.taxTotal, grandTotal: po.grandTotal,
    vendor: { code: vendor.code ?? "", name: vendor.name, nameAr: vendor.nameAr, addressLine: vendor.addressLine, city: vendor.city, country: vendor.country, taxId: vendor.taxId, crNumber: vendor.crNumber, iban: vendor.iban, bankName: vendor.bankName, contactName: vendor.contactName ?? "", email: vendor.email ?? "", phone: vendor.phone ?? "" },
    buyer: buyer ? { name: buyer.name, email: buyer.email } : null,
    requester: po.requesterId && emps.get(po.requesterId) ? { name: emps.get(po.requesterId)!.name } : null,
    approver: po.approverId && emps.get(po.approverId) ? { name: emps.get(po.approverId)!.name } : null,
    costCenter: cc ? { code: cc.code, name: cc.name } : null,
    deliveryLocation: dl ? { code: dl.code, name: dl.name, addressLine: dl.addressLine, city: dl.city } : null,
    lines: lines.map((l) => ({ lineNo: l.lineNo, itemCode: items.get(l.itemId ?? "")?.code ?? null, description: l.description, descriptionAr: items.get(l.itemId ?? "")?.nameAr ?? null, quantity: l.quantity, uom: l.uom, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode, taxAmount: l.taxAmount, lineTotal: l.lineTotal })),
  };
}

async function htmlFor(doc: Document): Promise<{ html: string; vendorName: string }> {
  const shared = await ensureSharedTenant();
  const tenantIds = [doc.tenantId, shared];
  switch (doc.kind) {
    case "purchase_order": {
      const d = await loadPurchaseOrderTemplateData(doc.sourceId, tenantIds);
      return { html: renderPurchaseOrderHtml(d), vendorName: d.vendor.name };
    }
    case "rfq": {
      const [rfq] = await db.select().from(schema.rfqs).where(eq(schema.rfqs.id, doc.sourceId));
      if (!rfq) throw new Error("RFQ not found");
      const lines = await db.select().from(schema.rfqLines).where(eq(schema.rfqLines.rfqId, rfq.id)).orderBy(asc(schema.rfqLines.lineNo));
      const items = await itemsById(lines.map((l) => l.itemId));
      const emps = await employeesById([rfq.buyerId, rfq.requesterId]);
      const [cc] = rfq.costCenterId ? await db.select().from(schema.costCenters).where(eq(schema.costCenters.id, rfq.costCenterId)) : [];
      const buyer = rfq.buyerId ? emps.get(rfq.buyerId) : null;
      return {
        html: renderRfqHtml({
          number: rfq.number, issueDate: rfq.issueDate, dueDate: rfq.dueDate, notes: rfq.notes,
          buyer: buyer ? { name: buyer.name, email: buyer.email } : null,
          requester: rfq.requesterId && emps.get(rfq.requesterId) ? { name: emps.get(rfq.requesterId)!.name } : null,
          costCenter: cc ? { code: cc.code, name: cc.name } : null,
          lines: lines.map((l) => ({ lineNo: l.lineNo, itemCode: items.get(l.itemId ?? "")?.code ?? null, description: l.description, descriptionAr: items.get(l.itemId ?? "")?.nameAr ?? null, quantity: l.quantity, uom: l.uom })),
        }),
        vendorName: "AL-NAHDA",
      };
    }
    case "quote": {
      const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, doc.sourceId));
      if (!q) throw new Error("Quote not found");
      const [rfq] = await db.select().from(schema.rfqs).where(eq(schema.rfqs.id, q.rfqId));
      const lines = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.quoteId, q.id)).orderBy(asc(schema.quoteLines.lineNo));
      const items = await itemsById(lines.map((l) => l.itemId));
      const vendor = await vendorParty(q.vendorId);
      return {
        html: renderQuoteHtml({
          number: q.number, rfqNumber: rfq?.number ?? "", quoteDate: q.quoteDate, validUntil: q.validUntil, currency: q.currency, paymentTermsDays: q.paymentTermsDays, leadTimeDays: q.leadTimeDays,
          subtotal: q.subtotal, taxTotal: q.taxTotal, grandTotal: q.grandTotal, vendor,
          lines: lines.map((l) => ({ lineNo: l.lineNo, itemCode: items.get(l.itemId ?? "")?.code ?? null, description: l.description, descriptionAr: items.get(l.itemId ?? "")?.nameAr ?? null, quantity: l.quantity, uom: l.uom, unitPrice: l.unitPrice, taxCode: l.taxCode, taxAmount: l.taxAmount, lineTotal: l.lineTotal })),
        }),
        vendorName: vendor.name,
      };
    }
    case "delivery_note": {
      const [dn] = await db.select().from(schema.deliveryNotes).where(eq(schema.deliveryNotes.id, doc.sourceId));
      if (!dn) throw new Error("Delivery note not found");
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, dn.purchaseOrderId));
      const lines = await db.select().from(schema.deliveryNoteLines).where(eq(schema.deliveryNoteLines.deliveryNoteId, dn.id)).orderBy(asc(schema.deliveryNoteLines.lineNo));
      const poLines = await db.select().from(schema.purchaseOrderLines).where(eq(schema.purchaseOrderLines.purchaseOrderId, dn.purchaseOrderId));
      const items = await itemsById(lines.map((l) => l.itemId));
      const vendor = await vendorParty(dn.vendorId);
      const [dl] = dn.deliveryLocationId ? await db.select().from(schema.deliveryLocations).where(eq(schema.deliveryLocations.id, dn.deliveryLocationId)) : [];
      return {
        html: renderDeliveryNoteHtml({
          number: dn.number, poNumber: po?.number ?? "", deliveryDate: dn.deliveryDate, carrier: dn.carrier, vehicle: dn.vehicle, packages: dn.packages, vendor,
          deliverTo: dl ? { name: dl.name, addressLine: dl.addressLine, city: dl.city } : null,
          lines: lines.map((l) => ({ lineNo: l.lineNo, poLineNo: poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? null, itemCode: items.get(l.itemId ?? "")?.code ?? null, description: l.description, descriptionAr: items.get(l.itemId ?? "")?.nameAr ?? null, quantity: l.quantity, uom: l.uom })),
        }),
        vendorName: vendor.name,
      };
    }
    case "grn": {
      const [g] = await db.select().from(schema.grns).where(eq(schema.grns.id, doc.sourceId));
      if (!g) throw new Error("GRN not found");
      const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, g.purchaseOrderId));
      const [dn] = g.deliveryNoteId ? await db.select().from(schema.deliveryNotes).where(eq(schema.deliveryNotes.id, g.deliveryNoteId)) : [];
      const lines = await db.select().from(schema.grnLines).where(eq(schema.grnLines.grnId, g.id)).orderBy(asc(schema.grnLines.lineNo));
      const poLines = await db.select().from(schema.purchaseOrderLines).where(eq(schema.purchaseOrderLines.purchaseOrderId, g.purchaseOrderId));
      const items = await itemsById(lines.map((l) => l.itemId));
      const vendor = await vendorParty(g.vendorId);
      const [dl] = g.deliveryLocationId ? await db.select().from(schema.deliveryLocations).where(eq(schema.deliveryLocations.id, g.deliveryLocationId)) : [];
      const emps = await employeesById([g.receivedById]);
      return {
        html: renderGrnHtml({
          number: g.number, poNumber: po?.number ?? "", deliveryNoteNumber: dn?.number ?? null, receivedDate: g.receivedDate, vendorName: vendor.name, vendorCode: vendor.code ?? "", notes: g.notes,
          location: dl ? { code: dl.code, name: dl.name } : null,
          receivedBy: g.receivedById && emps.get(g.receivedById) ? { name: emps.get(g.receivedById)!.name } : null,
          lines: lines.map((l) => ({ lineNo: l.lineNo, poLineNo: poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? null, itemCode: items.get(l.itemId ?? "")?.code ?? null, description: l.description, descriptionAr: items.get(l.itemId ?? "")?.nameAr ?? null, quantityReceived: l.quantityReceived, quantityAccepted: l.quantityAccepted, quantityRejected: l.quantityRejected, uom: l.uom, rejectionReason: l.rejectionReason })),
        }),
        vendorName: vendor.name,
      };
    }
    case "invoice": {
      const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, doc.sourceId));
      if (!inv) throw new Error("Invoice not found");
      const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id)).orderBy(asc(schema.invoiceLines.lineNo));
      const items = await itemsById(lines.map((l) => l.itemId));
      // The invoice prints what the vendor printed, which may differ from the master (bank change, ghost vendor).
      const base = await vendorParty(inv.vendorId, { name: inv.printedVendorName, taxId: inv.printedVendorTaxId, iban: inv.printedIban, bankName: inv.printedBankName });
      // A ghost vendor (not in master) keeps its printed identity in the seeded defect details.
      const defects = await db.select().from(schema.seededDefects).where(and(eq(schema.seededDefects.documentId, doc.id), eq(schema.seededDefects.defectType, "vendor_not_in_master")));
      const ghost = (defects[0]?.details as { ghost?: Partial<VendorParty> } | undefined)?.ghost ?? {};
      const vendor: VendorParty = { ...base, name: inv.printedVendorName, taxId: inv.printedVendorTaxId, ...ghost };
      return {
        html: renderInvoiceHtml({
          number: inv.number, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, poNumber: inv.printedPoNumber, currency: inv.currency,
          subtotal: inv.subtotal, taxTotal: inv.taxTotal, grandTotal: inv.grandTotal, vendor, printedIban: inv.printedIban, printedBankName: inv.printedBankName,
          lines: lines.map((l) => ({ lineNo: l.lineNo, itemCode: items.get(l.itemId ?? "")?.code ?? null, description: l.description, descriptionAr: items.get(l.itemId ?? "")?.nameAr ?? null, quantity: l.quantity, uom: l.uom, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate, taxAmount: l.taxAmount, lineTotal: l.lineTotal })),
        }),
        vendorName: inv.printedVendorName,
      };
    }
    case "receipt": {
      const [rc] = await db.select().from(schema.receipts).where(eq(schema.receipts.id, doc.sourceId));
      if (!rc) throw new Error("Receipt not found");
      const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.id, rc.paymentId));
      const [inv] = pay ? await db.select().from(schema.invoices).where(eq(schema.invoices.id, pay.invoiceId)) : [];
      const vendor = await vendorParty(rc.vendorId);
      return {
        html: renderReceiptHtml({ number: rc.number, receiptDate: rc.receiptDate, amount: rc.amount, currency: rc.currency, invoiceNumber: inv?.number ?? "", paymentReference: pay?.reference ?? "", method: pay?.method ?? "bank_transfer", vendor }),
        vendorName: vendor.name,
      };
    }
    case "vendor_licence":
    case "vendor_tax_card":
    case "vendor_bank_letter":
    case "vendor_trade_licence": {
      const [vd] = await db.select().from(schema.vendorDocuments).where(eq(schema.vendorDocuments.id, doc.sourceId));
      if (!vd) throw new Error("Vendor document not found");
      const vendor = await vendorParty(vd.vendorId);
      return { html: renderVendorComplianceHtml({ kind: vd.kind, number: vd.number, issuedDate: vd.issuedDate, expiryDate: vd.expiryDate, issuer: vd.issuer, attributes: vd.attributes, vendor }), vendorName: vendor.name };
    }
  }
}

/** Render level-1 (native text) PDF for a document and record the file. Idempotent per (document, level). */
export async function renderDocument(documentId: string, log: (m: string) => void = () => {}, level = 1): Promise<void> {
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);
  const { html, vendorName } = await htmlFor(doc);
  const { pdf, pages } = await renderHtmlToPdf(html);
  const key = documentBlobKey(doc.tenantId, doc.id, level);
  const { size } = await blobStore().put(key, pdf, "application/pdf");
  const prefix: Partial<Record<Document["kind"], string>> = { vendor_licence: "CR", vendor_tax_card: "TAX", vendor_bank_letter: "BANK", vendor_trade_licence: "TL", quote: "QUO", delivery_note: "DN", receipt: "RCPT" };
  const filename = documentFilename(prefix[doc.kind] ? `${prefix[doc.kind]}-${doc.number}` : doc.number, vendorName);
  await db
    .insert(schema.documentFiles)
    .values({ tenantId: doc.tenantId, documentId: doc.id, level, mime: "application/pdf", pages, blobKey: key, sizeBytes: size, filename })
    .onConflictDoUpdate({
      target: [schema.documentFiles.documentId, schema.documentFiles.level],
      set: { pages, blobKey: key, sizeBytes: size, filename, renderedAt: new Date() },
    });
  log(`rendered ${doc.kind} ${doc.number} L${level} (${pages}p, ${size} bytes)`);
}

/** Render synchronously if the file does not exist yet (used for lazily rendered kinds on first download). */
export async function ensureRendered(documentId: string, level = 1) {
  const [existing] = await db.select().from(schema.documentFiles).where(and(eq(schema.documentFiles.documentId, documentId), eq(schema.documentFiles.level, level)));
  if (existing) return existing;
  await renderDocument(documentId, () => {}, level);
  const [file] = await db.select().from(schema.documentFiles).where(and(eq(schema.documentFiles.documentId, documentId), eq(schema.documentFiles.level, level)));
  return file;
}
