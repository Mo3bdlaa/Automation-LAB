"use server";

import { redirect } from "next/navigation";
import { eq, ne } from "drizzle-orm";
import { items } from "@/db/schema";
import { requireLab, audit } from "@/lib/auth/server";
import { runRules } from "@/lib/validation/engine";
import { itemRules } from "@/lib/validation/rules";
import { bool, formValues, num, str, type FormState, failedState } from "@/lib/forms";

export async function saveItemAction(mode: "create" | "edit", originalCode: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const input = {
    code: mode === "edit" ? originalCode! : str(values, "code").toUpperCase(),
    name: str(values, "name"),
    nameAr: str(values, "nameAr"),
    category: str(values, "category", "Office Supplies"),
    uom: str(values, "uom", "EA").toUpperCase(),
    taxCode: str(values, "taxCode", "S15").toUpperCase(),
    unitPrice: num(values, "unitPrice"),
    currency: str(values, "currency", "SAR").toUpperCase(),
    active: mode === "create" ? true : bool(values, "active"),
  };
  const existing = await session.tdb.list(items, { where: mode === "edit" ? ne(items.code, originalCode!) : undefined });
  const result = runRules(itemRules, { item: input, existing: existing.map((i) => ({ code: i.code, name: i.name })) });
  if (!result.ok) return failedState(result.violations, values);

  const row = {
    code: input.code,
    name: input.name,
    nameAr: input.nameAr || null,
    category: input.category,
    uom: input.uom,
    taxCode: input.taxCode,
    unitPrice: input.unitPrice.toFixed(4),
    currency: input.currency,
    active: input.active,
    updatedAt: new Date(),
  };
  if (mode === "create") {
    await session.tdb.insert(items, row);
    await audit(session, "item.create", "item", row.code);
  } else {
    const current = await session.tdb.one(items, eq(items.code, originalCode!));
    if (!current) return failedState([{ ruleId: "ITEM-NOT-FOUND", severity: "error", message: `Item ${originalCode} not found.` }], values);
    if (session.tdb.isReadOnlyRow(current)) {
      return failedState([{ ruleId: "TENANT-READ-ONLY", severity: "error", message: "Shared corpus records are read-only. Create a new item in your sandbox instead." }], values);
    }
    await session.tdb.update(items, row, eq(items.id, current.id));
    await audit(session, "item.update", "item", row.code);
  }
  redirect(`/items/${encodeURIComponent(row.code)}?saved=1`);
}
