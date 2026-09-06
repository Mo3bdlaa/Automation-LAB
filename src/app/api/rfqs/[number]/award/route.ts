import { z } from "zod";
import { apiSession } from "@/lib/auth/server";
import { ok, problem, readJson } from "@/lib/api/http";
import { awardQuote } from "@/lib/services/rfqs";

const Body = z.object({ quoteId: z.string().uuid() });

/** Awards one quotation and creates the draft purchase order from its lines. */
export async function POST(req: Request, ctx: { params: Promise<{ number: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { number } = await ctx.params;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const result = await awardQuote(s, decodeURIComponent(number), parsed.data.quoteId);
  if (!result.ok) return problem(result.error === "not_found" ? 404 : result.error === "read_only" ? 403 : 409, result.error, result.message);
  return ok({ awarded: true, purchaseOrderNumber: result.purchaseOrderNumber });
}
