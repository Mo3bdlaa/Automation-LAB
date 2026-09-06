import { and, eq, ilike, or } from "drizzle-orm";
import { INVOICE_STATUSES, invoices } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { enumParam, listRoute } from "@/lib/api/list";
import { serialiseInvoice } from "@/lib/api/serialise";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = enumParam(url, "status", INVOICE_STATUSES);
  const where = and(
    q ? or(ilike(invoices.internalNumber, `%${q}%`), ilike(invoices.number, `%${q}%`), ilike(invoices.printedVendorName, `%${q}%`)) : undefined,
    status ? eq(invoices.status, status) : undefined,
  );
  return listRoute(req, s, invoices, {
    where,
    orderBy: [{ column: invoices.receivedDate, direction: "desc" }, { column: invoices.internalNumber, direction: "desc" }],
    serialise: (inv) => serialiseInvoice(s, inv, { withLines: false }),
  });
}
