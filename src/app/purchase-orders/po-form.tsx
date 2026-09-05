"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n";
import { emptyFormState, fieldError, type FormState } from "@/lib/forms";
import { Button, Field, Input, LinkButton, Select, ValidationErrors } from "@/components/ui";
import { createPurchaseOrderAction } from "./actions";
import { PO_FORM_LINES } from "./constants";

export interface PoFormOptions {
  vendors: { value: string; label: string }[];
  buyers: { value: string; label: string }[];
  requesters: { value: string; label: string }[];
  approvers: { value: string; label: string }[];
  costCenters: { value: string; label: string }[];
  deliveryLocations: { value: string; label: string }[];
  today: string;
}

export function PoForm({ t, options }: { t: Dictionary; options: PoFormOptions }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createPurchaseOrderAction, emptyFormState);
  const v = (key: string, fallback = "") => state.values[key] ?? fallback;
  const err = (f: string) => fieldError(state, f);
  const tp = t.po;
  const lineErr = (n: number, f: string) => err(`lines[${n}].${f}`);
  return (
    <form key={state.nonce ?? 0} id="po-form" data-testid="po-form" action={action} noValidate>
      <ValidationErrors violations={state.violations} emptyText={t.common.noValidationErrors} title={t.common.validationErrors} />
      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <Field testId="po-field-vendorCode" label={tp.vendor} error={err("vendorCode")}>
          <Select testId="po-field-vendorCode" name="vendorCode" defaultValue={v("vendorCode")} options={options.vendors} allowBlank invalid={!!err("vendorCode")} />
        </Field>
        <Field testId="po-field-orderDate" label={tp.orderDate} error={err("orderDate")}>
          <Input testId="po-field-orderDate" name="orderDate" type="date" defaultValue={v("orderDate", options.today)} />
        </Field>
        <Field testId="po-field-expectedDeliveryDate" label={tp.expectedDeliveryDate} error={err("expectedDeliveryDate")}>
          <Input testId="po-field-expectedDeliveryDate" name="expectedDeliveryDate" type="date" defaultValue={v("expectedDeliveryDate", options.today)} invalid={!!err("expectedDeliveryDate")} />
        </Field>
        <Field testId="po-field-buyerCode" label={tp.buyer}>
          <Select testId="po-field-buyerCode" name="buyerCode" defaultValue={v("buyerCode")} options={options.buyers} allowBlank />
        </Field>
        <Field testId="po-field-requesterCode" label={tp.requester}>
          <Select testId="po-field-requesterCode" name="requesterCode" defaultValue={v("requesterCode")} options={options.requesters} allowBlank />
        </Field>
        <Field testId="po-field-approverCode" label={tp.approver} error={err("approverCode")}>
          <Select testId="po-field-approverCode" name="approverCode" defaultValue={v("approverCode")} options={options.approvers} allowBlank invalid={!!err("approverCode")} />
        </Field>
        <Field testId="po-field-costCenterCode" label={tp.costCenter}>
          <Select testId="po-field-costCenterCode" name="costCenterCode" defaultValue={v("costCenterCode")} options={options.costCenters} allowBlank />
        </Field>
        <Field testId="po-field-deliveryLocationCode" label={tp.deliveryLocation}>
          <Select testId="po-field-deliveryLocationCode" name="deliveryLocationCode" defaultValue={v("deliveryLocationCode")} options={options.deliveryLocations} allowBlank />
        </Field>
        <Field testId="po-field-notes" label={tp.notes}>
          <Input testId="po-field-notes" name="notes" defaultValue={v("notes")} />
        </Field>
      </div>

      <h2 className="mb-1 mt-5 text-lg font-semibold text-primary">{tp.lines}</h2>
      <p className="mb-2 text-xs text-muted">{tp.lineHint}</p>
      <div className="overflow-x-auto">
        <table id="po-lines-form" data-testid="po-lines-form" className="al-table">
          <thead>
            <tr>
              <th>{tp.line}</th>
              <th>{tp.item}</th>
              <th>{tp.quantity}</th>
              <th>{tp.uom}</th>
              <th>{tp.unitPrice}</th>
              <th>{tp.discount}</th>
              <th>{tp.taxCode}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PO_FORM_LINES }, (_, i) => i + 1).map((n) => {
              const anyErr = ["itemCode", "quantity", "unitPrice", "uom", "taxCode"].some((f) => lineErr(n, f));
              return (
                <tr key={n} id={`po-line-${n}`} data-testid={`po-line-${n}`} data-invalid={anyErr ? "1" : "0"}>
                  <td>{n}</td>
                  <td>
                    <Input testId={`po-field-line-${n}-itemCode`} name={`line${n}ItemCode`} defaultValue={v(`line${n}ItemCode`)} placeholder="ITM-000123" invalid={!!lineErr(n, "itemCode")} />
                  </td>
                  <td>
                    <Input testId={`po-field-line-${n}-quantity`} name={`line${n}Quantity`} type="number" step="0.001" min="0" defaultValue={v(`line${n}Quantity`)} invalid={!!lineErr(n, "quantity")} />
                  </td>
                  <td>
                    <Input testId={`po-field-line-${n}-uom`} name={`line${n}Uom`} defaultValue={v(`line${n}Uom`)} placeholder="EA" invalid={!!lineErr(n, "uom")} />
                  </td>
                  <td>
                    <Input testId={`po-field-line-${n}-unitPrice`} name={`line${n}UnitPrice`} type="number" step="0.0001" min="0" defaultValue={v(`line${n}UnitPrice`)} invalid={!!lineErr(n, "unitPrice")} />
                  </td>
                  <td>
                    <Input testId={`po-field-line-${n}-discountPct`} name={`line${n}DiscountPct`} type="number" step="0.01" min="0" defaultValue={v(`line${n}DiscountPct`)} />
                  </td>
                  <td>
                    <Input testId={`po-field-line-${n}-taxCode`} name={`line${n}TaxCode`} defaultValue={v(`line${n}TaxCode`)} placeholder="S15" invalid={!!lineErr(n, "taxCode")} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-2">
        <Button testId="po-submit" disabled={pending}>
          {tp.createPo}
        </Button>
        <LinkButton testId="po-cancel" href="/purchase-orders" variant="secondary">
          {t.common.cancel}
        </LinkButton>
      </div>
    </form>
  );
}
