"use server";

import { redirect } from "next/navigation";
import { requireLab } from "@/lib/auth/server";
import { saveVendor, type VendorFields } from "@/lib/services/master-data";
import { bool, failedState, formValues, num, str, type FormState } from "@/lib/forms";

function vendorInputFrom(values: Record<string, string>): VendorFields {
  return {
    code: str(values, "code").toUpperCase(),
    name: str(values, "name"),
    nameAr: str(values, "nameAr"),
    legalForm: str(values, "legalForm", "LLC"),
    category: str(values, "category", "Office Supplies"),
    crNumber: str(values, "crNumber"),
    crExpiry: str(values, "crExpiry"),
    taxId: str(values, "taxId"),
    taxCertExpiry: str(values, "taxCertExpiry"),
    iban: str(values, "iban"),
    bankName: str(values, "bankName"),
    swift: str(values, "swift"),
    currency: str(values, "currency", "SAR"),
    paymentTermsDays: num(values, "paymentTermsDays", 30),
    contactName: str(values, "contactName"),
    email: str(values, "email"),
    phone: str(values, "phone"),
    addressLine: str(values, "addressLine"),
    city: str(values, "city"),
    country: str(values, "country", "SA"),
    rating: num(values, "rating", 3),
    blacklisted: bool(values, "blacklisted"),
    status: str(values, "status", "active"),
  };
}

export async function saveVendorAction(mode: "create" | "edit", originalCode: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const result = await saveVendor(session, mode, originalCode, vendorInputFrom(values));
  if (!result.ok) return failedState(result.violations ?? [{ ruleId: result.error.toUpperCase(), severity: "error", message: result.message }], values);
  redirect(`/vendors/${encodeURIComponent(result.row.code)}?saved=1`);
}
