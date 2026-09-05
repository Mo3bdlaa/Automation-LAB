/**
 * Per-student working set. Generated from the student's own seed on top of
 * the shared corpus. P0 produces the active purchase orders; P1 extends the
 * same generator to the full cycle (delivery notes, GRNs, invoices...).
 */
import { Rng } from "./rng";
import { addDays, businessNumber, CORPUS_TODAY, toWorkingDay } from "./dates";
import { generatePo, type GenPo, type PoGenContext } from "./corpus";

export const SANDBOX_SIZES = { activePos: 40 } as const;

export interface GroundTruthField {
  field: string;
  value: string;
}

export interface SandboxSet {
  purchaseOrders: GenPo[];
}

export function generateSandbox(seed: number, ctx: PoGenContext, n: number = SANDBOX_SIZES.activePos): SandboxSet {
  const rng = new Rng(seed);
  const r0 = rng.fork("po:dates");
  const dates: string[] = [];
  for (let i = 0; i < n; i++) dates.push(toWorkingDay(addDays(CORPUS_TODAY, -r0.int(0, 120))));
  dates.sort();
  const seqByYear = new Map<number, number>();
  const purchaseOrders = dates.map((d, i) => {
    const y = Number(d.slice(0, 4));
    // Sandbox numbering continues after the shared history for that year so numbers never collide.
    const seq = (seqByYear.get(y) ?? 5000) + 1;
    seqByYear.set(y, seq);
    const r = rng.fork(`po:${i}`);
    return generatePo(r, ctx, {
      number: businessNumber("PO", d, seq),
      orderDate: d,
      status: r.weighted([["draft", 2], ["approved", 5], ["sent", 6], ["partially_received", 2], ["received", 3]]),
      historical: false,
    });
  });
  return { purchaseOrders };
}

/** Flatten a PO into the ground-truth field list that graders compare against. */
export function purchaseOrderGroundTruth(po: GenPo, vendor: { name: string; taxId: string; crNumber: string; iban: string }): GroundTruthField[] {
  const fields: GroundTruthField[] = [
    { field: "number", value: po.number },
    { field: "orderDate", value: po.orderDate },
    { field: "expectedDeliveryDate", value: po.expectedDeliveryDate },
    { field: "currency", value: po.currency },
    { field: "paymentTermsDays", value: String(po.paymentTermsDays) },
    { field: "vendor.name", value: vendor.name },
    { field: "vendor.taxId", value: vendor.taxId },
    { field: "vendor.crNumber", value: vendor.crNumber },
    { field: "vendor.iban", value: vendor.iban },
    { field: "subtotal", value: po.subtotal.toFixed(2) },
    { field: "taxTotal", value: po.taxTotal.toFixed(2) },
    { field: "grandTotal", value: po.grandTotal.toFixed(2) },
    { field: "lineCount", value: String(po.lines.length) },
  ];
  po.lines.forEach((l, i) => {
    fields.push(
      { field: `lines[${i}].itemCode`, value: l.itemCode },
      { field: `lines[${i}].description`, value: l.description },
      { field: `lines[${i}].quantity`, value: String(l.quantity) },
      { field: `lines[${i}].uom`, value: l.uom },
      { field: `lines[${i}].unitPrice`, value: l.unitPrice.toFixed(2) },
      { field: `lines[${i}].discountPct`, value: l.discountPct.toFixed(2) },
      { field: `lines[${i}].taxCode`, value: l.taxCode },
      { field: `lines[${i}].lineTotal`, value: l.lineTotal.toFixed(2) },
    );
  });
  return fields;
}
