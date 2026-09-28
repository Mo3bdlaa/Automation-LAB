"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n";
import { emptyFormState, fieldError, type FormState } from "@/lib/forms";
import { Button, Field, Input, LinkButton, Select, ValidationErrors } from "@/components/ui";
import { AddLineButton, RemoveLineButton, RemoveLineHeader, useLineRows } from "@/components/line-rows";
import { recordInvoiceAction } from "./actions";
import { INVOICE_FORM_MAX_LINES } from "./constants";

export interface InvoiceEntryDefaults {
  poNumber: string;
  vendorCode: string;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  printedVendorName: string;
  printedVendorTaxId: string;
  printedIban: string;
  printedBankName: string;
  lines: { itemCode: string; description: string; quantity: string; uom: string; unitPrice: string; discountPct: string; taxCode: string }[];
}

/**
 * Accounts payable invoice entry: the invoice is in your hand, you key it
 * against the order.
 *
 * Everything is prefilled from the purchase order when there is one, because
 * the interesting exercise is not typing a clean invoice — it is changing one
 * figure and watching which rule fires. What is typed is kept as typed: the
 * printed vendor details and the totals go to the match exactly as entered.
 */
export function InvoiceForm({ t, vendors, defaults }: { t: Dictionary; vendors: { value: string; label: string }[]; defaults: InvoiceEntryDefaults }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordInvoiceAction, emptyFormState);
  const err = (f: string) => fieldError(state, f);
  const tc = t.cycle;
  const tp = t.po;
  const v = (key: string, fallback = "") => state.values[key] ?? fallback;
  const rows = useLineRows({ start: Math.max(1, defaults.lines.length), max: INVOICE_FORM_MAX_LINES, values: state.values });
  const line = (n: number, field: keyof InvoiceEntryDefaults["lines"][number]) => v(`line${n}${field[0].toUpperCase()}${field.slice(1)}`, defaults.lines[n - 1]?.[field] ?? "");

  return (
    <form key={state.nonce ?? 0} id="invoice-form" data-testid="invoice-form" action={action} noValidate>
      <ValidationErrors violations={state.violations} emptyText={t.common.noValidationErrors} title={t.common.validationErrors} />
      <p className="mb-2 text-sm text-muted">{tc.recordInvoiceIntro}</p>

      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-3">
        <Field testId="invoice-field-number" label={tc.number} error={err("number")}>
          <Input testId="invoice-field-number" name="number" defaultValue={v("number")} placeholder="TI-7841119" invalid={!!err("number")} />
        </Field>
        <Field testId="invoice-field-poNumber" label={tc.poNumber} error={err("poNumber")}>
          <Input testId="invoice-field-poNumber" name="poNumber" defaultValue={v("poNumber", defaults.poNumber)} placeholder="PO-2026-05057" invalid={!!err("poNumber")} />
        </Field>
        <Field testId="invoice-field-vendorCode" label={tc.vendor} error={err("vendorCode")}>
          <Select testId="invoice-field-vendorCode" name="vendorCode" defaultValue={v("vendorCode", defaults.vendorCode)} options={vendors} allowBlank invalid={!!err("vendorCode")} />
        </Field>
        <Field testId="invoice-field-invoiceDate" label={tc.invoiceDate}>
          <Input testId="invoice-field-invoiceDate" name="invoiceDate" type="date" defaultValue={v("invoiceDate", defaults.invoiceDate)} />
        </Field>
        <Field testId="invoice-field-dueDate" label={tc.dueDate}>
          <Input testId="invoice-field-dueDate" name="dueDate" type="date" defaultValue={v("dueDate", defaults.dueDate)} />
        </Field>
        <Field testId="invoice-field-currency" label="Currency">
          <Input testId="invoice-field-currency" name="currency" defaultValue={v("currency", defaults.currency)} placeholder="SAR" />
        </Field>
      </div>

      <h2 className="mb-1 mt-5 text-lg font-semibold text-primary">{tc.printedDetails}</h2>
      <p className="mb-2 text-xs text-muted">{tc.printedDetailsHint}</p>
      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-4">
        <Field testId="invoice-field-printedVendorName" label={tc.printedVendorName}>
          <Input testId="invoice-field-printedVendorName" name="printedVendorName" defaultValue={v("printedVendorName", defaults.printedVendorName)} />
        </Field>
        <Field testId="invoice-field-printedVendorTaxId" label={tc.printedVendorTaxId}>
          <Input testId="invoice-field-printedVendorTaxId" name="printedVendorTaxId" defaultValue={v("printedVendorTaxId", defaults.printedVendorTaxId)} />
        </Field>
        <Field testId="invoice-field-printedIban" label={tc.printedIban}>
          <Input testId="invoice-field-printedIban" name="printedIban" defaultValue={v("printedIban", defaults.printedIban)} />
        </Field>
        <Field testId="invoice-field-printedBankName" label={tc.printedBankName}>
          <Input testId="invoice-field-printedBankName" name="printedBankName" defaultValue={v("printedBankName", defaults.printedBankName)} />
        </Field>
      </div>

      <h2 className="mb-1 mt-5 text-lg font-semibold text-primary">{tc.lines}</h2>
      <p className="mb-2 text-xs text-muted">{tp.lineHint}</p>
      <div className="table-wrap">
        <table id="invoice-lines-form" data-testid="invoice-lines-form" data-lines={rows.count} className="al-table">
          <thead>
            <tr>
              <th>{tp.line}</th>
              <th>{tp.item}</th>
              <th>{tp.description}</th>
              <th>{tp.quantity}</th>
              <th>{tp.uom}</th>
              <th>{tp.unitPrice}</th>
              <th>{tp.discount}</th>
              <th>{tp.taxCode}</th>
              <RemoveLineHeader label={t.common.removeLine} />
            </tr>
          </thead>
          <tbody>
            {rows.keys.map((key, idx) => {
              const n = idx + 1;
              return (
                <tr key={key} id={`invoice-line-${n}`} data-testid={`invoice-line-${n}`}>
                  <td>{n}</td>
                  <td>
                    <Input testId={`invoice-field-line-${n}-itemCode`} name={`line${n}ItemCode`} defaultValue={line(n, "itemCode")} placeholder="ITM-000123" />
                  </td>
                  <td>
                    <Input testId={`invoice-field-line-${n}-description`} name={`line${n}Description`} defaultValue={line(n, "description")} />
                  </td>
                  <td>
                    <Input testId={`invoice-field-line-${n}-quantity`} name={`line${n}Quantity`} type="number" step="0.001" min="0" defaultValue={line(n, "quantity")} />
                  </td>
                  <td>
                    <Input testId={`invoice-field-line-${n}-uom`} name={`line${n}Uom`} defaultValue={line(n, "uom")} placeholder="EA" />
                  </td>
                  <td>
                    <Input testId={`invoice-field-line-${n}-unitPrice`} name={`line${n}UnitPrice`} type="number" step="0.0001" min="0" defaultValue={line(n, "unitPrice")} />
                  </td>
                  <td>
                    <Input testId={`invoice-field-line-${n}-discountPct`} name={`line${n}DiscountPct`} type="number" step="0.01" min="0" defaultValue={line(n, "discountPct")} />
                  </td>
                  <td>
                    <Input testId={`invoice-field-line-${n}-taxCode`} name={`line${n}TaxCode`} defaultValue={line(n, "taxCode")} placeholder="S15" />
                  </td>
                  <td>
                    <RemoveLineButton entity="invoice" label={t.common.removeLine} n={n} rowKey={key} rows={rows} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.countField}
      <AddLineButton entity="invoice" label={t.common.addLine} rows={rows} />

      <h2 className="mb-1 mt-5 text-lg font-semibold text-primary">{tc.totals}</h2>
      <p className="mb-2 text-xs text-muted">{tc.totalsHint}</p>
      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-3">
        <Field testId="invoice-field-subtotal" label={tp.subtotal}>
          <Input testId="invoice-field-subtotal" name="subtotal" type="number" step="0.01" defaultValue={v("subtotal")} />
        </Field>
        <Field testId="invoice-field-taxTotal" label={tp.taxTotal}>
          <Input testId="invoice-field-taxTotal" name="taxTotal" type="number" step="0.01" defaultValue={v("taxTotal")} />
        </Field>
        <Field testId="invoice-field-grandTotal" label={tp.grandTotal}>
          <Input testId="invoice-field-grandTotal" name="grandTotal" type="number" step="0.01" defaultValue={v("grandTotal")} />
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
        <Button testId="invoice-submit" disabled={pending}>
          {tc.recordInvoice}
        </Button>
        <LinkButton testId="invoice-cancel" href="/invoices" variant="secondary">
          {t.common.cancel}
        </LinkButton>
      </div>
    </form>
  );
}
