"use server";

import { redirect } from "next/navigation";
import { and, eq, like } from "drizzle-orm";
import { purchaseOrderLines, purchaseOrders, quoteLines, quotes, rfqs, vendors } from "@/db/schema";
import { requireLab, audit } from "@/lib/auth/server";
import { businessNumber, CORPUS_TODAY, addDays } from "@/lib/generator/dates";
import { lineMoney, totals, type TaxCode } from "@/lib/generator/money";

/** Award a quotation: mark it awarded, others rejected, create a draft PO from its lines. */
export async function awardQuoteAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const rfqNumber = String(formData.get("rfqNumber") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  const rfq = await session.tdb.one(rfqs, eq(rfqs.number, rfqNumber));
  if (!rfq || session.tdb.isReadOnlyRow(rfq) || rfq.status === "awarded") redirect(`/rfqs/${encodeURIComponent(rfqNumber)}`);
  const quote = await session.tdb.one(quotes, and(eq(quotes.id, quoteId), eq(quotes.rfqId, rfq.id))!);
  if (!quote) redirect(`/rfqs/${encodeURIComponent(rfqNumber)}`);
  const vendor = await session.tdb.one(vendors, eq(vendors.id, quote.vendorId));
  const qLines = await session.tdb.list(quoteLines, { where: eq(quoteLines.quoteId, quote.id), orderBy: [{ column: quoteLines.lineNo }] });
  const money = totals(qLines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPct: 0, taxCode: l.taxCode as TaxCode })));
  const year = CORPUS_TODAY.slice(0, 4);
  const [last] = await session.tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.tenantId, session.tenant.id), like(purchaseOrders.number, `PO-${year}-9%`)), orderBy: [{ column: purchaseOrders.number, direction: "desc" }], limit: 1 });
  const seq = last ? Number(last.number.slice(-5)) + 1 : 90001;
  const number = businessNumber("PO", CORPUS_TODAY, seq);
  await session.tdb.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrders, {
      number, vendorId: quote.vendorId, buyerId: rfq.buyerId, requesterId: rfq.requesterId, approverId: null, costCenterId: rfq.costCenterId, deliveryLocationId: null,
      currency: quote.currency, orderDate: CORPUS_TODAY, expectedDeliveryDate: addDays(CORPUS_TODAY, quote.leadTimeDays), paymentTermsDays: quote.paymentTermsDays, status: "draft",
      subtotal: money.subtotal.toFixed(2), taxTotal: money.taxTotal.toFixed(2), grandTotal: money.grandTotal.toFixed(2), notes: `Awarded from ${rfq.number}, quote ${quote.number}`, historical: false,
    });
    await tx.insert(
      purchaseOrderLines,
      qLines.map((l) => {
        const m = lineMoney({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPct: 0, taxCode: l.taxCode as TaxCode });
        return { purchaseOrderId: po.id, lineNo: l.lineNo, itemId: l.itemId, description: l.description, quantity: l.quantity, uom: l.uom, unitPrice: l.unitPrice, discountPct: "0.00", taxCode: l.taxCode, taxAmount: m.tax.toFixed(2), lineTotal: m.net.toFixed(2), glAccountId: null };
      }),
    );
    await tx.update(quotes, { status: "awarded", updatedAt: new Date() }, eq(quotes.id, quote.id));
    const others = await tx.list(quotes, { where: eq(quotes.rfqId, rfq.id) });
    for (const o of others) if (o.id !== quote.id) await tx.update(quotes, { status: "rejected", updatedAt: new Date() }, eq(quotes.id, o.id));
    await tx.update(rfqs, { status: "awarded", purchaseOrderId: po.id, updatedAt: new Date() }, eq(rfqs.id, rfq.id));
  });
  await audit(session, "rfq.award", "rfq", rfq.number, { quote: quote.number, vendor: vendor?.code, po: number });
  redirect(`/rfqs/${encodeURIComponent(rfqNumber)}?awarded=1`);
}
