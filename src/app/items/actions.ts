"use server";

import { redirect } from "next/navigation";
import { requireLab } from "@/lib/auth/server";
import { saveItem } from "@/lib/services/master-data";
import { bool, failedState, formValues, num, str, type FormState } from "@/lib/forms";

export async function saveItemAction(mode: "create" | "edit", originalCode: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const result = await saveItem(session, mode, originalCode, {
    code: mode === "edit" ? originalCode! : str(values, "code").toUpperCase(),
    name: str(values, "name"),
    nameAr: str(values, "nameAr"),
    category: str(values, "category", "Office Supplies"),
    uom: str(values, "uom", "EA"),
    taxCode: str(values, "taxCode", "S15"),
    unitPrice: num(values, "unitPrice"),
    currency: str(values, "currency", "SAR"),
    active: mode === "create" ? true : bool(values, "active"),
  });
  if (!result.ok) return failedState(result.violations ?? [{ ruleId: result.error.toUpperCase(), severity: "error", message: result.message }], values);
  redirect(`/items/${encodeURIComponent(result.row.code)}?saved=1`);
}
