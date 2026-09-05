/**
 * Sandbox lifecycle: JIT creation on first login, provisioning from the
 * user's seed, and reset to identical starting conditions.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { TenantContext } from "@/db/tenant";
import type { Tenant, DocumentKind } from "@/db/schema";
import { ensureSharedTenant, clearTenantRows } from "../corpus/persist";
import { seedForUser } from "../generator/rng";
import {
  assignInvoiceRegistrations, deliveryNoteGroundTruth, generateSandbox, grnGroundTruth, invoiceGroundTruth, purchaseOrderGroundTruth, quoteGroundTruth, receiptGroundTruth, rfqGroundTruth,
  type GroundTruthField,
} from "../generator/sandbox";
import type { TaxCode } from "../generator/money";
import { enqueue } from "../jobs/queue";
import { kickJobs } from "../jobs/runner";
import { blobStore } from "../blob";
import { hasLabAccess, type Principal } from "../identity/types";

export function tenantSlugFor(userId: string): string {
  return `u-${userId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export async function findTenantForUser(userId: string): Promise<Tenant | null> {
  const [t] = await db.select().from(schema.tenants).where(and(eq(schema.tenants.ownerUserId, userId), eq(schema.tenants.kind, "student")));
  return t ?? null;
}

/** Find or create the user's tenant. Creation enqueues provisioning. */
export async function ensureTenantForPrincipal(p: Principal): Promise<Tenant | null> {
  const existing = await findTenantForUser(p.userId);
  if (existing) return existing;
  if (!hasLabAccess(p)) return null;
  const [created] = await db
    .insert(schema.tenants)
    .values({ slug: tenantSlugFor(p.userId), kind: "student", ownerUserId: p.userId, seed: seedForUser(p.userId), status: "provisioning", statusMessage: "Queued" })
    .onConflictDoNothing()
    .returning();
  const tenant = created ?? (await findTenantForUser(p.userId));
  if (created) {
    await enqueue("provision_sandbox", {}, { tenantId: created.id, priority: 10 });
    kickJobs();
  }
  return tenant;
}

export async function tenantContext(tenant: Tenant): Promise<TenantContext> {
  const shared = await ensureSharedTenant();
  return { tenantId: tenant.id, readableTenantIds: [tenant.id, shared], sharedTenantId: shared };
}

