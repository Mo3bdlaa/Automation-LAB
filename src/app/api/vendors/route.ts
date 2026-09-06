import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { vendors } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { created, problem, readJson } from "@/lib/api/http";
import { enumParam, listRoute } from "@/lib/api/list";
import { serialiseVendor } from "@/lib/api/serialise";
import { saveVendor } from "@/lib/services/master-data";

export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = enumParam(url, "status", ["active", "pending", "blocked"] as const);
  const where = and(
    q ? or(ilike(vendors.name, `%${q}%`), ilike(vendors.code, `%${q}%`), ilike(vendors.taxId, `%${q}%`)) : undefined,
    status ? eq(vendors.status, status) : undefined,
  );
  return listRoute(req, s, vendors, { where, orderBy: [{ column: vendors.code }], serialise: (v) => serialiseVendor(v, s.tdb.isReadOnlyRow(v)) });
}

export const VendorBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  nameAr: z.string().nullish(),
  legalForm: z.string().default("LLC"),
  category: z.string().default("Office Supplies"),
  crNumber: z.string(),
  crExpiry: z.string(),
  taxId: z.string(),
  taxCertExpiry: z.string(),
  iban: z.string(),
  bankName: z.string().default(""),
  swift: z.string().default(""),
  currency: z.string().default("SAR"),
  paymentTermsDays: z.number().int().default(30),
  contactName: z.string().default(""),
  email: z.string(),
  phone: z.string().default(""),
  addressLine: z.string().default(""),
  city: z.string().default(""),
  country: z.string().default("SA"),
  rating: z.number().int().min(1).max(5).default(3),
  blacklisted: z.boolean().default(false),
  status: z.enum(["active", "pending", "blocked"]).default("active"),
});

export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, VendorBody);
  if ("response" in parsed) return parsed.response;
  const result = await saveVendor(s, "create", null, parsed.data);
  if (!result.ok) return problem(422, result.error, result.message, { violations: result.violations ?? [] });
  return created({ vendor: serialiseVendor(result.row, false) }, `/api/vendors/${result.row.code}`);
}
