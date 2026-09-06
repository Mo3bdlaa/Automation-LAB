import { eq } from "drizzle-orm";
import { rfqs } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok } from "@/lib/api/http";
import { serialiseRfq } from "@/lib/api/serialise";

export async function GET(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { number } = await ctx.params;
  const rfq = await s.tdb.one(rfqs, eq(rfqs.number, decodeURIComponent(number)));
  if (!rfq) return notFound("RFQ");
  return ok({ rfq: await serialiseRfq(s, rfq) });
}
