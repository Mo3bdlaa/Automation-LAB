import { z } from "zod";
import { eq } from "drizzle-orm";
import { workItems } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok, readJson } from "@/lib/api/http";
import { serialiseWorkItem } from "@/lib/api/work-items";

const Body = z.object({
  /** A business exception is final; an application exception can be retried. */
  reason: z.enum(["business", "application"]).default("business"),
  message: z.string().max(2000).optional(),
  ruleIds: z.array(z.string()).optional(),
  retryInSeconds: z.number().int().min(0).max(86400).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const { reason, message, ruleIds, retryInSeconds } = parsed.data;
  const item = await s.tdb.one(workItems, eq(workItems.id, id));
  if (!item) return notFound("Work item");
  const retry = reason === "application" && retryInSeconds !== undefined;
  const [updated] = await s.tdb.update(
    workItems,
    {
      status: retry ? "new" : "failed",
      lastError: message ?? null,
      outcome: { reason, ruleIds: ruleIds ?? [] },
      deferUntil: retry ? new Date(Date.now() + retryInSeconds! * 1000) : null,
      leaseUntil: null,
      leaseOwner: null,
      completedAt: retry ? null : new Date(),
      updatedAt: new Date(),
    },
    eq(workItems.id, item.id),
  );
  return ok({ workItem: serialiseWorkItem(updated) });
}
