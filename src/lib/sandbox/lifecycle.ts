/**
 * Request-side sandbox helpers: finding or creating a tenant, its scoping
 * context, progress and reset requests. The heavy generation itself lives in
 * ./provision.ts and runs only inside a background job.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { TenantContext } from "@/db/tenant";
import type { Tenant } from "@/db/schema";
import { ensureSharedTenant } from "../corpus/persist";
import { seedForUser } from "../generator/rng";
import { enqueue } from "../jobs/queue";
import { kickJobs } from "../jobs/runner";
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
