import { eq } from "drizzle-orm";
import { invoices } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok } from "@/lib/api/http";
import { serialiseInvoice } from "@/lib/api/serialise";

/**
 * While an invoice is pending extraction only its envelope is returned: the
 * printed values stay hidden so the API cannot be used to skip the reading step.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ internalNumber: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { internalNumber } = await ctx.params;
  const inv = await s.tdb.one(invoices, eq(invoices.internalNumber, decodeURIComponent(internalNumber)));
  if (!inv) return notFound("Invoice");
  return ok({ invoice: await serialiseInvoice(s, inv) });
}
