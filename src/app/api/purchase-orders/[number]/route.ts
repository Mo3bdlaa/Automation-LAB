import { eq } from "drizzle-orm";
import { purchaseOrders } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok } from "@/lib/api/http";
import { serialisePurchaseOrder } from "@/lib/api/serialise";

export async function GET(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { number } = await ctx.params;
  const po = await s.tdb.one(purchaseOrders, eq(purchaseOrders.number, decodeURIComponent(number)));
  if (!po) return notFound("Purchase order");
  return ok({ purchaseOrder: await serialisePurchaseOrder(s, po) });
}
