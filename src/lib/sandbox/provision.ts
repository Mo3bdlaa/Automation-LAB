/**
 * Building the master set, and clearing a participant's work.
 *
 * The transaction set — orders, deliveries, invoices, their documents and the
 * ground truth behind them — is generated once into the shared tenant and read
 * by everyone. A participant is not given a copy of it: they work on the same
 * rows, and what they change is stored as a patch (see src/db/tenant.ts).
 *
 * So provisioning a participant has nothing to generate, and resetting them is
 * a delete of their own rows rather than a regeneration. `buildMasterSet` runs
 * from `pnpm db:seed`, not from a signup.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { Tenant, DocumentKind } from "@/db/schema";
import { clearTenantRows, ensureSharedTenant } from "../corpus/persist";
import {
  assignInvoiceRegistrations, deliveryNoteGroundTruth, generateSandbox, grnGroundTruth, invoiceGroundTruth, purchaseOrderGroundTruth, quoteGroundTruth, receiptGroundTruth, rfqGroundTruth,
  vendorDocumentGroundTruth,
  type GroundTruthField,
} from "../generator/sandbox";
import { generateVendorDocuments } from "../generator/cycle";
import { Rng } from "../generator/rng";

/** Which rule refuses an application, so a refusal can be graded against a rule ID. */
const DEFECT_RULE: Record<"expired_registration" | "expired_tax_certificate" | "duplicate_tax_id" | "blacklisted", string> = {
  expired_registration: "VEND-CR-EXP",
  expired_tax_certificate: "VEND-TAX-CERT-EXP",
  duplicate_tax_id: "VEND-DUP-TAXID",
  blacklisted: "VEND-BLACKLIST",
};

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
import type { TaxCode } from "../generator/money";
import { enqueue } from "../jobs/queue";
import { blobStore } from "../blob";
import { emitWebhook } from "../webhooks/emit";

async function setStatus(tenantId: string, patch: Partial<Pick<Tenant, "status" | "progress" | "statusMessage" | "provisionedAt">>) {
  await db.update(schema.tenants).set(patch).where(eq(schema.tenants.id, tenantId));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];


/**
 * Generate the transaction set into the shared tenant: the orders, quotations,
 * deliveries, invoices and supplier applications everyone works on, with their
 * documents, ground truth and seeded defects.
 *
 * Rendered once for every participant there will ever be, which is the whole
 * point: this used to run per signup, 374 documents at a time.
 */
