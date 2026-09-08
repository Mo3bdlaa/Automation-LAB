/**
 * Goods receipt posting. Shared by the warehouse screen and POST /api/grns.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { deliveryNoteLines, deliveryNotes, documents, grnLines, grns, groundTruth, purchaseOrderLines, purchaseOrders, type DeliveryNote } from "@/db/schema";
import type { LabSession } from "@/lib/auth/server";
import { audit } from "@/lib/auth/server";
import { runRules } from "@/lib/validation/engine";
import { grnRules } from "@/lib/validation/matching";
import type { Violation } from "@/lib/validation/engine";
import { CORPUS_TODAY } from "@/lib/generator/dates";
import { enqueue } from "@/lib/jobs/queue";
import { kickJobs } from "@/lib/jobs/runner";

export interface GrnLineInput {
  /** Delivery note line number. */
  lineNo: number;
  quantityReceived: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  rejectionReason?: string | null;
}

export type GrnResult =
  | { ok: true; number: string; documentId: string }
  | { ok: false; error: "not_found" | "already_posted" | "read_only" | "validation_failed"; message: string; violations?: Violation[] };

/**
 * Records that a delivery was not received, and why.
 *
 * Refusing an over-delivery is the right answer in the warehouse process, but
 * doing nothing looks exactly like never getting to it. This gives that
 * decision somewhere to live for a person working the screens, the same way a
 * robot records it as a business exception on the queue item.
 */
export async function refuseDelivery(session: LabSession, dn: DeliveryNote, reason: string, ruleIds: string[] = []): Promise<{ ok: true } | { ok: false; message: string }> {
  if (session.tdb.isReadOnlyRow(dn)) return { ok: false, message: "Shared corpus records cannot be changed." };
  const existing = await session.tdb.list(grns, { where: eq(grns.deliveryNoteId, dn.id), limit: 1 });
  if (existing.length) return { ok: false, message: `Delivery ${dn.number} already has goods receipt ${existing[0].number}.` };
  await audit(session, "delivery.refuse", "delivery_note", dn.number, { reason, ruleIds });
  return { ok: true };
}

export async function postGoodsReceipt(
  session: LabSession,
  deliveryNoteId: string,
  input: { lines: GrnLineInput[]; receivedDate?: string; notes?: string | null },
): Promise<GrnResult> {
  const tdb = session.tdb;
  const dn = await tdb.one(deliveryNotes, eq(deliveryNotes.id, deliveryNoteId));
  if (!dn) return { ok: false, error: "not_found", message: "Delivery note not found." };
  if (tdb.isReadOnlyRow(dn)) return { ok: false, error: "read_only", message: "Shared corpus records cannot be changed." };
  const existing = await tdb.one(grns, eq(grns.deliveryNoteId, dn.id));
  if (existing) return { ok: false, error: "already_posted", message: `Goods receipt ${existing.number} is already posted for this delivery note.` };

  const dnLines = await tdb.list(deliveryNoteLines, { where: eq(deliveryNoteLines.deliveryNoteId, dn.id), orderBy: [{ column: deliveryNoteLines.lineNo }] });
  const poLines = await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, dn.purchaseOrderId), orderBy: [{ column: purchaseOrderLines.lineNo }] });
  const posted = await tdb.list(grns, { where: and(eq(grns.purchaseOrderId, dn.purchaseOrderId), eq(grns.status, "posted"))! });
  const postedLines = posted.length ? await tdb.list(grnLines, { where: inArray(grnLines.grnId, posted.map((g) => g.id)) }) : [];
  const already = new Map<number, number>();
  for (const l of postedLines) {
    const pl = poLines.find((p) => p.id === l.purchaseOrderLineId);
    if (pl) already.set(pl.lineNo, (already.get(pl.lineNo) ?? 0) + Number(l.quantityReceived));
  }

  const lines = dnLines.map((dnLine) => {
    const given = input.lines.find((l) => l.lineNo === dnLine.lineNo);
    const received = given?.quantityReceived ?? 0;
    const rejected = given?.quantityRejected ?? 0;
    const accepted = given?.quantityAccepted ?? received - rejected;
    const pl = poLines.find((p) => p.id === dnLine.purchaseOrderLineId);
    return { dnLine, poLineNo: pl?.lineNo ?? -1, lineNo: dnLine.lineNo, quantityReceived: received, quantityAccepted: accepted, quantityRejected: rejected, reason: given?.rejectionReason ?? null };
  });

  const result = runRules(grnRules, {
    poLines: poLines.map((p) => ({ lineNo: p.lineNo, quantity: Number(p.quantity), uom: p.uom })),
    alreadyReceived: already,
    lines,
  });
  if (!result.ok) return { ok: false, error: "validation_failed", message: "The goods receipt breaks a rule.", violations: result.violations };

  const year = CORPUS_TODAY.slice(0, 4);
  const [last] = await tdb.list(grns, { where: and(eq(grns.tenantId, session.tenant.id), like(grns.number, `GRN-${year}-9%`))!, orderBy: [{ column: grns.number, direction: "desc" }], limit: 1 });
  const seq = last ? Number(last.number.slice(-5)) + 1 : 90001;
  const number = `GRN-${year}-${String(seq).padStart(5, "0")}`;
  const receivedDate = input.receivedDate || CORPUS_TODAY;
  const used = lines.filter((l) => l.quantityReceived > 0);
  let documentId = "";

  await tdb.transaction(async (tx) => {
    const [g] = await tx.insert(grns, {
      number, purchaseOrderId: dn.purchaseOrderId, deliveryNoteId: dn.id, vendorId: dn.vendorId, receivedDate,
      deliveryLocationId: dn.deliveryLocationId, receivedById: null, status: "posted", notes: input.notes ?? null,
    });
    await tx.insert(
      grnLines,
      used.map((l, i) => ({
        grnId: g.id, lineNo: i + 1, purchaseOrderLineId: l.dnLine.purchaseOrderLineId, itemId: l.dnLine.itemId, description: l.dnLine.description,
        quantityReceived: String(l.quantityReceived), quantityAccepted: String(l.quantityAccepted), quantityRejected: String(l.quantityRejected),
        uom: l.dnLine.uom, rejectionReason: l.reason || null,
      })),
    );
    await tx.update(deliveryNotes, { status: "received", updatedAt: new Date() }, eq(deliveryNotes.id, dn.id));
    const totalOrdered = poLines.reduce((a, p) => a + Number(p.quantity), 0);
    const totalReceived = [...already.values()].reduce((a, b) => a + b, 0) + used.reduce((a, l) => a + l.quantityReceived, 0);
    await tx.update(purchaseOrders, { status: totalReceived + 1e-9 >= totalOrdered ? "received" : "partially_received", updatedAt: new Date() }, eq(purchaseOrders.id, dn.purchaseOrderId));
    const [po] = await tx.list(purchaseOrders, { where: eq(purchaseOrders.id, dn.purchaseOrderId) });
    const [doc] = await tx.insert(documents, { kind: "grn", number, sourceId: g.id, vendorId: dn.vendorId, language: "bilingual" });
    documentId = doc.id;
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
  return { ok: true, number, documentId };
}
