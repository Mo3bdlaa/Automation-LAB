/**
 * Sandbox lifecycle: JIT creation on first login, provisioning from the
 * user's seed, and reset to identical starting conditions.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { TenantContext } from "@/db/tenant";
import type { Tenant } from "@/db/schema";
import { ensureSharedTenant, clearTenantRows } from "../corpus/persist";
import { seedForUser } from "../generator/rng";
import { generateSandbox, purchaseOrderGroundTruth } from "../generator/sandbox";
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
    items: items.map((i) => ({ ...i, nameAr: i.nameAr ?? "", unitPrice: Number(i.unitPrice), taxCode: i.taxCode as "S15", priceHistory: [] })),
    employees: employees.map((e) => ({
      code: e.code, name: e.name, email: e.email, role: e.role,
      approvalLimit: e.approvalLimit == null ? null : Number(e.approvalLimit),
      costCenterCode: costCenters.find((c) => c.id === e.costCenterId)?.code ?? "CC-100",
    })),
  };
  const set = generateSandbox(tenant.seed, ctx);
  log(`generated ${set.purchaseOrders.length} purchase orders for tenant ${tenant.slug}`);
  await setStatus(tenantId, { progress: 30, statusMessage: "Writing purchase orders" });

  const vendorByCode = new Map(vendors.map((v) => [v.code, v]));
  const itemByCode = new Map(items.map((i) => [i.code, i.id]));
  const empByCode = new Map(employees.map((e) => [e.code, e.id]));
  const ccByCode = new Map(costCenters.map((c) => [c.code, c.id]));
  const dlByCode = new Map(deliveryLocations.map((d) => [d.code, d.id]));
  const glByCode = new Map(glAccounts.map((g) => [g.code, g.id]));

  const documentIds: string[] = [];
  await db.transaction(async (tx) => {
    for (const po of set.purchaseOrders) {
      const vendor = vendorByCode.get(po.vendorCode)!;
      const [row] = await tx
        .insert(schema.purchaseOrders)
        .values({
          tenantId,
          number: po.number,
          vendorId: vendor.id,
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
          historical: false,
        })
        .returning({ id: schema.purchaseOrders.id });
      await tx.insert(schema.purchaseOrderLines).values(
        po.lines.map((l) => ({
          tenantId,
          purchaseOrderId: row.id,
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
      // Drafts have no document yet: the PDF exists once the PO is approved.
      if (po.status === "draft") continue;
      const [doc] = await tx
        .insert(schema.documents)
        .values({ tenantId, kind: "purchase_order", number: po.number, sourceId: row.id, vendorId: vendor.id, language: "bilingual" })
        .returning({ id: schema.documents.id });
      const gt = purchaseOrderGroundTruth(po, vendor);
      await tx.insert(schema.groundTruth).values(gt.map((g) => ({ tenantId, documentId: doc.id, field: g.field, value: g.value })));
      documentIds.push(doc.id);
    }
  });

  await setStatus(tenantId, { progress: 60, statusMessage: `Queueing ${documentIds.length} renders` });
  for (const documentId of documentIds) await enqueue("render_document", { documentId }, { tenantId, priority: 0 });
  await setStatus(tenantId, { status: "ready", progress: 100, statusMessage: "Ready", provisionedAt: new Date() });
  log(`tenant ${tenant.slug} ready; ${documentIds.length} render jobs queued`);
}

/** Wipe the student's rows and blobs, then provision again from the same seed. */
export async function resetSandbox(tenantId: string, log: (m: string) => void = () => {}): Promise<void> {
  await setStatus(tenantId, { status: "provisioning", progress: 0, statusMessage: "Resetting" });
  // Drop any renders still queued for the old rows.
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
  const [d] = await db.select({ n: sql<number>`count(*)` }).from(schema.documents).where(eq(schema.documents.tenantId, tenant.id));
  const [f] = await db.select({ n: sql<number>`count(*)` }).from(schema.documentFiles).where(eq(schema.documentFiles.tenantId, tenant.id));
  return { tenant, documents: Number(d?.n ?? 0), rendered: Number(f?.n ?? 0) };
}