export async function buildMasterSet(log: (m: string) => void = () => {}): Promise<void> {
  const tenantId = await ensureSharedTenant();
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw new Error("Shared tenant not found");
  const shared = tenantId;
  // A rebuild is a new build of the data everyone works on. Bumping here rather
  // than at the end means a half-finished rebuild is still a distinct version,
  // never silently the previous one.
  const datasetVersion = tenant.datasetVersion + 1;
  await db.update(schema.tenants).set({ datasetVersion }).where(eq(schema.tenants.id, tenantId));
  await setStatus(tenantId, { status: "provisioning", progress: 5, statusMessage: "Loading master data" });

  const vendors = await db.select().from(schema.vendors).where(eq(schema.vendors.tenantId, shared));
  const items = await db.select().from(schema.items).where(eq(schema.items.tenantId, shared));
  const employees = await db.select().from(schema.employees).where(eq(schema.employees.tenantId, shared));
  const costCenters = await db.select().from(schema.costCenters).where(eq(schema.costCenters.tenantId, shared));
  const deliveryLocations = await db.select().from(schema.deliveryLocations).where(eq(schema.deliveryLocations.tenantId, shared));
  const glAccounts = await db.select().from(schema.glAccounts).where(eq(schema.glAccounts.tenantId, shared));
  if (vendors.length === 0) throw new Error("Shared corpus is empty. Run `pnpm db:seed` first.");

  const ctx = {
    vendors: vendors.map((v) => ({ ...v, nameAr: v.nameAr ?? "", status: v.status })),
    items: items.map((i) => ({ ...i, nameAr: i.nameAr ?? "", unitPrice: Number(i.unitPrice), taxCode: i.taxCode as TaxCode, priceHistory: [] })),
    employees: employees.map((e) => ({
      code: e.code, name: e.name, email: e.email, role: e.role,
      approvalLimit: e.approvalLimit == null ? null : Number(e.approvalLimit),
      costCenterCode: costCenters.find((c) => c.id === e.costCenterId)?.code ?? "CC-100",
    })),
    deliveryLocations: deliveryLocations.map((d) => d.code),
  };
  const set = generateSandbox(tenant.seed, ctx);
  const registrations = assignInvoiceRegistrations(set);
  log(`generated ${set.cycles.length} purchase orders with their cycle and ${set.vendorApplications.length} supplier applications for tenant ${tenant.slug}`);
  await setStatus(tenantId, { progress: 25, statusMessage: "Writing documents" });

  const vendorByCode = new Map(vendors.map((v) => [v.code, v]));
  const itemByCode = new Map(items.map((i) => [i.code, i.id]));
  const empByCode = new Map(employees.map((e) => [e.code, e.id]));
  const ccByCode = new Map(costCenters.map((c) => [c.code, c.id]));
  const dlByCode = new Map(deliveryLocations.map((d) => [d.code, d.id]));
  const glByCode = new Map(glAccounts.map((g) => [g.code, g.id]));

  const eagerDocumentIds: string[] = [];

  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const itemNameArByCode = new Map(items.filter((i) => i.nameAr).map((i) => [i.code, i.nameAr!]));

  // A vendor prints its own paperwork in its own script; anything Al-Nahda
  // issues (RFQ, purchase order, goods receipt) stays bilingual.
  const VENDOR_ISSUED: ReadonlySet<DocumentKind> = new Set(["quote", "delivery_note", "invoice", "receipt", "vendor_licence", "vendor_tax_card", "vendor_bank_letter", "vendor_trade_licence"]);

  /**
   * A document that prints a name or a description in both scripts is correct
   * whichever one the student read, so both go into the ground truth.
   */
  const withAlternates = (gt: GroundTruthField[], vendorId: string | null, lines?: { itemCode?: string | null }[]): GroundTruthField[] => {
    const v = vendorId ? vendorById.get(vendorId) : null;
    const byField = new Map<string, string[]>();
    if (v?.nameAr) byField.set("vendor.name", [v.nameAr]);
    lines?.forEach((l, i) => {
      const ar = l.itemCode ? itemNameArByCode.get(l.itemCode) : null;
      if (ar) byField.set(`lines[${i}].description`, [ar]);
    });
    return gt.map((g) => (byField.has(g.field) ? { ...g, alternates: byField.get(g.field) } : g));
  };

  const addDocument: AddDocument = async (tx, kind, number, sourceId, vendorId, rawGt, opts = {}) => {
    const defects = opts.defects ?? [];
    const language = (VENDOR_ISSUED.has(kind) && vendorId ? vendorById.get(vendorId)?.documentLanguage : null) ?? "bilingual";
    const gt = withAlternates(rawGt, vendorId, opts.lines);
    const [doc] = await tx.insert(schema.documents).values({ tenantId, kind, number, sourceId, vendorId, language }).returning({ id: schema.documents.id });
    if (gt.length) await tx.insert(schema.groundTruth).values(gt.map((g) => ({ tenantId, documentId: doc.id, field: g.field, value: g.value, alternates: g.alternates ?? [] })));
    if (defects.length) await tx.insert(schema.seededDefects).values(defects.map((d) => ({ tenantId, documentId: doc.id, defectType: d.type, severity: d.severity, details: d.details })));
    eagerDocumentIds.push(doc.id);
    return doc.id;
  };

  await db.transaction(async (tx) => {
    // Supplier applications, pending, with the certificates that came with
    // them. They sit in the master set like everything else: approving or
    // refusing one is recorded as that participant's patch, so everyone gets
    // the same queue and nobody's decision is visible to anyone else.
    for (const [i, application] of set.vendorApplications.entries()) {
      const v = application.vendor;
      const [row] = await tx
        .insert(schema.vendors)
        .values({
          tenantId, code: v.code, name: v.name, nameAr: v.nameAr, documentLanguage: v.documentLanguage, legalForm: v.legalForm, category: v.category,
          crNumber: v.crNumber, crExpiry: v.crExpiry, taxId: v.taxId, taxCertExpiry: v.taxCertExpiry, iban: v.iban, bankName: v.bankName, swift: v.swift,
          currency: v.currency, paymentTermsDays: v.paymentTermsDays, contactName: v.contactName, email: v.email, phone: v.phone,
          addressLine: v.addressLine, city: v.city, country: v.country, rating: v.rating, blacklisted: v.blacklisted, status: "pending",
        })
        .returning({ id: schema.vendors.id });
      const docs = generateVendorDocuments(new Rng(tenant.seed).fork(`application-docs:${i}`), v);
      const vdRows = await tx
        .insert(schema.vendorDocuments)
        .values(docs.map((d) => ({ tenantId, vendorId: row.id, kind: d.kind, number: d.number, issuedDate: d.issuedDate, expiryDate: d.expiryDate, issuer: d.issuer, attributes: d.attributes })))
        .returning({ id: schema.vendorDocuments.id, kind: schema.vendorDocuments.kind });
      const docRows = await tx
        .insert(schema.documents)
        .values(vdRows.map((r) => ({ tenantId, kind: r.kind, number: docs.find((d) => d.kind === r.kind)!.number, sourceId: r.id, vendorId: row.id, language: v.documentLanguage })))
        .returning({ id: schema.documents.id, kind: schema.documents.kind });
      const gt = docRows.flatMap((dr) =>
        vendorDocumentGroundTruth(v, docs.find((d) => d.kind === dr.kind)!).map((g) => ({
          tenantId, documentId: dr.id, field: g.field, value: g.value, alternates: g.field === "vendor.name" && v.nameAr ? [v.nameAr] : [],
        })),
      );
      for (const batch of chunks(gt, 500)) await tx.insert(schema.groundTruth).values(batch);
      // The reason an application should be refused is recorded like any other
      // seeded defect, so grading can tell a caught refusal from a lucky one.
      if (application.defect) {
        const licence = docRows.find((d) => d.kind === "vendor_licence");
        if (licence) {
          await tx.insert(schema.seededDefects).values({
            tenantId, documentId: licence.id, defectType: application.defect,
            severity: application.defect === "duplicate_tax_id" || application.defect === "blacklisted" ? "critical" : "error",
            details: { vendorCode: v.code, ruleId: DEFECT_RULE[application.defect] },
          });
        }
      }
    }

    for (const cycle of set.cycles) {
      const po = cycle.po;
      const vendor = vendorByCode.get(po.vendorCode)!;
      const [poRow] = await tx
        .insert(schema.purchaseOrders)
        .values({
          tenantId, number: po.number, vendorId: vendor.id,
          buyerId: empByCode.get(po.buyerCode) ?? null, requesterId: empByCode.get(po.requesterCode) ?? null, approverId: empByCode.get(po.approverCode) ?? null,
          costCenterId: ccByCode.get(po.costCenterCode) ?? null, deliveryLocationId: dlByCode.get(po.deliveryLocationCode) ?? null,
          currency: po.currency, orderDate: po.orderDate, expectedDeliveryDate: po.expectedDeliveryDate, paymentTermsDays: po.paymentTermsDays, status: po.status,
          subtotal: po.subtotal.toFixed(2), taxTotal: po.taxTotal.toFixed(2), grandTotal: po.grandTotal.toFixed(2), notes: po.notes, historical: false,
        })
        .returning({ id: schema.purchaseOrders.id });
      const poLineRows = await tx
        .insert(schema.purchaseOrderLines)
        .values(
          po.lines.map((l) => ({
            tenantId, purchaseOrderId: poRow.id, lineNo: l.lineNo, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantity: String(l.quantity), uom: l.uom,
            unitPrice: l.unitPrice.toFixed(4), discountPct: l.discountPct.toFixed(2), taxCode: l.taxCode, taxAmount: l.taxAmount.toFixed(2), lineTotal: l.lineTotal.toFixed(2), glAccountId: glByCode.get(l.glCode) ?? null,
          })),
        )
        .returning({ id: schema.purchaseOrderLines.id, lineNo: schema.purchaseOrderLines.lineNo });
      const poLineId = new Map(poLineRows.map((r) => [r.lineNo, r.id]));
      if (po.status !== "draft") await addDocument(tx, "purchase_order", po.number, poRow.id, vendor.id, purchaseOrderGroundTruth(po, vendor), { lines: po.lines });

      // RFQ + quotes
      if (cycle.rfq) {
        const rfq = cycle.rfq;
        const [rfqRow] = await tx
          .insert(schema.rfqs)
          .values({ tenantId, number: rfq.number, requesterId: empByCode.get(rfq.requesterCode) ?? null, buyerId: empByCode.get(rfq.buyerCode) ?? null, costCenterId: ccByCode.get(rfq.costCenterCode) ?? null, issueDate: rfq.issueDate, dueDate: rfq.dueDate, status: rfq.status, purchaseOrderId: poRow.id, notes: rfq.notes })
          .returning({ id: schema.rfqs.id });
        await tx.insert(schema.rfqLines).values(rfq.lines.map((l) => ({ tenantId, rfqId: rfqRow.id, lineNo: l.lineNo, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantity: String(l.quantity), uom: l.uom })));
        await addDocument(tx, "rfq", rfq.number, rfqRow.id, null, rfqGroundTruth(rfq));
        for (const q of cycle.quotes) {
          const qv = vendorByCode.get(q.vendorCode)!;
          const [qRow] = await tx
            .insert(schema.quotes)
            .values({ tenantId, number: q.number, rfqId: rfqRow.id, vendorId: qv.id, quoteDate: q.quoteDate, validUntil: q.validUntil, currency: q.currency, paymentTermsDays: q.paymentTermsDays, leadTimeDays: q.leadTimeDays, subtotal: q.subtotal.toFixed(2), taxTotal: q.taxTotal.toFixed(2), grandTotal: q.grandTotal.toFixed(2), status: q.status })
            .returning({ id: schema.quotes.id });
          await tx.insert(schema.quoteLines).values(q.lines.map((l) => ({ tenantId, quoteId: qRow.id, lineNo: l.lineNo, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantity: String(l.quantity), uom: l.uom, unitPrice: l.unitPrice.toFixed(4), taxCode: l.taxCode, taxAmount: l.taxAmount.toFixed(2), lineTotal: l.lineTotal.toFixed(2) })));
          await addDocument(tx, "quote", q.number, qRow.id, qv.id, quoteGroundTruth(q, rfq.number, qv), { lines: q.lines });
        }
      }

      // Delivery notes + GRNs
      const dnIdByNumber = new Map<string, string>();
      for (const dn of cycle.deliveryNotes) {
        const [dnRow] = await tx
          .insert(schema.deliveryNotes)
          .values({ tenantId, number: dn.number, purchaseOrderId: poRow.id, vendorId: vendor.id, deliveryDate: dn.deliveryDate, deliveryLocationId: dlByCode.get(dn.deliveryLocationCode) ?? null, carrier: dn.carrier, vehicle: dn.vehicle, packages: dn.packages, status: dn.status })
          .returning({ id: schema.deliveryNotes.id });
        dnIdByNumber.set(dn.number, dnRow.id);
        await tx.insert(schema.deliveryNoteLines).values(dn.lines.map((l) => ({ tenantId, deliveryNoteId: dnRow.id, lineNo: l.lineNo, purchaseOrderLineId: poLineId.get(l.poLineNo) ?? null, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantity: String(l.quantity), uom: l.uom })));
        await addDocument(tx, "delivery_note", dn.number, dnRow.id, vendor.id, deliveryNoteGroundTruth(dn, po.number, vendor), { lines: dn.lines });
      }
      for (const g of cycle.grns) {
        const [gRow] = await tx
          .insert(schema.grns)
          .values({ tenantId, number: g.number, purchaseOrderId: poRow.id, deliveryNoteId: dnIdByNumber.get(g.deliveryNoteNumber) ?? null, vendorId: vendor.id, receivedDate: g.receivedDate, deliveryLocationId: dlByCode.get(g.deliveryLocationCode) ?? null, receivedById: empByCode.get(g.receivedByCode) ?? null, status: g.status, notes: g.notes })
          .returning({ id: schema.grns.id });
        await tx.insert(schema.grnLines).values(g.lines.map((l) => ({ tenantId, grnId: gRow.id, lineNo: l.lineNo, purchaseOrderLineId: poLineId.get(l.poLineNo) ?? null, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantityReceived: String(l.quantityReceived), quantityAccepted: String(l.quantityAccepted), quantityRejected: String(l.quantityRejected), uom: l.uom, rejectionReason: l.rejectionReason })));
        await addDocument(tx, "grn", g.number, gRow.id, vendor.id, grnGroundTruth(g, po.number, vendor), { lines: g.lines });
      }

      // Invoices, payments, receipts
      for (const inv of cycle.invoices) {
        const invId = await insertInvoice(tx, tenantId, inv, registrations.get(inv)!, poRow.id, inv.vendorCode ? vendorByCode.get(inv.vendorCode)!.id : null, itemByCode, poLineId, addDocument);
        const pay = cycle.payments.find((p) => p.invoiceNumber === inv.number);
        if (pay) {
          const [payRow] = await tx
            .insert(schema.payments)
            .values({ tenantId, number: pay.payment.number, invoiceId: invId, vendorId: vendor.id, paidDate: pay.payment.paidDate, amount: pay.payment.amount.toFixed(2), currency: pay.payment.currency, method: pay.payment.method, reference: pay.payment.reference, ibanPaidTo: pay.payment.ibanPaidTo })
            .returning({ id: schema.payments.id });
          if (pay.receipt) {
            const [rcRow] = await tx.insert(schema.receipts).values({ tenantId, number: pay.receipt.number, paymentId: payRow.id, vendorId: vendor.id, receiptDate: pay.receipt.receiptDate, amount: pay.receipt.amount.toFixed(2), currency: pay.receipt.currency }).returning({ id: schema.receipts.id });
            await addDocument(tx, "receipt", pay.receipt.number, rcRow.id, vendor.id, receiptGroundTruth(pay.receipt, pay.payment, inv.number, vendor));
          }
        }
      }
    }
    for (const { rfq, quotes: qs } of set.openRfqs) {
      const [rfqRow] = await tx
        .insert(schema.rfqs)
        .values({ tenantId, number: rfq.number, requesterId: empByCode.get(rfq.requesterCode) ?? null, buyerId: empByCode.get(rfq.buyerCode) ?? null, costCenterId: ccByCode.get(rfq.costCenterCode) ?? null, issueDate: rfq.issueDate, dueDate: rfq.dueDate, status: rfq.status, purchaseOrderId: null, notes: rfq.notes })
        .returning({ id: schema.rfqs.id });
      await tx.insert(schema.rfqLines).values(rfq.lines.map((l) => ({ tenantId, rfqId: rfqRow.id, lineNo: l.lineNo, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantity: String(l.quantity), uom: l.uom })));
      await addDocument(tx, "rfq", rfq.number, rfqRow.id, null, rfqGroundTruth(rfq));
      for (const q of qs) {
        const qv = vendorByCode.get(q.vendorCode)!;
        const [qRow] = await tx
          .insert(schema.quotes)
          .values({ tenantId, number: q.number, rfqId: rfqRow.id, vendorId: qv.id, quoteDate: q.quoteDate, validUntil: q.validUntil, currency: q.currency, paymentTermsDays: q.paymentTermsDays, leadTimeDays: q.leadTimeDays, subtotal: q.subtotal.toFixed(2), taxTotal: q.taxTotal.toFixed(2), grandTotal: q.grandTotal.toFixed(2), status: q.status })
          .returning({ id: schema.quotes.id });
        await tx.insert(schema.quoteLines).values(q.lines.map((l) => ({ tenantId, quoteId: qRow.id, lineNo: l.lineNo, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantity: String(l.quantity), uom: l.uom, unitPrice: l.unitPrice.toFixed(4), taxCode: l.taxCode, taxAmount: l.taxAmount.toFixed(2), lineTotal: l.lineTotal.toFixed(2) })));
        await addDocument(tx, "quote", q.number, qRow.id, qv.id, quoteGroundTruth(q, rfq.number, qv), { lines: q.lines });
      }
    }
    for (const inv of set.orphanInvoices) {
      await insertInvoice(tx, tenantId, inv, registrations.get(inv)!, null, inv.vendorCode ? vendorByCode.get(inv.vendorCode)!.id : null, itemByCode, new Map(), addDocument);
    }
  });

  await setStatus(tenantId, { progress: 60, statusMessage: `Queueing ${eagerDocumentIds.length} renders` });
  for (const documentId of eagerDocumentIds) await enqueue("render_document", { documentId }, { tenantId, priority: 0 });
  await setStatus(tenantId, { status: "ready", progress: 100, statusMessage: "Ready", provisionedAt: new Date() });
  await emitWebhook({ tenant: { id: tenantId } }, "sandbox.ready", { tenantId, documents: eagerDocumentIds.length, resetCount: tenant.resetCount });
  log(`tenant ${tenant.slug} ready; ${eagerDocumentIds.length} render jobs queued`);
}

