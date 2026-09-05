"use server";

import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { vendors } from "@/db/schema";
import { requireLab, audit } from "@/lib/auth/server";
import { runRules } from "@/lib/validation/engine";
import { vendorRules, type VendorInput } from "@/lib/validation/rules";
import { bool, formValues, num, str, type FormState, failedState } from "@/lib/forms";
import { CORPUS_TODAY } from "@/lib/generator/dates";

interface VendorFormInput extends VendorInput {
  nameAr: string;
  legalForm: string;
  category: string;
  bankName: string;
  swift: string;
  contactName: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
}

function vendorInputFrom(values: Record<string, string>): VendorFormInput {
  return {
    code: str(values, "code").toUpperCase(),
    name: str(values, "name"),
    nameAr: str(values, "nameAr"),
    legalForm: str(values, "legalForm", "LLC"),
    category: str(values, "category", "Office Supplies"),
    crNumber: str(values, "crNumber").replace(/\s+/g, ""),
    crExpiry: str(values, "crExpiry"),
    taxId: str(values, "taxId").replace(/\s+/g, ""),
    taxCertExpiry: str(values, "taxCertExpiry"),
    iban: str(values, "iban").replace(/\s+/g, "").toUpperCase(),
    bankName: str(values, "bankName"),
    swift: str(values, "swift").toUpperCase(),
    currency: str(values, "currency", "SAR").toUpperCase(),
    paymentTermsDays: num(values, "paymentTermsDays", 30),
    contactName: str(values, "contactName"),
    email: str(values, "email").toLowerCase(),
    phone: str(values, "phone"),
    addressLine: str(values, "addressLine"),
    city: str(values, "city"),
    country: str(values, "country", "SA").toUpperCase(),
    rating: num(values, "rating", 3),
    blacklisted: bool(values, "blacklisted"),
    status: str(values, "status", "active"),
  };
}

export async function saveVendorAction(mode: "create" | "edit", originalCode: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const input = vendorInputFrom(values);
  if (mode === "edit") input.code = originalCode!;

  const existingRows = await session.tdb.list(vendors, { where: mode === "edit" ? ne(vendors.code, originalCode!) : undefined });
  const result = runRules(vendorRules, {
    vendor: input,
    existing: existingRows.map((v) => ({ code: v.code, name: v.name, taxId: v.taxId, iban: v.iban, blacklisted: v.blacklisted })),
    today: CORPUS_TODAY,
  });
  if (!result.ok) return failedState(result.violations, values);

  const row = {
    code: input.code,
    name: input.name,
    nameAr: input.nameAr || null,
    legalForm: input.legalForm,
    category: input.category,
    crNumber: input.crNumber,
    crExpiry: input.crExpiry,
    taxId: input.taxId,
    taxCertExpiry: input.taxCertExpiry,
    iban: input.iban,
    bankName: input.bankName,
    swift: input.swift,
    currency: input.currency,
    paymentTermsDays: input.paymentTermsDays,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    addressLine: input.addressLine,
    city: input.city,
    country: input.country,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    blacklisted: input.blacklisted,
    status: input.status as "active" | "pending" | "blocked",
    updatedAt: new Date(),
  };

  if (mode === "create") {
    await session.tdb.insert(vendors, row);
    await audit(session, "vendor.create", "vendor", row.code, { warnings: result.violations.map((v) => v.ruleId) });
  } else {
    const existing = await session.tdb.one(vendors, eq(vendors.code, originalCode!));
    if (!existing) return failedState([{ ruleId: "VEND-NOT-FOUND", severity: "error", message: `Vendor ${originalCode} not found.` }], values);
    if (session.tdb.isReadOnlyRow(existing)) {
      return failedState([{ ruleId: "TENANT-READ-ONLY", severity: "error", message: "Shared corpus records are read-only. Create a new vendor in your sandbox instead." }], values);
    }
    await session.tdb.update(vendors, row, and(eq(vendors.code, originalCode!), eq(vendors.id, existing.id))!);
    await audit(session, "vendor.update", "vendor", row.code, { warnings: result.violations.map((v) => v.ruleId) });
  }
  redirect(`/vendors/${encodeURIComponent(row.code)}?saved=1`);
}
