import { ilike, or } from "drizzle-orm";
import { payments } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { listRoute } from "@/lib/api/list";
import { serialisePayment } from "@/lib/api/serialise";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const q = new URL(req.url).searchParams.get("q")?.trim();
  return listRoute(req, s, payments, { where: q ? or(ilike(payments.number, `%${q}%`), ilike(payments.reference, `%${q}%`)) : undefined, orderBy: [{ column: payments.paidDate, direction: "desc" }], serialise: (p) => serialisePayment(s, p) });
}
