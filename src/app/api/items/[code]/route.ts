import { eq } from "drizzle-orm";
import { items } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok, problem, readJson } from "@/lib/api/http";
import { serialiseItem } from "@/lib/api/serialise";
import { saveItem, type ItemFields } from "@/lib/services/master-data";
import { ItemBody } from "../route";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { code } = await ctx.params;
  const i = await s.tdb.one(items, eq(items.code, decodeURIComponent(code).toUpperCase()));
  if (!i) return notFound("Item");
  return ok({ item: serialiseItem(i, s.tdb.isReadOnlyRow(items, i)) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { code } = await ctx.params;
  const current = await s.tdb.one(items, eq(items.code, decodeURIComponent(code).toUpperCase()));
  if (!current) return notFound("Item");
  const parsed = await readJson(req, ItemBody.partial());
  if ("response" in parsed) return parsed.response;
  const merged: ItemFields = {
    code: current.code, name: current.name, nameAr: current.nameAr, category: current.category, uom: current.uom,
    taxCode: current.taxCode, unitPrice: Number(current.unitPrice), currency: current.currency, active: current.active,
    ...parsed.data,
  };
  const result = await saveItem(s, "edit", current.code, merged);
  if (!result.ok) return problem(result.error === "read_only" ? 403 : 422, result.error, result.message, { violations: result.violations ?? [] });
  return ok({ item: serialiseItem(result.row, false) });
}
