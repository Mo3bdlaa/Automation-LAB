import { and, eq, ilike, inArray } from "drizzle-orm";
import { rfqs } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { enumParam, listRoute } from "@/lib/api/list";
import { serialiseRfq } from "@/lib/api/serialise";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = enumParam(url, "status", ["open", "quoted", "awarded", "cancelled"] as const);
  const where = and(
    q ? ilike(rfqs.number, `%${q}%`) : undefined,
    status ? eq(rfqs.status, status) : undefined,
    url.searchParams.get("open") === "1" ? inArray(rfqs.status, ["open", "quoted"]) : undefined,
  );
  return listRoute(req, s, rfqs, { where, orderBy: [{ column: rfqs.issueDate, direction: "desc" }], serialise: (r) => serialiseRfq(s, r) });
}