interface AddDocumentOptions {
  defects?: { type: string; severity: "warning" | "error" | "critical"; details: Record<string, unknown> }[];
  /** The document's lines, so a bilingual description can be recorded as an alternate reading. */
  lines?: { itemCode?: string | null }[];
}

type AddDocument = (tx: Tx, kind: DocumentKind, number: string, sourceId: string, vendorId: string | null, gt: GroundTruthField[], opts?: AddDocumentOptions) => Promise<string>;

async function insertInvoice(
  tx: Tx,
  tenantId: string,
  inv: import("../generator/cycle").GenInvoice,
  internalNumber: string,
  purchaseOrderId: string | null,
  vendorId: string | null,
  itemByCode: Map<string, string>,
  poLineId: Map<number, string>,
  addDocument: AddDocument,
): Promise<string> {
  const [row] = await tx
    .insert(schema.invoices)
    .values({
      tenantId, number: inv.number, internalNumber, purchaseOrderId, vendorId,
      printedVendorName: inv.printedVendorName, printedVendorTaxId: inv.printedVendorTaxId, printedIban: inv.printedIban, printedBankName: inv.printedBankName, printedPoNumber: inv.printedPoNumber,
      invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, receivedDate: inv.receivedDate, currency: inv.currency,
      subtotal: inv.subtotal.toFixed(2), taxTotal: inv.taxTotal.toFixed(2), grandTotal: inv.grandTotal.toFixed(2), status: inv.status,
    })
    .returning({ id: schema.invoices.id });
  await tx.insert(schema.invoiceLines).values(
    inv.lines.map((l) => ({
      tenantId, invoiceId: row.id, lineNo: l.lineNo, purchaseOrderLineId: l.poLineNo != null ? (poLineId.get(l.poLineNo) ?? null) : null, itemId: l.itemCode ? (itemByCode.get(l.itemCode) ?? null) : null,
      description: l.description, quantity: String(l.quantity), uom: l.uom, unitPrice: l.unitPrice.toFixed(4), discountPct: l.discountPct.toFixed(2), taxCode: l.taxCode, taxRate: l.taxRate.toFixed(4), taxAmount: l.taxAmount.toFixed(2), lineTotal: l.lineTotal.toFixed(2),
    })),
  );
  const defects = inv.defects.map((d) => ({ type: d.type, severity: d.severity, details: d.type === "vendor_not_in_master" && inv.ghostVendor ? { ...d.details, ghost: inv.ghostVendor } : d.details }));
  await addDocument(tx, "invoice", internalNumber, row.id, vendorId, invoiceGroundTruth(inv), { defects, lines: inv.lines });
  return row.id;
}

