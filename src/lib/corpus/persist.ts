/**
 * Persists the shared corpus. Uses the raw client on purpose: the corpus is
 * the one thing that is written *into* the shared tenant, and it happens from
 * a script or a job, never from a request.
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { generateCorpus, assertCorpusCoherent, type Corpus } from "../generator/corpus";
import { Rng, SHARED_CORPUS_SEED } from "../generator/rng";
import { generateVendorDocuments } from "../generator/cycle";
import { vendorDocumentGroundTruth } from "../generator/sandbox";

export const SHARED_TENANT_SLUG = "shared";

let sharedTenantIdCache: string | null = null;

export async function ensureSharedTenant(): Promise<string> {
  if (sharedTenantIdCache) return sharedTenantIdCache;
  const [existing] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, SHARED_TENANT_SLUG));
  if (existing) return (sharedTenantIdCache = existing.id);
  const [created] = await db
    .insert(schema.tenants)
    .values({ slug: SHARED_TENANT_SLUG, kind: "shared", seed: SHARED_CORPUS_SEED, status: "provisioning" })
    .onConflictDoNothing()
    .returning();
  if (created) return (sharedTenantIdCache = created.id);
  const [again] = await db.select().from(schema.tenants).where(eq(schema.tenants.slug, SHARED_TENANT_SLUG));
  return (sharedTenantIdCache = again.id);
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface SeedReport {
  tenantId: string;
  skipped: boolean;
  counts: Record<string, number>;
}

export async function seedSharedCorpus(opts: { force?: boolean; log?: (m: string) => void } = {}): Promise<SeedReport> {
  const log = opts.log ?? (() => {});
  const tenantId = await ensureSharedTenant();
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.vendors).where(eq(schema.vendors.tenantId, tenantId));
  if (Number(n) > 0 && !opts.force) {
    log(`Shared corpus already seeded (${n} vendors). Use --force to regenerate.`);
    return { tenantId, skipped: true, counts: {} };
  }
  if (Number(n) > 0) {
    log("Clearing existing shared corpus…");
    await clearTenantRows(tenantId);
    // The rendered files too, not only the rows that point at them. A rebuild
    // produces a whole new set of document ids, so everything under this prefix
    // is about to become unreferenced — and on object storage unreferenced
    // means paid for. Left alone, every regeneration would strand the previous
    // build's documents in the bucket.
    const { blobStore } = await import("../blob");
    await blobStore().deletePrefix(`tenants/${tenantId}`);
    log("Cleared the previous build's rendered documents.");
  }

  log("Generating corpus…");
  const corpus: Corpus = generateCorpus(SHARED_CORPUS_SEED);
  assertCorpusCoherent(corpus);
  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    const cc = await tx.insert(schema.costCenters).values(corpus.costCenters.map((c) => ({ ...c, tenantId }))).returning();
    const ccByCode = new Map(cc.map((c) => [c.code, c.id]));
    counts.costCenters = cc.length;

    const gl = await tx.insert(schema.glAccounts).values(corpus.glAccounts.map((g) => ({ ...g, tenantId }))).returning();
    const glByCode = new Map(gl.map((g) => [g.code, g.id]));
    counts.glAccounts = gl.length;

    const dl = await tx.insert(schema.deliveryLocations).values(corpus.deliveryLocations.map((d) => ({ ...d, tenantId }))).returning();
    const dlByCode = new Map(dl.map((d) => [d.code, d.id]));
    counts.deliveryLocations = dl.length;

    const emp = await tx
      .insert(schema.employees)
      .values(
        corpus.employees.map((e) => ({
          tenantId,
          code: e.code,
          name: e.name,
          email: e.email,
          role: e.role,
          approvalLimit: e.approvalLimit == null ? null : e.approvalLimit.toFixed(2),
          costCenterId: ccByCode.get(e.costCenterCode) ?? null,
        })),
      )
      .returning();
    const empByCode = new Map(emp.map((e) => [e.code, e.id]));
    counts.employees = emp.length;

    log(`Inserting ${corpus.vendors.length} vendors…`);
    const vendorRows: { code: string; id: string }[] = [];
    for (const batch of chunks(corpus.vendors, 250)) {
      const rows = await tx
        .insert(schema.vendors)
        .values(batch.map((v) => ({ ...v, tenantId })))
        .returning({ code: schema.vendors.code, id: schema.vendors.id });
      vendorRows.push(...rows);
    }
    const vendorByCode = new Map(vendorRows.map((v) => [v.code, v.id]));
    counts.vendors = vendorRows.length;

    log("Inserting vendor compliance documents (PDFs render on first download)…");
    let vendorDocCount = 0;
    for (const v of corpus.vendors) {
      const docs = generateVendorDocuments(new Rng(SHARED_CORPUS_SEED).fork(`vendor-docs:${v.code}`), v);
      const rows = await tx
        .insert(schema.vendorDocuments)
        .values(docs.map((d) => ({ tenantId, vendorId: vendorByCode.get(v.code)!, kind: d.kind, number: d.number, issuedDate: d.issuedDate, expiryDate: d.expiryDate, issuer: d.issuer, attributes: d.attributes })))
        .returning({ id: schema.vendorDocuments.id, kind: schema.vendorDocuments.kind });
      const docRows = await tx
        .insert(schema.documents)
        .values(rows.map((r) => ({ tenantId, kind: r.kind, number: docs.find((d) => d.kind === r.kind)!.number, sourceId: r.id, vendorId: vendorByCode.get(v.code)!, language: v.documentLanguage })))
        .returning({ id: schema.documents.id, kind: schema.documents.kind });
      // The certificate prints the vendor's name in both scripts, so either is a correct reading.
      const gt = docRows.flatMap((dr) =>
        vendorDocumentGroundTruth(v, docs.find((d) => d.kind === dr.kind)!).map((g) => ({
          tenantId,
          documentId: dr.id,
          field: g.field,
          value: g.value,
          alternates: g.field === "vendor.name" && v.nameAr ? [v.nameAr] : [],
        })),
      );
      for (const batch of chunks(gt, 500)) await tx.insert(schema.groundTruth).values(batch);
      vendorDocCount += rows.length;
    }
    counts.vendorDocuments = vendorDocCount;

    log(`Inserting ${corpus.items.length} items…`);
    const itemRows: { code: string; id: string }[] = [];
    for (const batch of chunks(corpus.items, 300)) {
      const rows = await tx
        .insert(schema.items)
        .values(
          batch.map((it) => ({
            tenantId,
            code: it.code,
            name: it.name,
            nameAr: it.nameAr,
            category: it.category,
            uom: it.uom,
            taxCode: it.taxCode,
            unitPrice: it.unitPrice.toFixed(4),
            currency: it.currency,
            active: it.active,
          })),
        )
        .returning({ code: schema.items.code, id: schema.items.id });
      itemRows.push(...rows);
    }
    const itemByCode = new Map(itemRows.map((i) => [i.code, i.id]));
    counts.items = itemRows.length;

    const history = corpus.items.flatMap((it) =>
      it.priceHistory.map((h) => ({ tenantId, itemId: itemByCode.get(it.code)!, effectiveFrom: h.effectiveFrom, unitPrice: h.unitPrice.toFixed(4) })),
    );
    for (const batch of chunks(history, 500)) await tx.insert(schema.itemPriceHistory).values(batch);
    counts.itemPriceHistory = history.length;

    log(`Inserting ${corpus.history.length} historical purchase orders…`);
    let lineCount = 0;
    for (const batch of chunks(corpus.history, 150)) {
      const poRows = await tx
        .insert(schema.purchaseOrders)
        .values(
          batch.map((po) => ({
            tenantId,
            number: po.number,
            vendorId: vendorByCode.get(po.vendorCode)!,
            buyerId: empByCode.get(po.buyerCode) ?? null,
            requesterId: empByCode.get(po.requesterCode) ?? null,
            approverId: empByCode.get(po.approverCode) ?? null,
            costCenterId: ccByCode.get(po.costCenterCode) ?? null,
            deliveryLocationId: dlByCode.get(po.deliveryLocationCode) ?? null,
            currency: po.currency,
            orderDate: po.orderDate,
            expectedDeliveryDate: po.expectedDeliveryDate,
            paymentTermsDays: po.paymentTermsDays,
            status: po.status,
            subtotal: po.subtotal.toFixed(2),
            taxTotal: po.taxTotal.toFixed(2),
            grandTotal: po.grandTotal.toFixed(2),
            notes: po.notes,
            historical: true,
          })),
        )
        .returning({ id: schema.purchaseOrders.id, number: schema.purchaseOrders.number });
      const poIdByNumber = new Map(poRows.map((p) => [p.number, p.id]));
      const lines = batch.flatMap((po) =>
        po.lines.map((l) => ({
          tenantId,
          purchaseOrderId: poIdByNumber.get(po.number)!,
          lineNo: l.lineNo,
          itemId: itemByCode.get(l.itemCode) ?? null,
          description: l.description,
          quantity: String(l.quantity),
          uom: l.uom,
          unitPrice: l.unitPrice.toFixed(4),
          discountPct: l.discountPct.toFixed(2),
          taxCode: l.taxCode,
          taxAmount: l.taxAmount.toFixed(2),
          lineTotal: l.lineTotal.toFixed(2),
          glAccountId: glByCode.get(l.glCode) ?? null,
        })),
      );
      for (const lb of chunks(lines, 500)) await tx.insert(schema.purchaseOrderLines).values(lb);
      lineCount += lines.length;
    }
    counts.purchaseOrders = corpus.history.length;
    counts.purchaseOrderLines = lineCount;

    await tx
      .update(schema.tenants)
      .set({ status: "ready", progress: 100, provisionedAt: new Date(), statusMessage: "Shared corpus seeded" })
      .where(eq(schema.tenants.id, tenantId));
  });

  log("Done.");
  return { tenantId, skipped: false, counts };
}

/** Delete every tenant-scoped row for a tenant, in FK-safe order. Used by corpus reseed and sandbox reset. */
export async function clearTenantRows(tenantId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Children first. document_files/ground_truth/seeded_defects cascade from documents; lines cascade from POs.
    await tx.delete(schema.documents).where(eq(schema.documents.tenantId, tenantId));
    await tx.delete(schema.extractions).where(eq(schema.extractions.tenantId, tenantId));
    await tx.delete(schema.receipts).where(eq(schema.receipts.tenantId, tenantId));
    await tx.delete(schema.payments).where(eq(schema.payments.tenantId, tenantId));
    await tx.delete(schema.invoices).where(eq(schema.invoices.tenantId, tenantId));
    await tx.delete(schema.grns).where(eq(schema.grns.tenantId, tenantId));
    await tx.delete(schema.deliveryNotes).where(eq(schema.deliveryNotes.tenantId, tenantId));
    await tx.delete(schema.quotes).where(eq(schema.quotes.tenantId, tenantId));
    await tx.delete(schema.rfqs).where(eq(schema.rfqs.tenantId, tenantId));
    await tx.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, tenantId));
    await tx.delete(schema.vendorDocuments).where(eq(schema.vendorDocuments.tenantId, tenantId));
    await tx.delete(schema.itemPriceHistory).where(eq(schema.itemPriceHistory.tenantId, tenantId));
    await tx.delete(schema.items).where(eq(schema.items.tenantId, tenantId));
    await tx.delete(schema.vendors).where(eq(schema.vendors.tenantId, tenantId));
    await tx.delete(schema.employees).where(eq(schema.employees.tenantId, tenantId));
    await tx.delete(schema.deliveryLocations).where(eq(schema.deliveryLocations.tenantId, tenantId));
    await tx.delete(schema.glAccounts).where(eq(schema.glAccounts.tenantId, tenantId));
    await tx.delete(schema.costCenters).where(eq(schema.costCenters.tenantId, tenantId));
  });
}
