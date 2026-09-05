"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray, like } from "drizzle-orm";
import { deliveryNoteLines, deliveryNotes, documents, grnLines, grns, groundTruth, purchaseOrderLines, purchaseOrders } from "@/db/schema";
import { requireLab, audit } from "@/lib/auth/server";
import { runRules } from "@/lib/validation/engine";
import { grnRules } from "@/lib/validation/matching";
import { failedState, formValues, num, str, type FormState } from "@/lib/forms";
import { CORPUS_TODAY } from "@/lib/generator/dates";
import { enqueue } from "@/lib/jobs/queue";
import { kickJobs } from "@/lib/jobs/runner";

/** Warehouse posts a goods receipt against a delivery note. */
export async function postGrnAction(deliveryNoteId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const dn = await session.tdb.one(deliveryNotes, eq(deliveryNotes.id, deliveryNoteId));
  if (!dn || session.tdb.isReadOnlyRow(dn)) return failedState([{ ruleId: "DN-NOT-FOUND", severity: "error", message: "Delivery note not found." }], values);
  const existing = await session.tdb.one(grns, eq(grns.deliveryNoteId, dn.id));
  if (existing) return failedState([{ ruleId: "GRN-EXISTS", severity: "error", message: `Goods receipt ${existing.number} already posted for this delivery note.` }], values);
  const dnLines = await session.tdb.list(deliveryNoteLines, { where: eq(deliveryNoteLines.deliveryNoteId, dn.id), orderBy: [{ column: deliveryNoteLines.lineNo }] });
  const poLines = await session.tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, dn.purchaseOrderId), orderBy: [{ column: purchaseOrderLines.lineNo }] });
  const posted = await session.tdb.list(grns, { where: and(eq(grns.purchaseOrderId, dn.purchaseOrderId), eq(grns.status, "posted"))! });
  const postedLines = posted.length ? await session.tdb.list(grnLines, { where: inArray(grnLines.grnId, posted.map((g) => g.id)) }) : [];
  const already = new Map<number, number>();
  for (const l of postedLines) {
    const pl = poLines.find((p) => p.id === l.purchaseOrderLineId);
    if (pl) already.set(pl.lineNo, (already.get(pl.lineNo) ?? 0) + Number(l.quantityReceived));
  }
  const lines = dnLines.map((l) => {
    const pl = poLines.find((p) => p.id === l.purchaseOrderLineId);
    const received = num(values, `line${l.lineNo}Received`, 0);
    const rejected = num(values, `line${l.lineNo}Rejected`, 0);
    const acceptedRaw = num(values, `line${l.lineNo}Accepted`, NaN);
    const accepted = Number.isNaN(acceptedRaw) ? received - rejected : acceptedRaw;
    return { dnLine: l, poLineNo: pl?.lineNo ?? -1, lineNo: l.lineNo, quantityReceived: received, quantityAccepted: accepted, quantityRejected: rejected, reason: str(values, `line${l.lineNo}Reason`) };
  });
  const result = runRules(grnRules, { poLines: poLines.map((p) => ({ lineNo: p.lineNo, quantity: Number(p.quantity), uom: p.uom })), alreadyReceived: already, lines });
  if (!result.ok) return failedState(result.violations, values);

  const year = CORPUS_TODAY.slice(0, 4);
  const [last] = await session.tdb.list(grns, { where: and(eq(grns.tenantId, session.tenant.id), like(grns.number, `GRN-${year}-9%`))!, orderBy: [{ column: grns.number, direction: "desc" }], limit: 1 });
  const seq = last ? Number(last.number.slice(-5)) + 1 : 90001;
  const number = `GRN-${year}-${String(seq).padStart(5, "0")}`;
  const receivedDate = str(values, "receivedDate", CORPUS_TODAY);
  const used = lines.filter((l) => l.quantityReceived > 0);
  await session.tdb.transaction(async (tx) => {
    const [g] = await tx.insert(grns, { number, purchaseOrderId: dn.purchaseOrderId, deliveryNoteId: dn.id, vendorId: dn.vendorId, receivedDate, deliveryLocationId: dn.deliveryLocationId, receivedById: null, status: "posted", notes: str(values, "notes") || null });
    await tx.insert(
      grnLines,
      used.map((l, i) => ({ grnId: g.id, lineNo: i + 1, purchaseOrderLineId: l.dnLine.purchaseOrderLineId, itemId: l.dnLine.itemId, description: l.dnLine.description, quantityReceived: String(l.quantityReceived), quantityAccepted: String(l.quantityAccepted), quantityRejected: String(l.quantityRejected), uom: l.dnLine.uom, rejectionReason: l.reason || null })),
    );
    await tx.update(deliveryNotes, { status: "received", updatedAt: new Date() }, eq(deliveryNotes.id, dn.id));
    // PO status follows receipts.
    const totalOrdered = poLines.reduce((a, p) => a + Number(p.quantity), 0);
    const totalReceived = [...already.values()].reduce((a, b) => a + b, 0) + used.reduce((a, l) => a + l.quantityReceived, 0);
    await tx.update(purchaseOrders, { status: totalReceived + 1e-9 >= totalOrdered ? "received" : "partially_received", updatedAt: new Date() }, eq(purchaseOrders.id, dn.purchaseOrderId));
    const [po] = await tx.list(purchaseOrders, { where: eq(purchaseOrders.id, dn.purchaseOrderId) });
    const [doc] = await tx.insert(documents, { kind: "grn", number, sourceId: g.id, vendorId: dn.vendorId, language: "bilingual" });
    await tx.insert(groundTruth, [
      { documentId: doc.id, field: "number", value: number },
      { documentId: doc.id, field: "poNumber", value: po?.number ?? "" },
      { documentId: doc.id, field: "deliveryNoteNumber", value: dn.number },
      { documentId: doc.id, field: "receivedDate", value: receivedDate },
      { documentId: doc.id, field: "lineCount", value: String(used.length) },
      ...used.flatMap((l, i) => [
        { documentId: doc.id, field: `lines[${i}].quantityReceived`, value: String(l.quantityReceived) },
        { documentId: doc.id, field: `lines[${i}].quantityAccepted`, value: String(l.quantityAccepted) },
        { documentId: doc.id, field: `lines[${i}].quantityRejected`, value: String(l.quantityRejected) },
      ]),
    ]);
    await enqueue("render_document", { documentId: doc.id }, { tenantId: session.tenant.id, priority: 5 });
  });
  kickJobs();
  await audit(session, "grn.post", "grn", number, { deliveryNote: dn.number, lines: used.length });
  redirect(`/grns/${encodeURIComponent(number)}?posted=1`);
}
