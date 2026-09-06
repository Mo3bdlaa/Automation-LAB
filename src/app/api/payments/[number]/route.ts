import { eq } from "drizzle-orm";
import { payments } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok } from "@/lib/api/http";
import { serialisePayment } from "@/lib/api/serialise";

export async function GET(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { number } = await ctx.params;
  const p = await s.tdb.one(payments, eq(payments.number, decodeURIComponent(number)));
  if (!p) return notFound("Payment");
  return ok({ payment: await serialisePayment(s, p) });
}
