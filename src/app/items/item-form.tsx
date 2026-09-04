"use client";

import { useActionState } from "react";
import type { Item } from "@/db/schema";
import type { Dictionary } from "@/i18n";
import { emptyFormState, fieldError, type FormState } from "@/lib/forms";
import { Button, Checkbox, Field, Input, LinkButton, Select, ValidationErrors } from "@/components/ui";
import { saveItemAction } from "./actions";

const CATEGORIES = ["Office Supplies", "IT Hardware", "Facilities", "Packaging", "Safety", "Raw Materials", "Furniture", "Medical", "Catering", "Printing"];
const UOMS = ["EA", "BOX", "PK", "RM", "SET", "L", "KG", "TON", "M", "BAG", "ROLL", "PLT", "PR", "CTN", "HR", "DAY"];
const TAX = ["S15", "S05", "Z00", "EXM"];

export function ItemForm({ t, mode, item, suggestedCode }: { t: Dictionary; mode: "create" | "edit"; item: Item | null; suggestedCode?: string }) {
  const bound = saveItemAction.bind(null, mode, item?.code ?? null);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, emptyFormState);
  const v = (key: keyof Item, fallback = "") => {
    if (state.values[key] !== undefined) return state.values[key];
    const raw = item?.[key];
    return raw === null || raw === undefined ? fallback : String(raw);
  };
  const err = (f: string) => fieldError(state, f);
  const ti = t.items;
  return (
    <form key={state.nonce ?? 0} id="item-form" data-testid="item-form" action={action} data-mode={mode} noValidate>
      <ValidationErrors violations={state.violations} emptyText={t.common.noValidationErrors} title={t.common.validationErrors} />
      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <Field testId="item-field-code" label={ti.code} error={err("code")}>
          <Input testId="item-field-code" name="code" defaultValue={v("code", suggestedCode)} readOnly={mode === "edit"} invalid={!!err("code")} />
        </Field>
        <Field testId="item-field-category" label={ti.category}>
          <Select testId="item-field-category" name="category" defaultValue={v("category", "Office Supplies")} options={CATEGORIES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field testId="item-field-name" label={ti.name} error={err("name")}>
          <Input testId="item-field-name" name="name" defaultValue={v("name")} invalid={!!err("name")} />
        </Field>
        <Field testId="item-field-nameAr" label={ti.nameAr}>
          <Input testId="item-field-nameAr" name="nameAr" defaultValue={v("nameAr")} />
        </Field>
        <Field testId="item-field-uom" label={ti.uom} error={err("uom")}>
          <Select testId="item-field-uom" name="uom" defaultValue={v("uom", "EA")} options={UOMS.map((s) => ({ value: s, label: s }))} invalid={!!err("uom")} />
        </Field>
        <Field testId="item-field-taxCode" label={ti.taxCode} error={err("taxCode")}>
          <Select testId="item-field-taxCode" name="taxCode" defaultValue={v("taxCode", "S15")} options={TAX.map((s) => ({ value: s, label: s }))} invalid={!!err("taxCode")} />
        </Field>
        <Field testId="item-field-unitPrice" label={ti.unitPrice} error={err("unitPrice")}>
          <Input testId="item-field-unitPrice" name="unitPrice" type="number" step="0.0001" min="0" defaultValue={v("unitPrice")} invalid={!!err("unitPrice")} />
        </Field>
        <Field testId="item-field-currency" label={ti.currency}>
          <Input testId="item-field-currency" name="currency" defaultValue={v("currency", "SAR")} />
        </Field>
        {mode === "edit" ? <Checkbox testId="item-field-active" name="active" defaultChecked={v("active", "true") !== "false" && v("active", "true") !== "0"} label={ti.active} /> : null}
      </div>
      <div className="mt-4 flex gap-2">
        <Button testId="item-submit" disabled={pending}>
          {t.common.save}
        </Button>
        <LinkButton testId="item-cancel" href={item ? `/items/${encodeURIComponent(item.code)}` : "/items"} variant="secondary">
          {t.common.cancel}
        </LinkButton>
      </div>
    </form>
  );
}
