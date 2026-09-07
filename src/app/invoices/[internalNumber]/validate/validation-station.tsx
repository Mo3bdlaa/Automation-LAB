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

export interface FieldBoxView {
  field: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ValidationStation({
  t,
  internalNumber,
  documentUrl,
  documentReady = true,
  level = 1,
  levels = [],
  levelHrefBase,
  boxes = [],
  fields,
  confidence,
  violations,
}: {
  t: Dictionary;
  internalNumber: string;
  documentUrl: string | null;
  documentReady?: boolean;
  level?: number;
  levels?: { level: number; label: string }[];
  levelHrefBase?: string;
  boxes?: FieldBoxView[];
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
  const firstPage = boxes.filter((b) => b.page === 1);

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
      {/* The difficulty variant this correction was read from. */}
      <input type="hidden" name="level" value={level} />
      <ValidationErrors violations={state.violations.length ? state.violations : violations} emptyText={t.common.noValidationErrors} title={t.cycle.matchResult} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="al-card" id="validation-document" data-testid="validation-document" data-level={level}>
          <h2 className="mb-2">{t.cycle.documentPane}</h2>
          {levels.length && levelHrefBase ? (
            <p id="validation-levels" data-testid="validation-levels" className="mb-2 text-sm">
              <span className="text-muted">{t.cycle.difficulty}: </span>
              {levels.map((l) => (
                <a
                  key={l.level}
                  id={`validation-level-${l.level}`}
                  data-testid={`validation-level-${l.level}`}
                  data-current={l.level === level ? "1" : "0"}
                  href={`${levelHrefBase}${l.level > 1 ? `?level=${l.level}` : ""}`}
                  className={l.level === level ? "mr-2 font-semibold" : "mr-2"}
                >
                  L{l.level} {l.label}
                </a>
              ))}
            </p>
          ) : null}
          {!documentReady ? (
            <p id="validation-document-rendering" data-testid="validation-document-rendering" className="mb-2 text-sm text-warning">
              {t.common.rendering}
            </p>
          ) : null}
          {firstPage.length ? (
            // Where each field sits on the page at this level. The map is the
            // same geometry the grader stores, carried through the degradation.
            <div id="validation-field-map" data-testid="validation-field-map" data-boxes={firstPage.length} className="relative mb-2 w-full overflow-hidden rounded border border-border bg-surface" style={{ aspectRatio: "210 / 297" }}>
              {firstPage.map((b) => (
                <span
                  key={b.field}
                  data-testid={`validation-box-${b.field}`}
                  title={b.field}
                  className="absolute border border-accent bg-accent/10"
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${Math.max(b.w, 0.01) * 100}%`, height: `${Math.max(b.h, 0.004) * 100}%` }}
                />
              ))}
            </div>
          ) : null}
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
