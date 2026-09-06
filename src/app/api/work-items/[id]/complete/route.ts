import { z } from "zod";
import { eq } from "drizzle-orm";
import { workItems } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { conflict, notFound, ok, readJson } from "@/lib/api/http";
import { serialiseWorkItem } from "@/lib/api/work-items";

const Body = z.object({ outcome: z.record(z.string(), z.unknown()).optional() }).default({});

/** Marks an item successful. Completing an already-completed item is a no-op, so a retry is safe. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const item = await s.tdb.one(workItems, eq(workItems.id, id));
  if (!item) return notFound("Work item");
  if (item.status === "successful") return ok({ workItem: serialiseWorkItem(item), idempotent: true });
  if (item.status === "abandoned") return conflict("This work item was abandoned and cannot be completed.");
  const [updated] = await s.tdb.update(workItems, { status: "successful", outcome: parsed.data.outcome ?? null, completedAt: new Date(), leaseUntil: null, leaseOwner: null, updatedAt: new Date() }, eq(workItems.id, item.id));
  return ok({ workItem: serialiseWorkItem(updated) });
}
