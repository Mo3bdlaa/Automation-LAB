import { eq } from "drizzle-orm";
import { vendors } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { notFound, ok, problem, readJson } from "@/lib/api/http";
import { serialiseVendor, serialiseVendorDocuments } from "@/lib/api/serialise";
import { saveVendor, type VendorFields } from "@/lib/services/master-data";
import { VendorBody } from "../route";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { code } = await ctx.params;
  const v = await s.tdb.one(vendors, eq(vendors.code, decodeURIComponent(code).toUpperCase()));
  if (!v) return notFound("Vendor");
  return ok({ vendor: serialiseVendor(v, s.tdb.isReadOnlyRow(v)), documents: await serialiseVendorDocuments(s, v.id) });
}

/** Partial update: fields left out keep their stored value, then the full rule set runs. */
export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { code } = await ctx.params;
  const current = await s.tdb.one(vendors, eq(vendors.code, decodeURIComponent(code).toUpperCase()));
  if (!current) return notFound("Vendor");
  const parsed = await readJson(req, VendorBody.partial());
  if ("response" in parsed) return parsed.response;
  const merged: VendorFields = {
    code: current.code, name: current.name, nameAr: current.nameAr, legalForm: current.legalForm, category: current.category,
    crNumber: current.crNumber, crExpiry: current.crExpiry, taxId: current.taxId, taxCertExpiry: current.taxCertExpiry,
    iban: current.iban, bankName: current.bankName, swift: current.swift, currency: current.currency, paymentTermsDays: current.paymentTermsDays,
    contactName: current.contactName, email: current.email, phone: current.phone, addressLine: current.addressLine, city: current.city,
    country: current.country, rating: current.rating, blacklisted: current.blacklisted, status: current.status,
    ...parsed.data,
  };
  const result = await saveVendor(s, "edit", current.code, merged);
  if (!result.ok) return problem(result.error === "read_only" ? 403 : 422, result.error, result.message, { violations: result.violations ?? [] });
  return ok({ vendor: serialiseVendor(result.row, false) });
}
