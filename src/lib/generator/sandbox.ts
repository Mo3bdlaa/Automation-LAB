/**
 * Per-student working set. Generated from the student's own seed on top of
 * the shared corpus: purchase orders plus the full cycle around them (RFQ and
 * quotes, delivery notes, GRNs, invoices with labelled defects, payments and
 * receipts), and stand-alone invoices with no PO / unknown vendor.
 */
import { Rng } from "./rng";
import { addDays, businessNumber, CORPUS_TODAY, toWorkingDay } from "./dates";
import { generatePo, type GenPo, type PoGenContext, type GenVendor } from "./corpus";
import { generateCycle, generateOpenRfq, generateOrphanInvoice, seqNumber, type CycleContext, type GenCycle, type GenInvoice, type GenQuote, type GenDeliveryNote, type GenGrn, type GenRfq, type GenPayment, type GenReceipt } from "./cycle";

export const SANDBOX_SIZES = { activePos: 60, orphanInvoices: 6, openRfqs: 4 } as const;

export interface GroundTruthField {
  field: string;
  value: string;
  /**
   * Equally correct readings of the same field, filled in where a document
   * prints the value in more than one script. A submission matching any of
   * them scores as correct.
   */
  alternates?: string[];
}

export interface SandboxSet {
  cycles: GenCycle[];
  /** RFQs with quotes received and no award yet. */
  openRfqs: { rfq: GenRfq; quotes: GenQuote[] }[];
  /** Invoices with no PO or from a vendor that is not in the master. */
  orphanInvoices: GenInvoice[];
}

export interface SandboxContext extends PoGenContext {
  deliveryLocations: string[];
}

export function generateSandbox(seed: number, ctx: SandboxContext, n: number = SANDBOX_SIZES.activePos): SandboxSet {
  const rng = new Rng(seed);
  const r0 = rng.fork("po:dates");
  const dates: string[] = [];
  for (let i = 0; i < n; i++) dates.push(toWorkingDay(addDays(CORPUS_TODAY, -r0.int(0, 120))));
  dates.sort();
  const seqByYear = new Map<number, number>();
  const pos = dates.map((d, i) => {
    const y = Number(d.slice(0, 4));
    // Sandbox numbering continues after the shared history for that year so numbers never collide.
    const seq = (seqByYear.get(y) ?? 5000) + 1;
    seqByYear.set(y, seq);
    const r = rng.fork(`po:${i}`);
    return generatePo(r, ctx, {
      number: businessNumber("PO", d, seq),
      orderDate: d,
      status: r.weighted([["draft", 2], ["approved", 4], ["sent", 6], ["partially_received", 3], ["received", 6], ["closed", 4]]),
      historical: false,
    });
  });

  const cctx: CycleContext = {
    vendors: ctx.vendors,
    items: ctx.items,
    employees: ctx.employees,
    deliveryLocations: ctx.deliveryLocations,
    seqs: { rfq: 5000, grn: 5000, payment: 5000, invoiceReg: 5000 },
  };
  const invoiceNumbers: string[] = [];
  const cycles = pos.map((po, i) => {
    const c = generateCycle(rng.fork(`cycle:${i}`), po, cctx, invoiceNumbers);
    for (const inv of c.invoices) invoiceNumbers.push(inv.number);
    return c;
  });

  const orphanInvoices: GenInvoice[] = [];
  const active = ctx.vendors.filter((v) => v.status === "active");
  for (let i = 0; i < SANDBOX_SIZES.orphanInvoices; i++) {
    const r = rng.fork(`orphan:${i}`);
    const vendor = r.pick(active);
    const date = addDays(CORPUS_TODAY, -r.int(0, 60));
    orphanInvoices.push(generateOrphanInvoice(r, vendor, ctx.items, date, i % 3 === 0 ? "vendor_not_in_master" : "invoice_no_po"));
  }
  const openRfqs = Array.from({ length: SANDBOX_SIZES.openRfqs }, (_, i) => {
    const r = rng.fork(`open-rfq:${i}`);
    const date = toWorkingDay(addDays(CORPUS_TODAY, -r.int(0, 20)));
    return generateOpenRfq(r, cctx, date, (rr, d) => generatePo(rr, ctx, { number: `RFQ-TEMPLATE-${i}`, orderDate: d, status: "draft", historical: false }));
  });
  return { cycles, orphanInvoices, openRfqs };
}

