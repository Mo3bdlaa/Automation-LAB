/**
 * Request-side auth helpers for server components, actions and route handlers.
 * Everything downstream receives a `LabSession`: the principal, their tenant,
 * and a TenantDb already scoped to it.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
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
  /**
   * How this request arrived: through the screens or through the API. Recorded
   * on every audited action so a scored run can say which leaderboard it
   * belongs on without guessing.
   */
  channel: "ui" | "api";
}

export const getLabSession = cache(async (): Promise<LabSession | null> => {
  const principal = await getPrincipal();
  if (!principal || !hasLabAccess(principal)) return null;
  const tenant = await ensureTenantForPrincipal(principal);
  if (!tenant) return null;
  return { principal, tenant, tdb: forTenant(await tenantContext(tenant)), channel: "ui" };
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

/** Principal from an `Authorization: Bearer` API token, or null. */
const getTokenPrincipal = cache(async (): Promise<Principal | null> => {
  const auth = (await headers()).get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const { userIdForToken } = await import("../api/tokens");
  const userId = await userIdForToken(m[1]);
  return userId ? identityProvider().resolve(userId) : null;
});

/**
 * Auth for API routes: an API token takes precedence over the session cookie,
 * so a bot and a browser can hold different identities in the same client.
 * Returns a 401 or 403 response instead of redirecting.
 */
export async function apiSession(): Promise<LabSession | Response> {
  // A bearer token means a robot came in through the API; a cookie on an API
  // route means the screens are calling their own endpoints.
  const tokenPrincipal = await getTokenPrincipal();
  const principal = tokenPrincipal ?? (await getPrincipal());
  const unauth = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store", "WWW-Authenticate": status === 401 ? 'Bearer realm="Automation Lab"' : "" } });
  if (!principal) return unauth(401, "unauthenticated");
  if (!hasLabAccess(principal)) return unauth(403, "no_lab_access");
  const tenant = await ensureTenantForPrincipal(principal);
  if (!tenant) return unauth(403, "no_sandbox");
  return { principal, tenant, tdb: forTenant(await tenantContext(tenant)), channel: tokenPrincipal ? "api" : "ui" };
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
  await db.insert(schema.auditLog).values({ tenantId: session.tenant.id, userId: session.principal.userId, action, entity, entityId, details: { ...details, channel: session.channel } });
}


