import { eq } from "drizzle-orm";
import { invoices } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok, problem } from "@/lib/api/http";
import { decideInvoice } from "@/lib/services/invoices";

export async function POST(_req: Request, ctx: { params: Promise<{ internalNumber: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { internalNumber } = await ctx.params;
  const inv = await s.tdb.one(invoices, eq(invoices.internalNumber, decodeURIComponent(internalNumber)));
  if (!inv) return notFound("Invoice");
  const result = await decideInvoice(s, inv, "approve");
  if (!result.ok) return problem(result.error === "read_only" ? 403 : 409, result.error!, result.message!);
  return ok({ invoice: { internalNumber: inv.internalNumber, status: result.status }, paymentNumber: result.paymentNumber ?? null });
}