/**
 * A participant's sandbox needs nothing generated: the master set is already
 * there and already rendered. This exists so the signup path, the job handler
 * and the status screens keep their shape.
 */
export async function provisionSandbox(tenantId: string, log: (m: string) => void = () => {}): Promise<void> {
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  if (tenant.kind === "shared") return buildMasterSet(log);
  const shared = await ensureSharedTenant();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.documents)
    .where(eq(schema.documents.tenantId, shared));
  if (!n) throw new Error("The master set is empty. Run `pnpm db:seed` first.");
  await setStatus(tenantId, { status: "ready", progress: 100, statusMessage: null, provisionedAt: new Date() });
  log(`tenant ${tenant.slug} is ready against a master set of ${n} documents`);
  await emitWebhook({ tenant: { id: tenantId } }, "sandbox.ready", { tenantId, documents: n });
}

/**
 * Clear everyone's in-flight work, so the master set underneath it can be
 * rebuilt.
 *
 * Participants' goods receipts point at the master set's delivery notes, so
 * regenerating it while that work exists fails on a foreign key rather than
 * quietly leaving stale rows. Clearing first makes the consequence explicit:
 * rebuilding the documents resets what everyone is part-way through.
 *
 * What survives is what a rebuild has no business touching — accounts, API
 * tokens, and every completed run with its score and its certificate. Those
 * are statements about work already finished, and each one records the build it
 * was earned against.
 */
