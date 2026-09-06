import { and, eq, ilike } from "drizzle-orm";
import { deliveryNotes } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { enumParam, listRoute } from "@/lib/api/list";
import { serialiseDeliveryNote } from "@/lib/api/serialise";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = enumParam(url, "status", ["in_transit", "delivered", "received"] as const);
  const where = and(q ? ilike(deliveryNotes.number, `%${q}%`) : undefined, status ? eq(deliveryNotes.status, status) : undefined);
  return listRoute(req, s, deliveryNotes, { where, orderBy: [{ column: deliveryNotes.deliveryDate, direction: "desc" }], serialise: (d) => serialiseDeliveryNote(s, d) });
}
