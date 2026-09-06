import { eq } from "drizzle-orm";
import { purchaseOrders } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { ok, problem } from "@/lib/api/http";
import { serialisePurchaseOrder } from "@/lib/api/serialise";
import { approvePurchaseOrder } from "@/lib/services/purchase-orders";

/** Approving a draft renders its PDF in the background; poll documentId until it is available. */
export async function POST(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { number } = await ctx.params;
  const result = await approvePurchaseOrder(s, decodeURIComponent(number));
  if (!result.ok) return problem(result.error === "not_found" ? 404 : result.error === "read_only" ? 403 : 409, result.error, result.message);
  const po = await s.tdb.one(purchaseOrders, eq(purchaseOrders.number, result.number));
  return ok({ purchaseOrder: await serialisePurchaseOrder(s, po!), documentId: result.documentId });
}