export async function clearAllParticipantWork(log: (m: string) => void = () => {}): Promise<void> {
  const tenants = await db.select().from(schema.tenants).where(eq(schema.tenants.kind, "student"));
  for (const t of tenants) {
    await db.delete(schema.entityOverlays).where(eq(schema.entityOverlays.tenantId, t.id));
    await db.delete(schema.workItems).where(eq(schema.workItems.tenantId, t.id));
    // A run still open refers to targets that are about to stop existing.
    await db
      .update(schema.challengeRuns)
      .set({ status: "abandoned", completedAt: new Date() })
      .where(and(eq(schema.challengeRuns.tenantId, t.id), eq(schema.challengeRuns.status, "running")));
    await clearTenantRows(t.id);
    await blobStore().deletePrefix(`tenants/${t.id}`);
  }
  if (tenants.length) log(`cleared in-flight work for ${tenants.length} participant${tenants.length === 1 ? "" : "s"}; runs and certificates kept`);
}

/**
 * Undo a participant's work: their own rows, their patches over the master set,
 * and any blobs they produced. The master set is untouched, so this is a delete
 * rather than the minutes-long regeneration it used to be.
 */
export async function resetSandbox(tenantId: string, log: (m: string) => void = () => {}): Promise<void> {
  await setStatus(tenantId, { status: "provisioning", progress: 0, statusMessage: "Resetting" });
  await db.delete(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.kind, "render_document"), inArray(schema.jobs.status, ["queued", "failed"])));
  await db.delete(schema.entityOverlays).where(eq(schema.entityOverlays.tenantId, tenantId));
  await clearTenantRows(tenantId);
  await blobStore().deletePrefix(`tenants/${tenantId}`);
  await db.update(schema.tenants).set({ resetCount: sql`${schema.tenants.resetCount} + 1` }).where(eq(schema.tenants.id, tenantId));
  log(`tenant ${tenantId} cleared`);
  await setStatus(tenantId, { status: "ready", progress: 100, statusMessage: null, provisionedAt: new Date() });
}


