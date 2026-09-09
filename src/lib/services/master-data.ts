/**
 * Vendor and item master maintenance. Shared by the CRUD screens and the API,
 * so both run the same rule set from src/lib/validation/rules.ts.
 */
import { eq, ne } from "drizzle-orm";
import { items, vendors, type Item, type Vendor } from "@/db/schema";
import type { LabSession } from "@/lib/auth/server";
import { audit } from "@/lib/auth/server";
import { runRules, type Violation } from "@/lib/validation/engine";
import { itemRules, vendorRules, type ItemInput, type VendorInput } from "@/lib/validation/rules";
import { CORPUS_TODAY } from "@/lib/generator/dates";

export type SaveResult<T> = { ok: true; row: T } | { ok: false; error: "validation_failed" | "not_found" | "read_only"; message: string; violations?: Violation[] };

export interface VendorFields extends VendorInput {
  nameAr?: string | null;
  legalForm?: string;
  category?: string;
  bankName?: string;
  swift?: string;
  contactName?: string;
  phone?: string;
  addressLine?: string;
  city?: string;
  country?: string;
}

/**
 * Runs the vendor rules against a stored supplier, which is what decides
 * whether an onboarding application should have been refused. Kept beside
 * saveVendor so both paths judge a supplier by exactly the same rules.
 */
export async function runVendorRules(session: LabSession, vendor: Vendor): Promise<Violation[]> {
  const others = await session.tdb.list(vendors, { where: ne(vendors.code, vendor.code) });
  const result = runRules(vendorRules, {
    vendor: {
      code: vendor.code, name: vendor.name, nameAr: vendor.nameAr ?? undefined, crNumber: vendor.crNumber, crExpiry: vendor.crExpiry,
      taxId: vendor.taxId, taxCertExpiry: vendor.taxCertExpiry, iban: vendor.iban, email: vendor.email,
      currency: vendor.currency, paymentTermsDays: vendor.paymentTermsDays, rating: vendor.rating, blacklisted: vendor.blacklisted,
      status: vendor.status,
    } as VendorInput,
    existing: others.map((v) => ({ code: v.code, name: v.name, taxId: v.taxId, iban: v.iban, blacklisted: v.blacklisted })),
    today: CORPUS_TODAY,
  });
  return result.violations;
}

export async function saveVendor(session: LabSession, mode: "create" | "edit", originalCode: string | null, input: VendorFields): Promise<SaveResult<Vendor>> {
  const tdb = session.tdb;
  const code = mode === "edit" ? originalCode! : input.code.toUpperCase();
  const candidate: VendorInput = { ...input, code, iban: input.iban.replace(/\s+/g, "").toUpperCase(), taxId: input.taxId.replace(/\s+/g, ""), crNumber: input.crNumber.replace(/\s+/g, "") };
  const existing = await tdb.list(vendors, { where: mode === "edit" ? ne(vendors.code, originalCode!) : undefined });
  const result = runRules(vendorRules, {
    vendor: candidate,
    existing: existing.map((v) => ({ code: v.code, name: v.name, taxId: v.taxId, iban: v.iban, blacklisted: v.blacklisted })),
    today: CORPUS_TODAY,
  });
  if (!result.ok) return { ok: false, error: "validation_failed", message: "The vendor breaks a rule.", violations: result.violations };

  const row = {
    code, name: input.name, nameAr: input.nameAr || null, legalForm: input.legalForm ?? "LLC", category: input.category ?? "Office Supplies",
    crNumber: candidate.crNumber, crExpiry: input.crExpiry, taxId: candidate.taxId, taxCertExpiry: input.taxCertExpiry,
    iban: candidate.iban, bankName: input.bankName ?? "", swift: (input.swift ?? "").toUpperCase(), currency: input.currency.toUpperCase(),
    paymentTermsDays: input.paymentTermsDays, contactName: input.contactName ?? "", email: input.email.toLowerCase(), phone: input.phone ?? "",
    addressLine: input.addressLine ?? "", city: input.city ?? "", country: (input.country ?? "SA").toUpperCase(),
    rating: Math.min(5, Math.max(1, Math.round(input.rating))), blacklisted: input.blacklisted,
    status: input.status as "active" | "pending" | "blocked", updatedAt: new Date(),
  };

  if (mode === "create") {
    const [created] = await tdb.insert(vendors, row);
    await audit(session, "vendor.create", "vendor", code, { warnings: result.violations.map((v) => v.ruleId) });
    return { ok: true, row: created };
  }
  const current = await tdb.one(vendors, eq(vendors.code, originalCode!));
  if (!current) return { ok: false, error: "not_found", message: `Vendor ${originalCode} not found.` };
  if (tdb.isReadOnlyRow(vendors, current)) return { ok: false, error: "read_only", message: "Shared corpus records are read-only. Create a vendor in your sandbox instead." };
  const [updated] = await tdb.update(vendors, row, eq(vendors.id, current.id));
  await audit(session, "vendor.update", "vendor", code, { warnings: result.violations.map((v) => v.ruleId) });
  return { ok: true, row: updated };
}

export interface ItemFields extends ItemInput {
  nameAr?: string | null;
  category?: string;
  active?: boolean;
}

export async function saveItem(session: LabSession, mode: "create" | "edit", originalCode: string | null, input: ItemFields): Promise<SaveResult<Item>> {
  const tdb = session.tdb;
  const code = mode === "edit" ? originalCode! : input.code.toUpperCase();
  const existing = await tdb.list(items, { where: mode === "edit" ? ne(items.code, originalCode!) : undefined });
  const result = runRules(itemRules, { item: { ...input, code }, existing: existing.map((i) => ({ code: i.code, name: i.name })) });
  if (!result.ok) return { ok: false, error: "validation_failed", message: "The item breaks a rule.", violations: result.violations };

  const row = {
    code, name: input.name, nameAr: input.nameAr || null, category: input.category ?? "Office Supplies", uom: input.uom.toUpperCase(),
    taxCode: input.taxCode.toUpperCase(), unitPrice: input.unitPrice.toFixed(4), currency: input.currency.toUpperCase(),
    active: input.active ?? true, updatedAt: new Date(),
  };
  if (mode === "create") {
    const [created] = await tdb.insert(items, row);
    await audit(session, "item.create", "item", code);
    return { ok: true, row: created };
  }
  const current = await tdb.one(items, eq(items.code, originalCode!));
  if (!current) return { ok: false, error: "not_found", message: `Item ${originalCode} not found.` };
  if (tdb.isReadOnlyRow(items, current)) return { ok: false, error: "read_only", message: "Shared corpus records are read-only. Create an item in your sandbox instead." };
  const [updated] = await tdb.update(items, row, eq(items.id, current.id));
  await audit(session, "item.update", "item", code);
  return { ok: true, row: updated };
}
