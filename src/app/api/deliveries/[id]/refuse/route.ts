import { z } from "zod";
import { eq } from "drizzle-orm";
import { deliveryNotes } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { conflict, notFound, ok, readJson } from "@/lib/api/http";
import { refuseDelivery } from "@/lib/services/grns";

const Body = z.object({ reason: z.string().min(1).max(300), ruleIds: z.array(z.string()).default([]) });

/** Records that a delivery was refused rather than received, and why. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const dn = await s.tdb.one(deliveryNotes, eq(deliveryNotes.id, id));
  if (!dn) return notFound("Delivery note");
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const result = await refuseDelivery(s, dn, parsed.data.reason, parsed.data.ruleIds);
  if (!result.ok) return conflict(result.message);
  return ok({ deliveryNote: { id: dn.id, number: dn.number }, refused: true, reason: parsed.data.reason });
}
