"use client";

import { useActionState } from "react";
import type { Vendor } from "@/db/schema";
import type { Dictionary } from "@/i18n";
import { emptyFormState, fieldError, type FormState } from "@/lib/forms";
import { Button, Checkbox, Field, Input, LinkButton, Select, ValidationErrors } from "@/components/ui";
import { saveVendorAction } from "./actions";

const LEGAL_FORMS = ["LLC", "Est.", "Co.", "JSC", "Ltd."];
const CATEGORIES = ["Office Supplies", "IT Hardware", "IT Services", "Facilities", "Logistics", "Raw Materials", "Packaging", "Safety", "Furniture", "Printing", "Medical", "Catering", "Maintenance", "Construction"];

export function VendorForm({ t, mode, vendor, suggestedCode }: { t: Dictionary; mode: "create" | "edit"; vendor: Vendor | null; suggestedCode?: string }) {
  const bound = saveVendorAction.bind(null, mode, vendor?.code ?? null);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, emptyFormState);
  const v = (key: keyof Vendor, fallback = "") => {
    if (state.values[key] !== undefined) return state.values[key];
    const raw = vendor?.[key];
    return raw === null || raw === undefined ? fallback : String(raw);
  };
  const err = (f: string) => fieldError(state, f);
  const tv = t.vendors;
  return (
    <form key={state.nonce ?? 0} id="vendor-form" data-testid="vendor-form" action={action} data-mode={mode} noValidate>
      <ValidationErrors violations={state.violations} emptyText={t.common.noValidationErrors} title={t.common.validationErrors} />
      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <Field testId="vendor-field-code" label={tv.code} error={err("code")}>
          <Input testId="vendor-field-code" name="code" defaultValue={v("code", suggestedCode)} readOnly={mode === "edit"} invalid={!!err("code")} />
        </Field>
        <Field testId="vendor-field-status" label={tv.status} error={err("status")}>
          <Select testId="vendor-field-status" name="status" defaultValue={v("status", "active")} options={["active", "pending", "blocked"].map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field testId="vendor-field-name" label={tv.name} error={err("name")}>
          <Input testId="vendor-field-name" name="name" defaultValue={v("name")} invalid={!!err("name")} />
        </Field>
        <Field testId="vendor-field-nameAr" label={tv.nameAr} error={err("nameAr")}>
          <Input testId="vendor-field-nameAr" name="nameAr" defaultValue={v("nameAr")} />
        </Field>
        <Field testId="vendor-field-legalForm" label={tv.legalForm}>
          <Select testId="vendor-field-legalForm" name="legalForm" defaultValue={v("legalForm", "LLC")} options={LEGAL_FORMS.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field testId="vendor-field-category" label={tv.category}>
          <Select testId="vendor-field-category" name="category" defaultValue={v("category", "Office Supplies")} options={CATEGORIES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field testId="vendor-field-crNumber" label={tv.crNumber} error={err("crNumber")} hint="10 digits, mod-11 check digit">
          <Input testId="vendor-field-crNumber" name="crNumber" defaultValue={v("crNumber")} invalid={!!err("crNumber")} />
        </Field>
        <Field testId="vendor-field-crExpiry" label={tv.crExpiry} error={err("crExpiry")}>
          <Input testId="vendor-field-crExpiry" name="crExpiry" type="date" defaultValue={v("crExpiry")} invalid={!!err("crExpiry")} />
        </Field>
        <Field testId="vendor-field-taxId" label={tv.taxId} error={err("taxId")} hint="15 digits, starts with 3, Luhn check digit">
          <Input testId="vendor-field-taxId" name="taxId" defaultValue={v("taxId")} invalid={!!err("taxId")} />
        </Field>
        <Field testId="vendor-field-taxCertExpiry" label={tv.taxCertExpiry} error={err("taxCertExpiry")}>
          <Input testId="vendor-field-taxCertExpiry" name="taxCertExpiry" type="date" defaultValue={v("taxCertExpiry")} invalid={!!err("taxCertExpiry")} />
        </Field>
        <Field testId="vendor-field-iban" label={tv.iban} error={err("iban")}>
          <Input testId="vendor-field-iban" name="iban" defaultValue={v("iban")} invalid={!!err("iban")} />
        </Field>
        <Field testId="vendor-field-bankName" label={tv.bankName} error={err("bankName")}>
          <Input testId="vendor-field-bankName" name="bankName" defaultValue={v("bankName")} />
        </Field>
        <Field testId="vendor-field-swift" label={tv.swift} error={err("swift")}>
          <Input testId="vendor-field-swift" name="swift" defaultValue={v("swift")} />
        </Field>
        <Field testId="vendor-field-currency" label={tv.currency} error={err("currency")}>
          <Input testId="vendor-field-currency" name="currency" defaultValue={v("currency", "SAR")} />
        </Field>
        <Field testId="vendor-field-paymentTermsDays" label={tv.paymentTermsDays} error={err("paymentTermsDays")}>
          <Input testId="vendor-field-paymentTermsDays" name="paymentTermsDays" type="number" min="0" step="1" defaultValue={v("paymentTermsDays", "30")} invalid={!!err("paymentTermsDays")} />
        </Field>
        <Field testId="vendor-field-rating" label={tv.rating} error={err("rating")}>
          <Select testId="vendor-field-rating" name="rating" defaultValue={v("rating", "3")} options={["1", "2", "3", "4", "5"].map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field testId="vendor-field-contactName" label={tv.contactName} error={err("contactName")}>
          <Input testId="vendor-field-contactName" name="contactName" defaultValue={v("contactName")} />
        </Field>
        <Field testId="vendor-field-email" label={tv.email} error={err("email")}>
          <Input testId="vendor-field-email" name="email" type="email" defaultValue={v("email")} invalid={!!err("email")} />
        </Field>
        <Field testId="vendor-field-phone" label={tv.phone} error={err("phone")}>
          <Input testId="vendor-field-phone" name="phone" defaultValue={v("phone")} />
        </Field>
        <Field testId="vendor-field-addressLine" label={tv.addressLine} error={err("addressLine")}>
          <Input testId="vendor-field-addressLine" name="addressLine" defaultValue={v("addressLine")} />
        </Field>
        <Field testId="vendor-field-city" label={tv.city} error={err("city")}>
          <Input testId="vendor-field-city" name="city" defaultValue={v("city")} />
        </Field>
        <Field testId="vendor-field-country" label={tv.country} error={err("country")}>
          <Input testId="vendor-field-country" name="country" defaultValue={v("country", "SA")} />
        </Field>
        <Checkbox testId="vendor-field-blacklisted" name="blacklisted" defaultChecked={v("blacklisted") === "true" || v("blacklisted") === "1"} label={tv.blacklisted} />
      </div>
      <div className="mt-4 flex gap-2">
        <Button testId="vendor-submit" disabled={pending}>
          {t.common.save}
        </Button>
        <LinkButton testId="vendor-cancel" href={vendor ? `/vendors/${encodeURIComponent(vendor.code)}` : "/vendors"} variant="secondary">
          {t.common.cancel}
        </LinkButton>
      </div>
    </form>
  );
}
