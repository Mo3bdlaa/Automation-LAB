/**
 * Purchase order creation and approval. Shared by the PO screens and the API.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { costCenters, deliveryLocations, documents, employees, groundTruth, items, purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import type { LabSession } from "@/lib/auth/server";
import { audit } from "@/lib/auth/server";
import { runRules, type Violation } from "@/lib/validation/engine";
import { poRules } from "@/lib/validation/rules";
import { lineMoney, totals, TAX_CODES, type TaxCode } from "@/lib/generator/money";
import { businessNumber, CORPUS_TODAY } from "@/lib/generator/dates";
import { GL_BY_CATEGORY } from "@/lib/generator/vocab";
import { purchaseOrderGroundTruth } from "@/lib/generator/sandbox";
import { enqueue } from "@/lib/jobs/queue";
import { kickJobs } from "@/lib/jobs/runner";

export interface PoLineInput {
  itemCode: string;
  quantity: number;
  /** Blank values fall back to the catalogue, which is what the form does. */
  unitPrice?: number;
  uom?: string;
  taxCode?: string;
  discountPct?: number;
}

export interface PoInput {
  vendorCode: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  buyerCode?: string;
  requesterCode?: string;
  approverCode?: string;
  costCenterCode?: string;
  deliveryLocationCode?: string;
  notes?: string | null;
  lines: PoLineInput[];
}

export type CreatePoResult = { ok: true; number: string } | { ok: false; error: "validation_failed"; message: string; violations: Violation[] };

export async function createPurchaseOrder(session: LabSession, input: PoInput): Promise<CreatePoResult> {
  const tdb = session.tdb;
  const vendorCode = (input.vendorCode ?? "").toUpperCase();
  const orderDate = input.orderDate || CORPUS_TODAY;
  const expectedDeliveryDate = input.expectedDeliveryDate || orderDate;
  const vendor = vendorCode ? await tdb.one(vendors, eq(vendors.code, vendorCode)) : null;

  const codes = input.lines.map((l) => (l.itemCode ?? "").toUpperCase()).filter(Boolean);
  const itemRows = codes.length ? await tdb.list(items, { where: inArray(items.code, codes) }) : [];
  const itemMap = new Map(itemRows.map((i) => [i.code, { code: i.code, unitPrice: Number(i.unitPrice), uom: i.uom, taxCode: i.taxCode, active: i.active, id: i.id, category: i.category, name: i.name }]));

  const lines = input.lines
    .filter((l) => (l.itemCode ?? "").trim())
    .map((l, idx) => {
      const itemCode = l.itemCode.toUpperCase();
      const it = itemMap.get(itemCode);
      return {
        lineNo: idx + 1,
        itemCode,
        quantity: Number(l.quantity) || 0,
        unitPrice: l.unitPrice ?? it?.unitPrice ?? 0,
        discountPct: l.discountPct ?? 0,
        uom: (l.uom || it?.uom || "EA").toUpperCase(),
        taxCode: (l.taxCode || it?.taxCode || "S15").toUpperCase(),
      };
    });
  const money = totals(lines.filter((l) => l.taxCode in TAX_CODES).map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode as TaxCode })));
  const approver = input.approverCode ? await tdb.one(employees, eq(employees.code, input.approverCode)) : null;

  const result = runRules(poRules, {
    po: { vendorCode, currency: vendor?.currency ?? "SAR", orderDate, expectedDeliveryDate, lines, ...money },
    vendor: vendor ? { code: vendor.code, status: vendor.status, blacklisted: vendor.blacklisted, taxCertExpiry: vendor.taxCertExpiry } : null,
    items: itemMap,
    approver: approver ? { approvalLimit: approver.approvalLimit == null ? null : Number(approver.approvalLimit) } : null,
    today: CORPUS_TODAY,
  });
  if (!result.ok || !vendor) return { ok: false, error: "validation_failed", message: "The purchase order breaks a rule.", violations: result.violations };

  const [buyer, requester, cc, dl] = await Promise.all([
    input.buyerCode ? tdb.one(employees, eq(employees.code, input.buyerCode)) : null,
    input.requesterCode ? tdb.one(employees, eq(employees.code, input.requesterCode)) : null,
    input.costCenterCode ? tdb.one(costCenters, eq(costCenters.code, input.costCenterCode)) : null,
    input.deliveryLocationCode ? tdb.one(deliveryLocations, eq(deliveryLocations.code, input.deliveryLocationCode)) : null,
  ]);

  const year = orderDate.slice(0, 4);
  const [last] = await tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.tenantId, session.tenant.id), like(purchaseOrders.number, `PO-${year}-9%`))!, orderBy: [{ column: purchaseOrders.number, direction: "desc" }], limit: 1 });
  const seq = last ? Number(last.number.slice(-5)) + 1 : 90001;
  const number = businessNumber("PO", orderDate, seq);

  await tdb.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrders, {
      number, vendorId: vendor.id, buyerId: buyer?.id ?? null, requesterId: requester?.id ?? null, approverId: approver?.id ?? null,
      costCenterId: cc?.id ?? null, deliveryLocationId: dl?.id ?? null, currency: vendor.currency, orderDate, expectedDeliveryDate,
      paymentTermsDays: vendor.paymentTermsDays, status: "draft", subtotal: money.subtotal.toFixed(2), taxTotal: money.taxTotal.toFixed(2),
      grandTotal: money.grandTotal.toFixed(2), notes: input.notes || null, historical: false,
    });
    await tx.insert(
      purchaseOrderLines,
      lines.map((l) => {
        const it = itemMap.get(l.itemCode)!;
        const m = lineMoney({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode as TaxCode });
        return { purchaseOrderId: po.id, lineNo: l.lineNo, itemId: it.id, description: it.name, quantity: String(l.quantity), uom: l.uom, unitPrice: l.unitPrice.toFixed(4), discountPct: l.discountPct.toFixed(2), taxCode: l.taxCode, taxAmount: m.tax.toFixed(2), lineTotal: m.net.toFixed(2), glAccountId: null };
      }),
    );
  });
  await audit(session, "po.create", "purchase_order", number, { lines: lines.length, warnings: result.violations.map((v) => v.ruleId) });
  return { ok: true, number };
}

