import { z } from "zod";
import { apiSession } from "@/lib/auth/server";
import { ok, readJson } from "@/lib/api/http";
import { claimNext, DEFAULT_LEASE_SECONDS, refreshQueue, serialiseWorkItem } from "@/lib/api/work-items";
import { WORK_ITEM_QUEUES } from "@/db/schema";

const Body = z.object({
  queue: z.enum(WORK_ITEM_QUEUES),
  /** Robot name, so a lease can be traced back to the machine holding it. */
  owner: z.string().min(1).max(120).default("robot"),
  leaseSeconds: z.number().int().min(30).max(3600).default(DEFAULT_LEASE_SECONDS),
  refresh: z.boolean().default(true),
});

/**
 * Performer endpoint: atomically takes the next item and holds a lease on it.
 * Returns 204 when the queue is empty, which is the signal to stop looping.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const { queue, owner, leaseSeconds, refresh } = parsed.data;
  if (refresh) await refreshQueue(s, queue);
  const item = await claimNext(s, queue, owner, leaseSeconds);
  if (!item) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return ok({ workItem: serialiseWorkItem(item) });
}