/** Internal AP registration numbers for invoices, assigned in received-date order. */
export function assignInvoiceRegistrations(set: SandboxSet): Map<GenInvoice, string> {
  const all = [...set.cycles.flatMap((c) => c.invoices), ...set.orphanInvoices].sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.number.localeCompare(b.number));
  const out = new Map<GenInvoice, string>();
  const seqByYear = new Map<string, number>();
  for (const inv of all) {
    const y = inv.receivedDate.slice(0, 4);
    const seq = (seqByYear.get(y) ?? 5000) + 1;
    seqByYear.set(y, seq);
    out.set(inv, seqNumber("INV", inv.receivedDate, seq));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ground truth flatteners: the fields a grader compares an extraction against.
// ---------------------------------------------------------------------------

type VendorGt = { name: string; taxId: string; crNumber: string; iban: string };

export function purchaseOrderGroundTruth(po: GenPo, vendor: VendorGt): GroundTruthField[] {
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

export function rfqGroundTruth(rfq: GenRfq): GroundTruthField[] {
  const f: GroundTruthField[] = [
    { field: "number", value: rfq.number },
    { field: "issueDate", value: rfq.issueDate },
    { field: "dueDate", value: rfq.dueDate },
    { field: "lineCount", value: String(rfq.lines.length) },
  ];
  rfq.lines.forEach((l, i) => f.push({ field: `lines[${i}].itemCode`, value: l.itemCode }, { field: `lines[${i}].quantity`, value: String(l.quantity) }, { field: `lines[${i}].uom`, value: l.uom }));
  return f;
}

export function quoteGroundTruth(q: GenQuote, rfqNumber: string, vendor: VendorGt): GroundTruthField[] {
  const f: GroundTruthField[] = [
    { field: "number", value: q.number },
    { field: "rfqNumber", value: rfqNumber },
    { field: "quoteDate", value: q.quoteDate },
    { field: "validUntil", value: q.validUntil },
    { field: "currency", value: q.currency },
    { field: "paymentTermsDays", value: String(q.paymentTermsDays) },
    { field: "leadTimeDays", value: String(q.leadTimeDays) },
    { field: "vendor.name", value: vendor.name },
    { field: "vendor.taxId", value: vendor.taxId },
    { field: "subtotal", value: q.subtotal.toFixed(2) },
    { field: "taxTotal", value: q.taxTotal.toFixed(2) },
    { field: "grandTotal", value: q.grandTotal.toFixed(2) },
    { field: "lineCount", value: String(q.lines.length) },
  ];
  q.lines.forEach((l, i) => f.push({ field: `lines[${i}].itemCode`, value: l.itemCode }, { field: `lines[${i}].quantity`, value: String(l.quantity) }, { field: `lines[${i}].unitPrice`, value: l.unitPrice.toFixed(2) }, { field: `lines[${i}].lineTotal`, value: l.lineTotal.toFixed(2) }));
  return f;
}

export function deliveryNoteGroundTruth(dn: GenDeliveryNote, poNumber: string, vendor: VendorGt): GroundTruthField[] {
  const f: GroundTruthField[] = [
    { field: "number", value: dn.number },
    { field: "poNumber", value: poNumber },
    { field: "deliveryDate", value: dn.deliveryDate },
    { field: "vendor.name", value: vendor.name },
    { field: "carrier", value: dn.carrier },
    { field: "packages", value: String(dn.packages) },
    { field: "lineCount", value: String(dn.lines.length) },
  ];
  dn.lines.forEach((l, i) => f.push({ field: `lines[${i}].itemCode`, value: l.itemCode }, { field: `lines[${i}].quantity`, value: String(l.quantity) }, { field: `lines[${i}].uom`, value: l.uom }));
  return f;
}

export function grnGroundTruth(g: GenGrn, poNumber: string, vendor: VendorGt): GroundTruthField[] {
  const f: GroundTruthField[] = [
    { field: "number", value: g.number },
    { field: "poNumber", value: poNumber },
    { field: "deliveryNoteNumber", value: g.deliveryNoteNumber },
    { field: "receivedDate", value: g.receivedDate },
    { field: "vendor.name", value: vendor.name },
    { field: "lineCount", value: String(g.lines.length) },
  ];
  g.lines.forEach((l, i) => f.push({ field: `lines[${i}].itemCode`, value: l.itemCode }, { field: `lines[${i}].quantityReceived`, value: String(l.quantityReceived) }, { field: `lines[${i}].quantityAccepted`, value: String(l.quantityAccepted) }, { field: `lines[${i}].quantityRejected`, value: String(l.quantityRejected) }));
  return f;
}

export function invoiceGroundTruth(inv: GenInvoice): GroundTruthField[] {
  const f: GroundTruthField[] = [
    { field: "number", value: inv.number },
    { field: "invoiceDate", value: inv.invoiceDate },
    { field: "dueDate", value: inv.dueDate },
    { field: "poNumber", value: inv.printedPoNumber ?? "" },
    { field: "currency", value: inv.currency },
    { field: "vendor.name", value: inv.printedVendorName },
    { field: "vendor.taxId", value: inv.printedVendorTaxId },
    { field: "vendor.iban", value: inv.printedIban },
    { field: "vendor.bankName", value: inv.printedBankName },
    { field: "subtotal", value: inv.subtotal.toFixed(2) },
    { field: "taxTotal", value: inv.taxTotal.toFixed(2) },
    { field: "grandTotal", value: inv.grandTotal.toFixed(2) },
    { field: "lineCount", value: String(inv.lines.length) },
  ];
  inv.lines.forEach((l, i) => {
    f.push(
      { field: `lines[${i}].itemCode`, value: l.itemCode ?? "" },
      { field: `lines[${i}].description`, value: l.description },
      { field: `lines[${i}].quantity`, value: String(l.quantity) },
      { field: `lines[${i}].uom`, value: l.uom },
      { field: `lines[${i}].unitPrice`, value: l.unitPrice.toFixed(2) },
      { field: `lines[${i}].taxRate`, value: (l.taxRate * 100).toFixed(1) },
      { field: `lines[${i}].taxAmount`, value: l.taxAmount.toFixed(2) },
      { field: `lines[${i}].lineTotal`, value: l.lineTotal.toFixed(2) },
    );
  });
  return f;
}

export function receiptGroundTruth(rc: GenReceipt, payment: GenPayment, invoiceNumber: string, vendor: VendorGt): GroundTruthField[] {
  return [
    { field: "number", value: rc.number },
    { field: "receiptDate", value: rc.receiptDate },
    { field: "amount", value: rc.amount.toFixed(2) },
    { field: "currency", value: rc.currency },
    { field: "paymentReference", value: payment.reference },
    { field: "invoiceNumber", value: invoiceNumber },
    { field: "vendor.name", value: vendor.name },
  ];
}

export function vendorDocumentGroundTruth(vendor: GenVendor, d: { kind: string; number: string; issuedDate: string; expiryDate: string; issuer: string; attributes: Record<string, string> }): GroundTruthField[] {
  const f: GroundTruthField[] = [
    { field: "number", value: d.number },
    { field: "issuedDate", value: d.issuedDate },
    { field: "expiryDate", value: d.expiryDate },
    { field: "issuer", value: d.issuer },
    { field: "vendor.name", value: vendor.name },
    { field: "vendor.nameAr", value: vendor.nameAr },
  ];
  for (const [k, v] of Object.entries(d.attributes)) f.push({ field: `attributes.${k}`, value: v });
  return f;
}