export type ApprovePoResult = { ok: true; number: string; documentId: string } | { ok: false; error: "not_found" | "invalid_state" | "read_only"; message: string };

/** Approving a draft creates its document, its ground truth and the render job. */
export async function approvePurchaseOrder(session: LabSession, number: string): Promise<ApprovePoResult> {
  const tdb = session.tdb;
  const po = await tdb.one(purchaseOrders, eq(purchaseOrders.number, number));
  if (!po) return { ok: false, error: "not_found", message: `Purchase order ${number} not found.` };
  if (tdb.isReadOnlyRow(purchaseOrders, po)) return { ok: false, error: "read_only", message: "Shared corpus records cannot be changed." };
  if (po.status !== "draft") return { ok: false, error: "invalid_state", message: `Purchase order ${number} is ${po.status}, not draft.` };

  const vendor = await tdb.one(vendors, eq(vendors.id, po.vendorId));
  const lines = await tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] });
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const itemRows = itemIds.length ? await tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const itemCode = (id: string | null) => itemRows.find((i) => i.id === id)?.code ?? "";
  let documentId = "";

  await tdb.transaction(async (tx) => {
    await tx.update(purchaseOrders, { status: "approved", updatedAt: new Date() }, eq(purchaseOrders.id, po.id));
    const [doc] = await tx.insert(documents, { kind: "purchase_order", number: po.number, sourceId: po.id, vendorId: po.vendorId, language: "bilingual" });
    documentId = doc.id;
    const gt = purchaseOrderGroundTruth(
      {
        number: po.number, orderDate: po.orderDate, expectedDeliveryDate: po.expectedDeliveryDate, currency: po.currency, paymentTermsDays: po.paymentTermsDays,
        subtotal: Number(po.subtotal), taxTotal: Number(po.taxTotal), grandTotal: Number(po.grandTotal),
        vendorCode: vendor?.code ?? "", buyerCode: "", requesterCode: "", approverCode: "", costCenterCode: "", deliveryLocationCode: "",
        status: "approved", notes: po.notes, historical: false,
        lines: lines.map((l) => ({
          lineNo: l.lineNo, itemCode: itemCode(l.itemId), description: l.description, quantity: Number(l.quantity), uom: l.uom,
          unitPrice: Number(l.unitPrice), discountPct: Number(l.discountPct), taxCode: l.taxCode as TaxCode,
          taxAmount: Number(l.taxAmount), lineTotal: Number(l.lineTotal),
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
  return { ok: true, number, documentId };
}
