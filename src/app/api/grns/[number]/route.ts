import { eq } from "drizzle-orm";
import { grns } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok } from "@/lib/api/http";
import { serialiseGrn } from "@/lib/api/serialise";

export async function GET(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { number } = await ctx.params;
  const g = await s.tdb.one(grns, eq(grns.number, decodeURIComponent(number)));
  if (!g) return notFound("Goods receipt");
  return ok({ grn: await serialiseGrn(s, g) });
}
