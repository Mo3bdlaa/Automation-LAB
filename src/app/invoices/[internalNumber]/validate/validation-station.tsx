"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n";
import { emptyFormState, fieldError, type FormState } from "@/lib/forms";
import { Button, Input, ValidationErrors } from "@/components/ui";
import { submitExtractionAction } from "../../actions";
import { INVOICE_FORM_LINES } from "../../constants";
import type { Violation } from "@/lib/validation/engine";

/** Confidence at or below this is flagged for a human to check. */
const LOW_CONFIDENCE = 0.85;

const HEADER: [string, keyof Dictionary["cycle"] | keyof Dictionary["po"], string][] = [
  ["number", "number", "number"],
  ["invoiceDate", "invoiceDate", "invoiceDate"],
  ["dueDate", "dueDate", "dueDate"],
  ["poNumber", "poNumber", "poNumber"],
  ["currency", "printedIban", "currency"],
  ["vendorName", "printedVendorName", "vendor.name"],
  ["vendorTaxId", "printedVendorTaxId", "vendor.taxId"],
  ["iban", "printedIban", "vendor.iban"],
  ["bankName", "printedBankName", "vendor.bankName"],
  ["subtotal", "amount", "subtotal"],
  ["taxTotal", "amount", "taxTotal"],
  ["grandTotal", "amount", "grandTotal"],
];

const LINE_FIELDS: [string, string][] = [
  ["ItemCode", "itemCode"],
  ["Description", "description"],
  ["Quantity", "quantity"],
  ["Uom", "uom"],
  ["UnitPrice", "unitPrice"],
  ["TaxRate", "taxRate"],
  ["TaxAmount", "taxAmount"],
  ["LineTotal", "lineTotal"],
];

export function ValidationStation({
  t,
  internalNumber,
  documentUrl,
  fields,
  confidence,
  violations,
}: {
  t: Dictionary;
  internalNumber: string;
  documentUrl: string | null;
  fields: Record<string, string>;
  confidence: Record<string, number>;
  violations: Violation[];
}) {
  const bound = submitExtractionAction.bind(null, internalNumber);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, emptyFormState);
  const v = (k: string) => state.values[k] ?? fields[k] ?? "";
  const conf = (truthKey: string) => confidence[truthKey];
  const low = (truthKey: string) => conf(truthKey) !== undefined && conf(truthKey) <= LOW_CONFIDENCE;
  const err = (f: string) => fieldError(state, f);
  const usedLines = Array.from({ length: INVOICE_FORM_LINES }, (_, i) => i + 1).filter((n) => LINE_FIELDS.some(([suffix]) => (fields[`line${n}${suffix}`] ?? "").trim()));

  const Cell = ({ formKey, truthKey, label }: { formKey: string; truthKey: string; label: string }) => (
    <div id={`validate-field-${formKey}-group`} data-testid={`validate-field-${formKey}-group`} data-low-confidence={low(truthKey) ? "1" : "0"} className={`mb-3 rounded p-1 ${low(truthKey) ? "bg-[#fdf6e7] ring-1 ring-warning" : ""}`}>
      <label htmlFor={`validate-field-${formKey}`} className="al-label flex items-center justify-between gap-2">
        <span>{label}</span>
        {conf(truthKey) !== undefined ? (
          <span data-testid={`validate-confidence-${formKey}`} className={`text-[11px] ${low(truthKey) ? "text-warning" : "text-muted"}`}>
            {t.cycle.confidence} {(conf(truthKey)! * 100).toFixed(0)}%
          </span>
        ) : null}
      </label>
      <Input testId={`validate-field-${formKey}`} name={formKey} defaultValue={v(formKey)} invalid={!!err(truthKey)} />
    </div>
  );

  return (
    <form key={state.nonce ?? 0} id="validation-station-form" data-testid="validation-station-form" action={action} noValidate>
      <ValidationErrors violations={state.violations.length ? state.violations : violations} emptyText={t.common.noValidationErrors} title={t.cycle.matchResult} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="al-card" id="validation-document" data-testid="validation-document">
          <h2 className="mb-2">{t.cycle.documentPane}</h2>
          {documentUrl ? (
            <object data={documentUrl} type="application/pdf" className="h-[36rem] w-full rounded border border-border" aria-label={t.cycle.documentPane}>
              <a href={documentUrl} id="validation-document-fallback" data-testid="validation-document-fallback">
                {t.common.download}
              </a>
            </object>
          ) : (
            <p className="text-sm text-muted">{t.common.notRendered}</p>
          )}
        </section>
        <section className="al-card" id="validation-fields" data-testid="validation-fields">
          <h2 className="mb-2">{t.cycle.extraction}</h2>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {HEADER.map(([formKey, , truthKey]) => (
              <Cell key={formKey} formKey={formKey} truthKey={truthKey} label={formKey} />
            ))}
          </div>
        </section>
      </div>

      <h3 className="section-title mb-2 mt-4">{t.cycle.lines}</h3>
      <div className="table-wrap">
        <table id="validation-lines" data-testid="validation-lines" className="al-table">
          <thead>
            <tr>
              <th>#</th>
              {LINE_FIELDS.map(([suffix]) => (
                <th key={suffix}>{suffix}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usedLines.map((n) => (
              <tr key={n} id={`validation-line-${n}`} data-testid={`validation-line-${n}`}>
                <td>{n}</td>
                {LINE_FIELDS.map(([suffix, leaf]) => {
                  const truthKey = `lines[${n - 1}].${leaf}`;
                  return (
                    <td key={suffix} data-low-confidence={low(truthKey) ? "1" : "0"} className={low(truthKey) ? "bg-[#fdf6e7]" : ""}>
                      <Input testId={`validate-field-line-${n}-${leaf}`} name={`line${n}${suffix}`} defaultValue={v(`line${n}${suffix}`)} invalid={!!err(truthKey)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Button testId="validation-submit" disabled={pending}>
          {t.cycle.submitExtraction}
        </Button>
      </div>
    </form>
  );
}
