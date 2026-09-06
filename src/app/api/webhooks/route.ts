import { z } from "zod";
import { webhookEndpoints, WEBHOOK_EVENTS } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { created, ok, readJson } from "@/lib/api/http";
import { newSecret } from "@/lib/webhooks/emit";

const Body = z.object({
  url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), "Must be an HTTP(S) URL."),
  events: z.array(z.enum(WEBHOOK_EVENTS)).default([]),
});

export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const rows = await s.tdb.list(webhookEndpoints, { orderBy: [{ column: webhookEndpoints.createdAt, direction: "desc" }] });
  return ok({ endpoints: rows.map((e) => ({ id: e.id, url: e.url, events: e.events, active: e.active, createdAt: e.createdAt.toISOString() })), availableEvents: WEBHOOK_EVENTS });
}

/**
 * Registers an endpoint. The signing secret is returned once; every delivery
 * carries `X-Automation-Lab-Signature: t=<unix>,v1=<hmac sha256 of "t.body">`.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const secret = newSecret();
  const [row] = await s.tdb.insert(webhookEndpoints, { url: parsed.data.url, events: parsed.data.events, secret, active: true });
  return created({ endpoint: { id: row.id, url: row.url, events: row.events, active: row.active }, secret, note: "Store this secret now: it cannot be shown again." }, `/api/webhooks/${row.id}`);
}
