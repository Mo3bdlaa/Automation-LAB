"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n";
import { emptyFormState, fieldError, type FormState } from "@/lib/forms";
import { Button, Field, Input, ValidationErrors } from "@/components/ui";
import { submitExtractionAction } from "./actions";
import { INVOICE_FORM_LINES } from "./constants";

export function ExtractionForm({ t, internalNumber, previous, level = 1 }: { t: Dictionary; internalNumber: string; previous: Record<string, string> | null; level?: number }) {
  const bound = submitExtractionAction.bind(null, internalNumber);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, emptyFormState);
  const v = (k: string) => state.values[k] ?? previous?.[k] ?? "";
  const err = (f: string) => fieldError(state, f);
  const tc = t.cycle;
  const head: [string, string, string?][] = [
    ["number", tc.number], ["invoiceDate", tc.invoiceDate, "date"], ["dueDate", tc.dueDate, "date"], ["poNumber", tc.poNumber], ["currency", "Currency"],
    ["vendorName", tc.printedVendorName], ["vendorTaxId", tc.printedVendorTaxId], ["iban", tc.printedIban], ["bankName", tc.printedBankName],
    ["subtotal", t.po.subtotal, "number"], ["taxTotal", t.po.taxTotal, "number"], ["grandTotal", t.po.grandTotal, "number"],
  ];
  return (
    <form key={state.nonce ?? 0} id="extraction-form" data-testid="extraction-form" action={action} noValidate>
      {/* Which difficulty variant the student was looking at, so the grade knows. */}
      <input type="hidden" name="level" value={level} />
      <ValidationErrors violations={state.violations} emptyText={t.common.noValidationErrors} title={tc.matchResult} />
      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-3">
        {head.map(([name, label, type]) => (
          <Field key={name} testId={`extraction-field-${name}`} label={label} error={err(name === "poNumber" ? "poNumber" : name)}>
            <Input testId={`extraction-field-${name}`} name={name} type={type ?? "text"} step={type === "number" ? "0.01" : undefined} defaultValue={v(name)} invalid={!!err(name)} />
          </Field>
        ))}
      </div>
      <h3 className="section-title mb-1 mt-4">{tc.lines}</h3>
      <div className="table-wrap">
        <table id="extraction-lines-form" data-testid="extraction-lines-form" className="al-table">
          <thead>
            <tr>
              <th>#</th>
              <th>PO line</th>
              <th>{t.po.item}</th>
              <th>{t.po.description}</th>
              <th>{t.po.quantity}</th>
              <th>{t.po.uom}</th>
              <th>{t.po.unitPrice}</th>
              <th>VAT %</th>
              <th>{t.po.taxTotal}</th>
              <th>{t.po.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: INVOICE_FORM_LINES }, (_, i) => i + 1).map((n) => (
              <tr key={n} id={`extraction-line-${n}`} data-testid={`extraction-line-${n}`}>
                <td>{n}</td>
                <td>
                  <Input testId={`extraction-field-line-${n}-poLine`} name={`line${n}PoLine`} type="number" step="1" defaultValue={v(`line${n}PoLine`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-itemCode`} name={`line${n}ItemCode`} defaultValue={v(`line${n}ItemCode`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-description`} name={`line${n}Description`} defaultValue={v(`line${n}Description`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-quantity`} name={`line${n}Quantity`} type="number" step="0.001" defaultValue={v(`line${n}Quantity`)} invalid={!!err(`lines[${n}].quantity`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-uom`} name={`line${n}Uom`} defaultValue={v(`line${n}Uom`)} invalid={!!err(`lines[${n}].uom`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-unitPrice`} name={`line${n}UnitPrice`} type="number" step="0.0001" defaultValue={v(`line${n}UnitPrice`)} invalid={!!err(`lines[${n}].unitPrice`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-taxRate`} name={`line${n}TaxRate`} type="number" step="0.1" defaultValue={v(`line${n}TaxRate`)} invalid={!!err(`lines[${n}].taxRate`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-taxAmount`} name={`line${n}TaxAmount`} type="number" step="0.01" defaultValue={v(`line${n}TaxAmount`)} />
                </td>
                <td>
                  <Input testId={`extraction-field-line-${n}-lineTotal`} name={`line${n}LineTotal`} type="number" step="0.01" defaultValue={v(`line${n}LineTotal`)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Button testId="extraction-submit" disabled={pending}>
          {tc.submitExtraction}
        </Button>
      </div>
    </form>
  );
}
