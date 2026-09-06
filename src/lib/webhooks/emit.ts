/**
 * Webhook fan-out. Deliveries are queued as background jobs so a slow or dead
 * endpoint never blocks a request, and each delivery is signed so the receiver
 * can verify it came from the lab.
 */
import { createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { webhookDeliveries, webhookEndpoints, type WebhookEvent } from "@/db/schema";
import { enqueue } from "@/lib/jobs/queue";
import { kickJobs } from "@/lib/jobs/runner";

export function newSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signPayload(secret: string, body: string, timestamp: number): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Queues one delivery per active endpoint subscribed to the event. */
export async function emitWebhook(session: { tenant: { id: string } }, event: WebhookEvent, payload: Record<string, unknown>): Promise<number> {
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.tenantId, session.tenant.id), eq(webhookEndpoints.active, true)));
  const targets = endpoints.filter((e) => e.events.length === 0 || e.events.includes(event));
  if (targets.length === 0) return 0;
  for (const endpoint of targets) {
    const [row] = await db.insert(webhookDeliveries).values({ tenantId: session.tenant.id, endpointId: endpoint.id, event, payload }).returning({ id: webhookDeliveries.id });
    await enqueue("deliver_webhook", { deliveryId: row.id }, { tenantId: session.tenant.id, priority: 1 });
  }
  kickJobs();
  return targets.length;
}

/** Performs one queued delivery. Called by the job handler. */
export async function deliverWebhook(deliveryId: string, log: (m: string) => void = () => {}): Promise<void> {
  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId));
  if (!delivery || delivery.status === "delivered") return;
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId));
  if (!endpoint || !endpoint.active) {
    await db.update(webhookDeliveries).set({ status: "failed", error: "endpoint inactive" }).where(eq(webhookDeliveries.id, deliveryId));
    return;
  }
  const body = JSON.stringify({ event: delivery.event, createdAt: delivery.createdAt.toISOString(), data: delivery.payload });
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Automation-Lab-Event": delivery.event, "X-Automation-Lab-Signature": signPayload(endpoint.secret, body, timestamp) },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    await db
      .update(webhookDeliveries)
      .set({ status: res.ok ? "delivered" : "failed", responseCode: res.status, attempts: delivery.attempts + 1, deliveredAt: res.ok ? new Date() : null, error: res.ok ? null : `HTTP ${res.status}` })
      .where(eq(webhookDeliveries.id, deliveryId));
    log(`webhook ${delivery.event} -> ${endpoint.url}: ${res.status}`);
    if (!res.ok) throw new Error(`Webhook endpoint returned ${res.status}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(webhookDeliveries).set({ status: "failed", attempts: delivery.attempts + 1, error: message.slice(0, 500) }).where(eq(webhookDeliveries.id, deliveryId));
    throw e;
  }
}

