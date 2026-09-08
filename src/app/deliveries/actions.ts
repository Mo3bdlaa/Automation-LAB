"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { deliveryNoteLines, deliveryNotes } from "@/db/schema";
import { requireLab } from "@/lib/auth/server";
import { postGoodsReceipt, refuseDelivery, type GrnLineInput } from "@/lib/services/grns";
import { failedState, formValues, num, str, type FormState } from "@/lib/forms";
import { CORPUS_TODAY } from "@/lib/generator/dates";

export async function postGrnAction(deliveryNoteId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const dnLines = await session.tdb.list(deliveryNoteLines, { where: eq(deliveryNoteLines.deliveryNoteId, deliveryNoteId), orderBy: [{ column: deliveryNoteLines.lineNo }] });
  const lines: GrnLineInput[] = dnLines.map((l) => {
    const received = num(values, `line${l.lineNo}Received`, 0);
    const rejected = num(values, `line${l.lineNo}Rejected`, 0);
    const accepted = num(values, `line${l.lineNo}Accepted`, NaN);
    return { lineNo: l.lineNo, quantityReceived: received, quantityRejected: rejected, quantityAccepted: Number.isNaN(accepted) ? received - rejected : accepted, rejectionReason: str(values, `line${l.lineNo}Reason`) || null };
  });
  const result = await postGoodsReceipt(session, deliveryNoteId, { lines, receivedDate: str(values, "receivedDate", CORPUS_TODAY), notes: str(values, "notes") || null });
  if (!result.ok) return failedState(result.violations ?? [{ ruleId: result.error.toUpperCase(), severity: "error", message: result.message }], values);
  redirect(`/grns/${encodeURIComponent(result.number)}?posted=1`);
}

/**
 * Records a refusal from the screens. An over-delivery is not received, and a
 * warehouse that simply leaves it alone looks identical to one that never got
 * to it - so the decision needs a button.
 */
export async function refuseDeliveryAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const id = String(formData.get("deliveryNoteId") ?? "");
  const dn = await session.tdb.one(deliveryNotes, eq(deliveryNotes.id, id));
  if (!dn) redirect("/deliveries");
  const reason = String(formData.get("reason") ?? "").trim() || "Refused at the dock";
  const result = await refuseDelivery(session, dn, reason, ["GRN-OVER-PO"]);
  redirect(`/deliveries/${id}?${result.ok ? "refused=1" : "problem=1"}`);
}
