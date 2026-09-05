"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n";
import { emptyFormState, fieldError, type FormState } from "@/lib/forms";
import { Button, Field, Input, ValidationErrors } from "@/components/ui";
import { postGrnAction } from "./actions";

export function GrnForm({ t, deliveryNoteId, today, lines }: { t: Dictionary; deliveryNoteId: string; today: string; lines: { lineNo: number; poLineNo: number | null; itemCode: string | null; description: string; quantity: string; uom: string }[] }) {
  const bound = postGrnAction.bind(null, deliveryNoteId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, emptyFormState);
  const v = (k: string, fallback = "") => state.values[k] ?? fallback;
  const err = (f: string) => fieldError(state, f);
  const tc = t.cycle;
  return (
    <form key={state.nonce ?? 0} id="grn-form" data-testid="grn-form" action={action} noValidate>
      <ValidationErrors violations={state.violations} emptyText={t.common.noValidationErrors} title={t.common.validationErrors} />
      <div className="al-card grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <Field testId="grn-field-receivedDate" label={tc.receivedDate}>
          <Input testId="grn-field-receivedDate" name="receivedDate" type="date" defaultValue={v("receivedDate", today)} />
        </Field>
        <Field testId="grn-field-notes" label={t.po.notes}>
          <Input testId="grn-field-notes" name="notes" defaultValue={v("notes")} />
        </Field>
      </div>
      <div className="table-wrap mt-3">
        <table id="grn-lines-form" data-testid="grn-lines-form" className="al-table">
          <thead>
            <tr>
              <th>#</th>
              <th>PO line</th>
              <th>{t.po.item}</th>
              <th>{t.po.description}</th>
              <th className="num">{tc.shipped}</th>
              <th>{t.po.uom}</th>
              <th>{tc.quantityReceived}</th>
              <th>{tc.quantityAccepted}</th>
              <th>{tc.quantityRejected}</th>
              <th>{tc.rejectionReason}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.lineNo} id={`grn-line-${l.lineNo}`} data-testid={`grn-line-${l.lineNo}`}>
                <td>{l.lineNo}</td>
                <td>{l.poLineNo ?? ""}</td>
                <td>{l.itemCode ?? ""}</td>
                <td>{l.description}</td>
                <td className="num">{l.quantity}</td>
                <td>{l.uom}</td>
                <td>
                  <Input testId={`grn-field-line-${l.lineNo}-received`} name={`line${l.lineNo}Received`} type="number" step="0.001" min="0" defaultValue={v(`line${l.lineNo}Received`, l.quantity)} invalid={!!err(`lines[${l.lineNo}].quantityReceived`)} />
                </td>
                <td>
                  <Input testId={`grn-field-line-${l.lineNo}-accepted`} name={`line${l.lineNo}Accepted`} type="number" step="0.001" min="0" defaultValue={v(`line${l.lineNo}Accepted`)} placeholder="= received − rejected" invalid={!!err(`lines[${l.lineNo}].quantityAccepted`)} />
                </td>
                <td>
                  <Input testId={`grn-field-line-${l.lineNo}-rejected`} name={`line${l.lineNo}Rejected`} type="number" step="0.001" min="0" defaultValue={v(`line${l.lineNo}Rejected`, "0")} />
                </td>
                <td>
                  <Input testId={`grn-field-line-${l.lineNo}-reason`} name={`line${l.lineNo}Reason`} defaultValue={v(`line${l.lineNo}Reason`)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Button testId="grn-submit" disabled={pending}>
          {tc.postGrn}
        </Button>
      </div>
    </form>
  );
}
