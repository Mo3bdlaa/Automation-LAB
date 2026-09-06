/**
 * Awarding a quotation, which creates the draft purchase order.
 * Shared by the RFQ screen and POST /api/rfqs/{number}/award.
 */
import { and, eq, like } from "drizzle-orm";
import { purchaseOrderLines, purchaseOrders, quoteLines, quotes, rfqs, vendors } from "@/db/schema";
import type { LabSession } from "@/lib/auth/server";
import { audit } from "@/lib/auth/server";
import { addDays, businessNumber, CORPUS_TODAY } from "@/lib/generator/dates";
import { lineMoney, totals, type TaxCode } from "@/lib/generator/money";

export type AwardResult =
  | { ok: true; purchaseOrderNumber: string }
  | { ok: false; error: "not_found" | "invalid_state" | "read_only"; message: string };

export async function awardQuote(session: LabSession, rfqNumber: string, quoteId: string): Promise<AwardResult> {
  const tdb = session.tdb;
  const rfq = await tdb.one(rfqs, eq(rfqs.number, rfqNumber));
  if (!rfq) return { ok: false, error: "not_found", message: `RFQ ${rfqNumber} not found.` };
  if (tdb.isReadOnlyRow(rfq)) return { ok: false, error: "read_only", message: "Shared corpus records cannot be changed." };
  if (rfq.status === "awarded" || rfq.status === "cancelled") return { ok: false, error: "invalid_state", message: `RFQ ${rfqNumber} is ${rfq.status}.` };
  const quote = await tdb.one(quotes, and(eq(quotes.id, quoteId), eq(quotes.rfqId, rfq.id))!);
  if (!quote) return { ok: false, error: "not_found", message: "Quotation not found on this RFQ." };

  const vendor = await tdb.one(vendors, eq(vendors.id, quote.vendorId));
  const qLines = await tdb.list(quoteLines, { where: eq(quoteLines.quoteId, quote.id), orderBy: [{ column: quoteLines.lineNo }] });
  const money = totals(qLines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPct: 0, taxCode: l.taxCode as TaxCode })));
  const year = CORPUS_TODAY.slice(0, 4);
  const [last] = await tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.tenantId, session.tenant.id), like(purchaseOrders.number, `PO-${year}-9%`))!, orderBy: [{ column: purchaseOrders.number, direction: "desc" }], limit: 1 });
  const seq = last ? Number(last.number.slice(-5)) + 1 : 90001;
  const number = businessNumber("PO", CORPUS_TODAY, seq);

  await tdb.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrders, {
      number, vendorId: quote.vendorId, buyerId: rfq.buyerId, requesterId: rfq.requesterId, approverId: null, costCenterId: rfq.costCenterId, deliveryLocationId: null,
      currency: quote.currency, orderDate: CORPUS_TODAY, expectedDeliveryDate: addDays(CORPUS_TODAY, quote.leadTimeDays), paymentTermsDays: quote.paymentTermsDays,
      status: "draft", subtotal: money.subtotal.toFixed(2), taxTotal: money.taxTotal.toFixed(2), grandTotal: money.grandTotal.toFixed(2),
      notes: `Awarded from ${rfq.number}, quote ${quote.number}`, historical: false,
    });
    await tx.insert(
      purchaseOrderLines,
      qLines.map((l) => {
        const m = lineMoney({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPct: 0, taxCode: l.taxCode as TaxCode });
        return { purchaseOrderId: po.id, lineNo: l.lineNo, itemId: l.itemId, description: l.description, quantity: l.quantity, uom: l.uom, unitPrice: l.unitPrice, discountPct: "0.00", taxCode: l.taxCode, taxAmount: m.tax.toFixed(2), lineTotal: m.net.toFixed(2), glAccountId: null };
      }),
    );
    await tx.update(quotes, { status: "awarded", updatedAt: new Date() }, eq(quotes.id, quote.id));
    for (const other of await tx.list(quotes, { where: eq(quotes.rfqId, rfq.id) })) {
      if (other.id !== quote.id) await tx.update(quotes, { status: "rejected", updatedAt: new Date() }, eq(quotes.id, other.id));
    }
    await tx.update(rfqs, { status: "awarded", purchaseOrderId: po.id, updatedAt: new Date() }, eq(rfqs.id, rfq.id));
  });
  await audit(session, "rfq.award", "rfq", rfq.number, { quote: quote.number, vendor: vendor?.code, po: number });
  return { ok: true, purchaseOrderNumber: number };
}
