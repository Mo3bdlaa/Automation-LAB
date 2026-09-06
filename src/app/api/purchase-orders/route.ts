import { z } from "zod";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { PO_STATUSES, purchaseOrders } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { created, problem, readJson } from "@/lib/api/http";
import { enumParam, listRoute } from "@/lib/api/list";
import { serialisePurchaseOrder } from "@/lib/api/serialise";
import { createPurchaseOrder } from "@/lib/services/purchase-orders";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = enumParam(url, "status", PO_STATUSES);
  // The three years of history are excluded unless `scope=all`, so a dispatcher
  // sees the working set by default.
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
  const where = and(
    q ? ilike(purchaseOrders.number, `%${q}%`) : undefined,
    status ? eq(purchaseOrders.status, status) : undefined,
    scope === "mine" ? eq(purchaseOrders.historical, false) : undefined,
    url.searchParams.get("awaitingInvoice") === "1" ? inArray(purchaseOrders.status, ["received", "partially_received"]) : undefined,
  );
  return listRoute(req, s, purchaseOrders, {
    where,
    orderBy: [{ column: purchaseOrders.orderDate, direction: "desc" }, { column: purchaseOrders.number, direction: "desc" }],
    serialise: (po) => serialisePurchaseOrder(s, po, false),
  });
}

const Body = z.object({
  vendorCode: z.string().min(1),
  orderDate: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  buyerCode: z.string().optional(),
  requesterCode: z.string().optional(),
  approverCode: z.string().optional(),
  costCenterCode: z.string().optional(),
  deliveryLocationCode: z.string().optional(),
  notes: z.string().nullish(),
  lines: z
    .array(z.object({ itemCode: z.string().min(1), quantity: z.number(), unitPrice: z.number().optional(), uom: z.string().optional(), taxCode: z.string().optional(), discountPct: z.number().optional() }))
    .min(1),
});

export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const result = await createPurchaseOrder(s, parsed.data);
  if (!result.ok) return problem(422, result.error, result.message, { violations: result.violations });
  const po = await s.tdb.one(purchaseOrders, eq(purchaseOrders.number, result.number));
  return created({ purchaseOrder: await serialisePurchaseOrder(s, po!) }, `/api/purchase-orders/${result.number}`);
}
