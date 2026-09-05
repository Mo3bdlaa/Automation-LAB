"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray, like } from "drizzle-orm";
import { costCenters, deliveryLocations, documents, employees, groundTruth, items, purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import { requireLab, audit } from "@/lib/auth/server";
import { runRules } from "@/lib/validation/engine";
import { poRules, type PoLineInput } from "@/lib/validation/rules";
import { formValues, num, str, type FormState, failedState } from "@/lib/forms";
import { lineMoney, totals, TAX_CODES, type TaxCode } from "@/lib/generator/money";
import { businessNumber, CORPUS_TODAY } from "@/lib/generator/dates";
import { GL_BY_CATEGORY } from "@/lib/generator/vocab";
import { purchaseOrderGroundTruth } from "@/lib/generator/sandbox";
import { enqueue } from "@/lib/jobs/queue";
import { kickJobs } from "@/lib/jobs/runner";
import { PO_FORM_LINES } from "./constants";


export async function createPurchaseOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const vendorCode = str(values, "vendorCode").toUpperCase();
  const orderDate = str(values, "orderDate", CORPUS_TODAY);
  const expectedDeliveryDate = str(values, "expectedDeliveryDate", orderDate);

  const vendor = vendorCode ? await session.tdb.one(vendors, eq(vendors.code, vendorCode)) : null;

  // Collect non-empty lines.
  const rawLines: PoLineInput[] = [];
  for (let n = 1; n <= PO_FORM_LINES; n++) {
    const itemCode = str(values, `line${n}ItemCode`).toUpperCase();
    if (!itemCode) continue;
    rawLines.push({
      lineNo: rawLines.length + 1,
      itemCode,
      quantity: num(values, `line${n}Quantity`, 0),
      unitPrice: num(values, `line${n}UnitPrice`, NaN),
      discountPct: num(values, `line${n}DiscountPct`, 0),
      uom: str(values, `line${n}Uom`).toUpperCase(),
      taxCode: str(values, `line${n}TaxCode`).toUpperCase(),
    });
  }
  const itemRows = rawLines.length ? await session.tdb.list(items, { where: inArray(items.code, rawLines.map((l) => l.itemCode)) }) : [];
  const itemMap = new Map(itemRows.map((i) => [i.code, { code: i.code, unitPrice: Number(i.unitPrice), uom: i.uom, taxCode: i.taxCode, active: i.active, id: i.id, category: i.category, name: i.name }]));
  // Blank price / uom / tax code default to the catalogue values: the UI form lets students leave them empty.
  const lines = rawLines.map((l) => {
    const it = itemMap.get(l.itemCode);
    return {
      ...l,
      unitPrice: Number.isNaN(l.unitPrice) ? (it?.unitPrice ?? 0) : l.unitPrice,
      uom: l.uom || it?.uom || "EA",
      taxCode: l.taxCode || it?.taxCode || "S15",
    };
  });
  const money = totals(lines.filter((l) => l.taxCode in TAX_CODES).map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode as TaxCode })));

  const approverCode = str(values, "approverCode");
  const approver = approverCode ? await session.tdb.one(employees, eq(employees.code, approverCode)) : null;
  const result = runRules(poRules, {
    po: { vendorCode, currency: vendor?.currency ?? "SAR", orderDate, expectedDeliveryDate, lines, ...money },
    vendor: vendor ? { code: vendor.code, status: vendor.status, blacklisted: vendor.blacklisted, taxCertExpiry: vendor.taxCertExpiry } : null,
    items: itemMap,
    approver: approver ? { approvalLimit: approver.approvalLimit == null ? null : Number(approver.approvalLimit) } : null,
    today: CORPUS_TODAY,
  });
  if (!result.ok || !vendor) return failedState(result.violations, values);

  const [buyer, requester, cc, dl] = await Promise.all([
    str(values, "buyerCode") ? session.tdb.one(employees, eq(employees.code, str(values, "buyerCode"))) : null,
    str(values, "requesterCode") ? session.tdb.one(employees, eq(employees.code, str(values, "requesterCode"))) : null,
    str(values, "costCenterCode") ? session.tdb.one(costCenters, eq(costCenters.code, str(values, "costCenterCode"))) : null,
    str(values, "deliveryLocationCode") ? session.tdb.one(deliveryLocations, eq(deliveryLocations.code, str(values, "deliveryLocationCode"))) : null,
  ]);

  // Next number in the student's own sequence for the fiscal year (PO-YYYY-9xxxx, distinct from generated 5xxxx and history).
  const year = orderDate.slice(0, 4);
  const [last] = await session.tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.tenantId, session.tenant.id), like(purchaseOrders.number, `PO-${year}-9%`)), orderBy: [{ column: purchaseOrders.number, direction: "desc" }], limit: 1 });
  const seq = last ? Number(last.number.slice(-5)) + 1 : 90001;
  const number = businessNumber("PO", orderDate, seq);

  await session.tdb.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrders, {
      number,
      vendorId: vendor.id,
      buyerId: buyer?.id ?? null,
      requesterId: requester?.id ?? null,
      approverId: approver?.id ?? null,
      costCenterId: cc?.id ?? null,
      deliveryLocationId: dl?.id ?? null,
      currency: vendor.currency,
      orderDate,
      expectedDeliveryDate,
      paymentTermsDays: vendor.paymentTermsDays,
      status: "draft",
      subtotal: money.subtotal.toFixed(2),
      taxTotal: money.taxTotal.toFixed(2),
      grandTotal: money.grandTotal.toFixed(2),
      notes: str(values, "notes") || null,
      historical: false,
    });
    await tx.insert(
      purchaseOrderLines,
      lines.map((l) => {
        const it = itemMap.get(l.itemCode)!;
        const m = lineMoney({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode as TaxCode });
        return {
          purchaseOrderId: po.id,
          lineNo: l.lineNo,
          itemId: it.id,
          description: it.name,
          quantity: String(l.quantity),
          uom: l.uom,
          unitPrice: l.unitPrice.toFixed(4),
          discountPct: l.discountPct.toFixed(2),
          taxCode: l.taxCode,
          taxAmount: m.tax.toFixed(2),
          lineTotal: m.net.toFixed(2),
          glAccountId: null,
        };
      }),
    );
  });
  await audit(session, "po.create", "purchase_order", number, { warnings: result.violations.map((v) => v.ruleId), lines: lines.length });
  redirect(`/purchase-orders/${encodeURIComponent(number)}?created=1`);
}

