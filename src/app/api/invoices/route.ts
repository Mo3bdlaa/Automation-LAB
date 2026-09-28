import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { INVOICE_STATUSES, invoices } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { created, problem, readJson } from "@/lib/api/http";
import { enumParam, listRoute } from "@/lib/api/list";
import { serialiseInvoice } from "@/lib/api/serialise";
import { recordInvoice } from "@/lib/services/invoices";

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

const Body = z.object({
  number: z.string().min(1),
  poNumber: z.string().optional(),
  vendorCode: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  currency: z.string().optional(),
  printedVendorName: z.string().optional(),
  printedVendorTaxId: z.string().optional(),
  printedIban: z.string().optional(),
  printedBankName: z.string().optional(),
  subtotal: z.number().optional(),
  taxTotal: z.number().optional(),
  grandTotal: z.number().optional(),
  lines: z
    .array(
      z.object({
        itemCode: z.string().optional(),
        description: z.string().optional(),
        quantity: z.number(),
        uom: z.string().optional(),
        unitPrice: z.number(),
        discountPct: z.number().optional(),
        taxCode: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * Register a vendor invoice that arrived on paper — the API half of the
 * accounts payable entry screen. The match runs before the response, so the
 * violations come back with the invoice rather than a request later.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const result = await recordInvoice(s, parsed.data);
  if (!result.ok) return problem(422, result.error, result.message, { violations: result.violations });
  const inv = await s.tdb.one(invoices, eq(invoices.internalNumber, result.internalNumber));
  return created(
    { invoice: await serialiseInvoice(s, inv!, { withLines: true }), status: result.status, violations: result.violations },
    `/api/invoices/${result.internalNumber}`,
  );
}
