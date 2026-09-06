import { eq } from "drizzle-orm";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok } from "@/lib/api/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const e = await s.tdb.one(webhookEndpoints, eq(webhookEndpoints.id, id));
  if (!e) return notFound("Webhook endpoint");
  const deliveries = await s.tdb.list(webhookDeliveries, { where: eq(webhookDeliveries.endpointId, e.id), orderBy: [{ column: webhookDeliveries.createdAt, direction: "desc" }], limit: 20 });
  return ok({
    endpoint: { id: e.id, url: e.url, events: e.events, active: e.active, createdAt: e.createdAt.toISOString() },
    recentDeliveries: deliveries.map((d) => ({ id: d.id, event: d.event, status: d.status, responseCode: d.responseCode, attempts: d.attempts, error: d.error, createdAt: d.createdAt.toISOString() })),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const deleted = await s.tdb.delete(webhookEndpoints, eq(webhookEndpoints.id, id));
  return deleted ? ok({ deleted: true, id }) : notFound("Webhook endpoint");
}