/** Approve a draft: status → approved, create the document + ground truth, queue the PDF render. */
export async function approvePurchaseOrderAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const number = String(formData.get("number") ?? "");
  const po = await session.tdb.one(purchaseOrders, eq(purchaseOrders.number, number));
  if (!po || session.tdb.isReadOnlyRow(po) || po.status !== "draft") redirect(`/purchase-orders/${encodeURIComponent(number)}`);
  const vendor = await session.tdb.one(vendors, eq(vendors.id, po.vendorId));
  const lines = await session.tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] });
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const itemRows = itemIds.length ? await session.tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const itemCode = (id: string | null) => itemRows.find((i) => i.id === id)?.code ?? "";

  await session.tdb.transaction(async (tx) => {
    await tx.update(purchaseOrders, { status: "approved", updatedAt: new Date() }, eq(purchaseOrders.id, po.id));
    const [doc] = await tx.insert(documents, { kind: "purchase_order", number: po.number, sourceId: po.id, vendorId: po.vendorId, language: "bilingual" });
    const gt = purchaseOrderGroundTruth(
      {
        number: po.number,
        orderDate: po.orderDate,
        expectedDeliveryDate: po.expectedDeliveryDate,
        currency: po.currency,
        paymentTermsDays: po.paymentTermsDays,
        subtotal: Number(po.subtotal),
        taxTotal: Number(po.taxTotal),
        grandTotal: Number(po.grandTotal),
        vendorCode: vendor?.code ?? "",
        buyerCode: "",
        requesterCode: "",
        approverCode: "",
        costCenterCode: "",
        deliveryLocationCode: "",
        status: "approved",
        notes: po.notes,
        historical: false,
        lines: lines.map((l) => ({
          lineNo: l.lineNo,
          itemCode: itemCode(l.itemId),
          description: l.description,
          quantity: Number(l.quantity),
          uom: l.uom,
          unitPrice: Number(l.unitPrice),
          discountPct: Number(l.discountPct),
          taxCode: l.taxCode as TaxCode,
          taxAmount: Number(l.taxAmount),
          lineTotal: Number(l.lineTotal),
          glCode: GL_BY_CATEGORY[itemRows.find((i) => i.id === l.itemId)?.category ?? ""] ?? "7900",
        })),
      },
      { name: vendor?.name ?? "", taxId: vendor?.taxId ?? "", crNumber: vendor?.crNumber ?? "", iban: vendor?.iban ?? "" },
    );
    await tx.insert(groundTruth, gt.map((g) => ({ documentId: doc.id, field: g.field, value: g.value })));
    await enqueue("render_document", { documentId: doc.id }, { tenantId: session.tenant.id, priority: 5 });
  });
  kickJobs();
  await audit(session, "po.approve", "purchase_order", number);
  redirect(`/purchase-orders/${encodeURIComponent(number)}?approved=1`);
}

