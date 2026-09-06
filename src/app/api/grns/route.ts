import { z } from "zod";
import { eq, ilike } from "drizzle-orm";
import { grns } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { created, problem, readJson } from "@/lib/api/http";
import { listRoute } from "@/lib/api/list";
import { serialiseGrn } from "@/lib/api/serialise";
import { postGoodsReceipt } from "@/lib/services/grns";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const q = new URL(req.url).searchParams.get("q")?.trim();
  return listRoute(req, s, grns, { where: q ? ilike(grns.number, `%${q}%`) : undefined, orderBy: [{ column: grns.receivedDate, direction: "desc" }], serialise: (g) => serialiseGrn(s, g) });
}

const Body = z.object({
  deliveryNoteId: z.string().uuid(),
  receivedDate: z.string().optional(),
  notes: z.string().nullish(),
  lines: z
    .array(z.object({ lineNo: z.number().int().min(1), quantityReceived: z.number(), quantityAccepted: z.number().optional(), quantityRejected: z.number().optional(), rejectionReason: z.string().nullish() }))
    .min(1),
});

/** Posts a goods receipt against a delivery note. Over-receipt is rejected by rule. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const { deliveryNoteId, ...rest } = parsed.data;
  const result = await postGoodsReceipt(s, deliveryNoteId, rest);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "read_only" ? 403 : result.error === "already_posted" ? 409 : 422;
    return problem(status, result.error, result.message, { violations: result.violations ?? [] });
  }
  const g = await s.tdb.one(grns, eq(grns.number, result.number));
  return created({ grn: await serialiseGrn(s, g!) }, `/api/grns/${result.number}`);
}
