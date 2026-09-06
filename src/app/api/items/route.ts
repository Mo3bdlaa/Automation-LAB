import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { items } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { created, problem, readJson } from "@/lib/api/http";
import { listRoute } from "@/lib/api/list";
import { serialiseItem } from "@/lib/api/serialise";
import { saveItem } from "@/lib/services/master-data";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const where = and(
    q ? or(ilike(items.name, `%${q}%`), ilike(items.code, `%${q}%`)) : undefined,
    category ? eq(items.category, category) : undefined,
  );
  return listRoute(req, s, items, { where, orderBy: [{ column: items.code }], serialise: (i) => serialiseItem(i, s.tdb.isReadOnlyRow(i)) });
}

export const ItemBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  nameAr: z.string().nullish(),
  category: z.string().default("Office Supplies"),
  uom: z.string().default("EA"),
  taxCode: z.string().default("S15"),
  unitPrice: z.number(),
  currency: z.string().default("SAR"),
  active: z.boolean().default(true),
});

export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, ItemBody);
  if ("response" in parsed) return parsed.response;
  const result = await saveItem(s, "create", null, parsed.data);
  if (!result.ok) return problem(422, result.error, result.message, { violations: result.violations ?? [] });
  return created({ item: serialiseItem(result.row, false) }, `/api/items/${result.row.code}`);
}
