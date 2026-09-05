/**
 * Request-side auth helpers for server components, actions and route handlers.
 * Everything downstream receives a `LabSession`: the principal, their tenant,
 * and a TenantDb already scoped to it.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { forTenant, type TenantDb } from "@/db/tenant";
import type { Tenant } from "@/db/schema";
import { identityProvider, hasLabAccess, type Principal } from "../identity";
import { SESSION_COOKIE, decodeSession, encodeSession, SESSION_TTL_SECONDS } from "../identity/session";
import { ensureTenantForPrincipal, tenantContext } from "../sandbox/lifecycle";

export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = decodeSession(token);
  if (!session) return null;
  return identityProvider().resolve(session.userId);
});

export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  return p;
}

export interface LabSession {
  principal: Principal;
  tenant: Tenant;
  tdb: TenantDb;
}

export const getLabSession = cache(async (): Promise<LabSession | null> => {
  const principal = await getPrincipal();
  if (!principal || !hasLabAccess(principal)) return null;
  const tenant = await ensureTenantForPrincipal(principal);
  if (!tenant) return null;
  return { principal, tenant, tdb: forTenant(await tenantContext(tenant)) };
});

/** Redirects to /login (no session) or /no-access (no entitlement). */
export async function requireLab(): Promise<LabSession> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  if (!hasLabAccess(p)) redirect("/no-access");
  const s = await getLabSession();
  if (!s) redirect("/no-access");
  return s;
}

/** Bearer-token / cookie auth for API routes: returns 401/403 responses instead of redirecting. */
export async function apiSession(): Promise<LabSession | Response> {
  const s = await getLabSession();
  if (s) return s;
  const p = await getPrincipal();
  const status = p ? 403 : 401;
  return Response.json({ error: p ? "no_lab_access" : "unauthenticated" }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function establishSession(principal: Principal): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(principal.userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  await db
    .insert(schema.users)
    .values({ id: principal.userId, email: principal.email, displayName: principal.displayName, roles: principal.roles, providerId: identityProvider().id })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: { email: principal.email, displayName: principal.displayName, roles: principal.roles, lastSeenAt: new Date() },
    });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function audit(session: LabSession, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await db.insert(schema.auditLog).values({ tenantId: session.tenant.id, userId: session.principal.userId, action, entity, entityId, details });
}