async function setStatus(tenantId: string, patch: Partial<Pick<Tenant, "status" | "progress" | "statusMessage" | "provisionedAt">>) {
  await db.update(schema.tenants).set(patch).where(eq(schema.tenants.id, tenantId));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Generate the student's working set from the shared corpus and their seed. */
export async function provisionSandbox(tenantId: string, log: (m: string) => void = () => {}): Promise<void> {
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  const shared = await ensureSharedTenant();
  await setStatus(tenantId, { status: "provisioning", progress: 5, statusMessage: "Loading shared corpus" });

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
  log(`generated ${set.cycles.length} purchase orders with their cycle for tenant ${tenant.slug}`);
  await setStatus(tenantId, { progress: 25, statusMessage: "Writing documents" });

  const vendorByCode = new Map(vendors.map((v) => [v.code, v]));
  const itemByCode = new Map(items.map((i) => [i.code, i.id]));
  const empByCode = new Map(employees.map((e) => [e.code, e.id]));
  const ccByCode = new Map(costCenters.map((c) => [c.code, c.id]));
  const dlByCode = new Map(deliveryLocations.map((d) => [d.code, d.id]));
  const glByCode = new Map(glAccounts.map((g) => [g.code, g.id]));

  const eagerDocumentIds: string[] = [];

  const addDocument = async (tx: Tx, kind: DocumentKind, number: string, sourceId: string, vendorId: string | null, gt: GroundTruthField[], defects: { type: string; severity: "warning" | "error" | "critical"; details: Record<string, unknown> }[] = []) => {
    const [doc] = await tx.insert(schema.documents).values({ tenantId, kind, number, sourceId, vendorId, language: "bilingual" }).returning({ id: schema.documents.id });
    if (gt.length) await tx.insert(schema.groundTruth).values(gt.map((g) => ({ tenantId, documentId: doc.id, field: g.field, value: g.value })));
    if (defects.length) await tx.insert(schema.seededDefects).values(defects.map((d) => ({ tenantId, documentId: doc.id, defectType: d.type, severity: d.severity, details: d.details })));
    eagerDocumentIds.push(doc.id);
    return doc.id;
  };

  await db.transaction(async (tx) => {
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
      if (po.status !== "draft") await addDocument(tx, "purchase_order", po.number, poRow.id, vendor.id, purchaseOrderGroundTruth(po, vendor));

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
          await addDocument(tx, "quote", q.number, qRow.id, qv.id, quoteGroundTruth(q, rfq.number, qv));
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
        await addDocument(tx, "delivery_note", dn.number, dnRow.id, vendor.id, deliveryNoteGroundTruth(dn, po.number, vendor));
      }
      for (const g of cycle.grns) {
        const [gRow] = await tx
          .insert(schema.grns)
          .values({ tenantId, number: g.number, purchaseOrderId: poRow.id, deliveryNoteId: dnIdByNumber.get(g.deliveryNoteNumber) ?? null, vendorId: vendor.id, receivedDate: g.receivedDate, deliveryLocationId: dlByCode.get(g.deliveryLocationCode) ?? null, receivedById: empByCode.get(g.receivedByCode) ?? null, status: g.status, notes: g.notes })
          .returning({ id: schema.grns.id });
        await tx.insert(schema.grnLines).values(g.lines.map((l) => ({ tenantId, grnId: gRow.id, lineNo: l.lineNo, purchaseOrderLineId: poLineId.get(l.poLineNo) ?? null, itemId: itemByCode.get(l.itemCode) ?? null, description: l.description, quantityReceived: String(l.quantityReceived), quantityAccepted: String(l.quantityAccepted), quantityRejected: String(l.quantityRejected), uom: l.uom, rejectionReason: l.rejectionReason })));
        await addDocument(tx, "grn", g.number, gRow.id, vendor.id, grnGroundTruth(g, po.number, vendor));
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
        await addDocument(tx, "quote", q.number, qRow.id, qv.id, quoteGroundTruth(q, rfq.number, qv));
      }
    }
    for (const inv of set.orphanInvoices) {
      await insertInvoice(tx, tenantId, inv, registrations.get(inv)!, null, inv.vendorCode ? vendorByCode.get(inv.vendorCode)!.id : null, itemByCode, new Map(), addDocument);
    }
  });

  await setStatus(tenantId, { progress: 60, statusMessage: `Queueing ${eagerDocumentIds.length} renders` });
  for (const documentId of eagerDocumentIds) await enqueue("render_document", { documentId }, { tenantId, priority: 0 });
  await setStatus(tenantId, { status: "ready", progress: 100, statusMessage: "Ready", provisionedAt: new Date() });
  log(`tenant ${tenant.slug} ready; ${eagerDocumentIds.length} render jobs queued`);
}

type AddDocument = (tx: Tx, kind: DocumentKind, number: string, sourceId: string, vendorId: string | null, gt: GroundTruthField[], defects?: { type: string; severity: "warning" | "error" | "critical"; details: Record<string, unknown> }[]) => Promise<string>;

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
  await addDocument(tx, "invoice", internalNumber, row.id, vendorId, invoiceGroundTruth(inv), defects);
  return row.id;
}

/** Wipe the student's rows and blobs, then provision again from the same seed. */
export async function resetSandbox(tenantId: string, log: (m: string) => void = () => {}): Promise<void> {
  await setStatus(tenantId, { status: "provisioning", progress: 0, statusMessage: "Resetting" });
  await db.delete(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.kind, "render_document"), inArray(schema.jobs.status, ["queued", "failed"])));
  await clearTenantRows(tenantId);
  await blobStore().deletePrefix(`tenants/${tenantId}`);
  await db.update(schema.tenants).set({ resetCount: sql`${schema.tenants.resetCount} + 1` }).where(eq(schema.tenants.id, tenantId));
  log(`tenant ${tenantId} cleared`);
  await provisionSandbox(tenantId, log);
}

export async function requestReset(tenantId: string): Promise<void> {
  await setStatus(tenantId, { status: "provisioning", progress: 0, statusMessage: "Reset queued" });
  await enqueue("reset_sandbox", {}, { tenantId, priority: 10 });
  kickJobs();
}

export interface SandboxProgress {
  tenant: Tenant;
  documents: number;
  rendered: number;
}

export async function sandboxProgress(tenant: Tenant): Promise<SandboxProgress> {
  // Eagerly rendered kinds only: vendor compliance documents render on first download.
  const [d] = await db.select({ n: sql<number>`count(*)` }).from(schema.documents).where(and(eq(schema.documents.tenantId, tenant.id), sql`${schema.documents.kind} not like 'vendor_%'`));
  const [f] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.documentFiles)
    .innerJoin(schema.documents, eq(schema.documents.id, schema.documentFiles.documentId))
    .where(and(eq(schema.documentFiles.tenantId, tenant.id), sql`${schema.documents.kind} not like 'vendor_%'`));
  return { tenant, documents: Number(d?.n ?? 0), rendered: Number(f?.n ?? 0) };
}
