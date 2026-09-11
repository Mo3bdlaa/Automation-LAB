/**
 * Procurement cycle generator: for a purchase order, derive the downstream
 * and upstream documents (RFQ + quotes, delivery notes, GRNs, invoices,
 * payments, receipts) and inject labelled defects. Pure and deterministic.
 */
import type { Rng } from "./rng";
import { addDays, toWorkingDay, CORPUS_TODAY } from "./dates";
import { TAX_CODES, lineMoney, round2, totals, type TaxCode } from "./money";
import type { GenPo, GenPoLine, GenVendor, GenItem } from "./corpus";
import { BANKS, makeIban } from "./iban";
import { makeCrNumber, makeTaxId } from "./checksums";

export const DEFECT_TYPES = [
  "price_variance",
  "over_delivery",
  "duplicate_invoice",
  "invoice_no_po",
  "wrong_tax_rate",
  "bank_account_changed",
  "expired_tax_certificate",
  "currency_mismatch",
  "uom_mismatch",
  "off_by_one_total",
  "vendor_not_in_master",
] as const;
export type DefectType = (typeof DEFECT_TYPES)[number];

export interface GenDefect {
  type: DefectType;
  severity: "warning" | "error" | "critical";
  details: Record<string, unknown>;
}

export interface GenRfqLine { lineNo: number; itemCode: string; description: string; quantity: number; uom: string }
export interface GenRfq {
  number: string; requesterCode: string; buyerCode: string; costCenterCode: string;
  issueDate: string; dueDate: string; status: "open" | "quoted" | "awarded" | "cancelled"; notes: string | null; lines: GenRfqLine[];
}
export interface GenQuoteLine { lineNo: number; itemCode: string; description: string; quantity: number; uom: string; unitPrice: number; taxCode: TaxCode; taxAmount: number; lineTotal: number }
export interface GenQuote {
  number: string; vendorCode: string; quoteDate: string; validUntil: string; currency: string; paymentTermsDays: number; leadTimeDays: number;
  subtotal: number; taxTotal: number; grandTotal: number; status: "received" | "awarded" | "rejected" | "expired"; lines: GenQuoteLine[];
}
export interface GenDnLine { lineNo: number; poLineNo: number; itemCode: string; description: string; quantity: number; uom: string }
export interface GenDeliveryNote {
  number: string; vendorCode: string; deliveryDate: string; deliveryLocationCode: string; carrier: string; vehicle: string; packages: number;
  status: "in_transit" | "delivered" | "received"; lines: GenDnLine[];
}
export interface GenGrnLine { lineNo: number; poLineNo: number; itemCode: string; description: string; quantityReceived: number; quantityAccepted: number; quantityRejected: number; uom: string; rejectionReason: string | null }
export interface GenGrn {
  number: string; deliveryNoteNumber: string; vendorCode: string; receivedDate: string; deliveryLocationCode: string; receivedByCode: string;
  status: "posted"; notes: string | null; lines: GenGrnLine[];
}
export interface GenInvoiceLine { lineNo: number; poLineNo: number | null; itemCode: string | null; description: string; quantity: number; uom: string; unitPrice: number; discountPct: number; taxCode: TaxCode; taxRate: number; taxAmount: number; lineTotal: number }
export interface GenInvoice {
  number: string; vendorCode: string | null; printedVendorName: string; printedVendorTaxId: string; printedIban: string; printedBankName: string;
  printedPoNumber: string | null; invoiceDate: string; dueDate: string; receivedDate: string; currency: string;
  subtotal: number; taxTotal: number; grandTotal: number; status: "pending_extraction" | "approved" | "paid";
  lines: GenInvoiceLine[]; defects: GenDefect[];
  /** For invoice_no_po / vendor_not_in_master invoices: the fake vendor's details. */
  ghostVendor?: { name: string; nameAr: string; taxId: string; crNumber: string; iban: string; bankName: string; addressLine: string; city: string; country: string };
}
export interface GenPayment { number: string; paidDate: string; amount: number; currency: string; method: "bank_transfer" | "cheque"; reference: string; ibanPaidTo: string }
export interface GenReceipt { number: string; receiptDate: string; amount: number; currency: string }

export interface GenCycle {
  po: GenPo;
  rfq: GenRfq | null;
  quotes: GenQuote[];
  deliveryNotes: GenDeliveryNote[];
  grns: GenGrn[];
  invoices: GenInvoice[];
  payments: { invoiceNumber: string; payment: GenPayment; receipt: GenReceipt | null }[];
}

export interface CycleContext {
  vendors: GenVendor[];
  items: GenItem[];
  employees: { code: string; role: string }[];
  deliveryLocations: string[];
  seqs: { rfq: number; grn: number; payment: number; invoiceReg: number };
}

const CARRIERS = ["Aramex", "SMSA Express", "Naqel", "DHL Freight", "Own fleet", "Al Madina Transport", "Zajil"];

function vendorQuoteNumber(r: Rng, vendor: GenVendor, date: string) {
  const styles = [
    () => `Q-${date.slice(0, 4)}-${r.digits(4)}`,
    () => `${vendor.code.replace("V-", "")}/QT/${r.digits(5)}`,
    () => `QUO${date.slice(2, 4)}${r.digits(5)}`,
  ];
  return r.pick(styles)();
}
function vendorDnNumber(r: Rng, date: string) {
  return r.pick([() => `DN-${date.slice(0, 4)}-${r.digits(5)}`, () => `DEL/${r.digits(6)}`, () => `${date.slice(2, 4)}${date.slice(5, 7)}-${r.digits(4)}`])();
}
export function vendorInvoiceNumber(r: Rng, date: string) {
  return r.pick([() => `INV-${date.slice(0, 4)}-${r.digits(5)}`, () => `${date.slice(0, 4)}/${r.digits(6)}`, () => `TI-${r.digits(7)}`, () => `INV${date.slice(2, 4)}${r.digits(6)}`])();
}
function vendorReceiptNumber(r: Rng) {
  return `RCPT-${r.digits(6)}`;
}
export function seqNumber(prefix: string, date: string, seq: number) {
  return `${prefix}-${date.slice(0, 4)}-${String(seq).padStart(5, "0")}`;
}

function quoteFromPo(r: Rng, po: GenPo, vendor: GenVendor, rfqDate: string, factor: number, status: GenQuote["status"]): GenQuote {
  const lines: GenQuoteLine[] = po.lines.map((l) => {
    const unitPrice = round2(l.unitPrice * factor);
    const m = lineMoney({ quantity: l.quantity, unitPrice, discountPct: 0, taxCode: l.taxCode });
    return { lineNo: l.lineNo, itemCode: l.itemCode, description: l.description, quantity: l.quantity, uom: l.uom, unitPrice, taxCode: l.taxCode, taxAmount: m.tax, lineTotal: m.net };
  });
  const t = totals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: 0, taxCode: l.taxCode })));
  const quoteDate = toWorkingDay(addDays(rfqDate, r.int(1, 6)));
  return {
    number: vendorQuoteNumber(r, vendor, quoteDate),
    vendorCode: vendor.code,
    quoteDate,
    validUntil: addDays(quoteDate, r.pick([30, 45, 60, 90])),
    currency: po.currency,
    paymentTermsDays: vendor.paymentTermsDays,
    leadTimeDays: r.int(3, 30),
    ...t,
    status,
    lines,
  };
}

/** Invoice built from PO lines (possibly a subset / partial quantities), then defects applied. */
function invoiceFromPo(r: Rng, po: GenPo, vendor: GenVendor, poLines: { line: GenPoLine; qty: number }[], invoiceDate: string): GenInvoice {
  const lines: GenInvoiceLine[] = poLines.map(({ line, qty }, idx) => {
    const rate = TAX_CODES[line.taxCode].rate;
    const m = lineMoney({ quantity: qty, unitPrice: line.unitPrice, discountPct: line.discountPct, taxCode: line.taxCode });
    return {
      lineNo: idx + 1, poLineNo: line.lineNo, itemCode: line.itemCode, description: line.description, quantity: qty, uom: line.uom,
      unitPrice: line.unitPrice, discountPct: line.discountPct, taxCode: line.taxCode, taxRate: rate, taxAmount: m.tax, lineTotal: m.net,
    };
  });
  const t = recomputeInvoiceTotals(lines);
  return {
    number: vendorInvoiceNumber(r, invoiceDate),
    vendorCode: vendor.code,
    printedVendorName: vendor.name,
    printedVendorTaxId: vendor.taxId,
    printedIban: vendor.iban,
    printedBankName: vendor.bankName,
    printedPoNumber: po.number,
    invoiceDate,
    dueDate: addDays(invoiceDate, vendor.paymentTermsDays),
    receivedDate: toWorkingDay(addDays(invoiceDate, r.int(0, 4))),
    currency: po.currency,
    ...t,
    status: "pending_extraction",
    lines,
    defects: [],
  };
}

export function recomputeInvoiceTotals(lines: GenInvoiceLine[]) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    subtotal = round2(subtotal + l.lineTotal);
    taxTotal = round2(taxTotal + l.taxAmount);
  }
  return { subtotal, taxTotal, grandTotal: round2(subtotal + taxTotal) };
}

function ghostVendor(r: Rng, base: GenVendor) {
  const bank = r.pick(BANKS);
  return {
    name: r.pick(["Nour Al Sharq Trading Est.", "Bayan Supplies Co.", "Al Rashid General Trading LLC", "Tamkeen Logistics Co.", "Rawafed Technical Services"]),
    nameAr: r.pick(["مؤسسة نور الشرق للتجارة", "شركة بيان للتوريدات", "الراشد للتجارة العامة ذ.م.م", "شركة تمكين للخدمات اللوجستية", "روافد للخدمات الفنية"]),
    taxId: makeTaxId(r.digits(13)),
    crNumber: makeCrNumber(String(r.int(1, 9)) + r.digits(8)),
    iban: makeIban(r, bank),
    bankName: bank.bankName,
    addressLine: `${r.int(1, 300)} ${r.pick(["Al Kharj Road", "Industrial Area 3", "Al Rawdah Street", "Port Road"])}`,
    city: base.city,
    country: base.country,
  };
}

/** Apply one labelled defect to an invoice, in place, recording it in `defects`. */
export function applyDefect(r: Rng, inv: GenInvoice, type: DefectType, ctx: { po: GenPo; vendor: GenVendor; grnQty: Map<number, number>; existingInvoiceNumbers: string[] }) {
  const { po, vendor } = ctx;
  const line = inv.lines[r.int(0, inv.lines.length - 1)];
  switch (type) {
    case "price_variance": {
      const before = line.unitPrice;
      const factor = r.pick([1.05, 1.08, 1.12, 1.2, 0.9]);
      line.unitPrice = round2(before * factor);
      const m = lineMoney({ quantity: line.quantity, unitPrice: line.unitPrice, discountPct: line.discountPct, taxCode: line.taxCode });
      line.taxAmount = m.tax;
      line.lineTotal = m.net;
      Object.assign(inv, recomputeInvoiceTotals(inv.lines));
      inv.defects.push({ type, severity: "error", details: { lineNo: line.lineNo, poUnitPrice: before, invoiceUnitPrice: line.unitPrice, ruleId: "PO-INV-PRICE" } });
      return;
    }
    case "over_delivery": {
      const received = ctx.grnQty.get(line.poLineNo ?? -1) ?? line.quantity;
      const before = line.quantity;
      line.quantity = received + Math.max(1, Math.round(received * r.pick([0.1, 0.2, 0.5])));
      const m = lineMoney({ quantity: line.quantity, unitPrice: line.unitPrice, discountPct: line.discountPct, taxCode: line.taxCode });
      line.taxAmount = m.tax;
      line.lineTotal = m.net;
      Object.assign(inv, recomputeInvoiceTotals(inv.lines));
      inv.defects.push({ type, severity: "error", details: { lineNo: line.lineNo, receivedQty: received, invoicedQty: line.quantity, previousQty: before, ruleId: "GRN-QTY" } });
      return;
    }
    case "duplicate_invoice": {
      // Must be one of *this vendor's* earlier numbers. DUP-INV checks
      // uniqueness per vendor per year, because an invoice number is a
      // vendor's own sequence and two vendors sharing one is not a defect.
      // Copying another vendor's number seeds a defect nothing can detect.
      if (ctx.existingInvoiceNumbers.length) {
        const dup = r.pick(ctx.existingInvoiceNumbers);
        inv.number = dup;
        inv.defects.push({ type, severity: "critical", details: { duplicateOf: dup, ruleId: "DUP-INV" } });
      }
      return;
    }
    case "invoice_no_po": {
      inv.printedPoNumber = r.chance(0.5) ? null : `PO-${po.orderDate.slice(0, 4)}-${r.digits(5)}`;
      inv.defects.push({ type, severity: "error", details: { printedPoNumber: inv.printedPoNumber, ruleId: "INV-NO-PO" } });
      return;
    }
    case "wrong_tax_rate": {
      const wrongRate = line.taxRate === 0.15 ? r.pick([0.05, 0.16, 0.14, 0.2]) : 0.15;
      line.taxRate = wrongRate;
      line.taxAmount = round2(line.lineTotal * wrongRate);
      Object.assign(inv, recomputeInvoiceTotals(inv.lines));
      inv.defects.push({ type, severity: "error", details: { lineNo: line.lineNo, expectedRate: TAX_CODES[line.taxCode].rate, printedRate: wrongRate, ruleId: "INV-TAX-RATE" } });
      return;
    }
    case "bank_account_changed": {
      const bank = r.pick(BANKS.filter((b) => b.country === vendor.country).length ? BANKS.filter((b) => b.country === vendor.country) : BANKS);
      inv.printedIban = makeIban(r, bank);
      inv.printedBankName = bank.bankName;
      inv.defects.push({ type, severity: "critical", details: { masterIban: vendor.iban, printedIban: inv.printedIban, ruleId: "BANK-CHANGE" } });
      return;
    }
    case "expired_tax_certificate": {
      // Nothing printed changes; the defect is that the vendor's certificate expired before the invoice date.
      inv.defects.push({ type, severity: "warning", details: { taxCertExpiry: vendor.taxCertExpiry, invoiceDate: inv.invoiceDate, ruleId: "TAX-CERT-EXP" } });
      return;
    }
    case "currency_mismatch": {
      const other = r.pick(["USD", "EUR", "AED", "EGP"].filter((c) => c !== po.currency));
      inv.currency = other;
      inv.defects.push({ type, severity: "error", details: { poCurrency: po.currency, invoiceCurrency: other, ruleId: "INV-CURRENCY" } });
      return;
    }
    case "uom_mismatch": {
      const before = line.uom;
      line.uom = before === "BOX" ? "EA" : before === "EA" ? "BOX" : before === "KG" ? "TON" : "PK";
      inv.defects.push({ type, severity: "error", details: { lineNo: line.lineNo, poUom: before, invoiceUom: line.uom, ruleId: "INV-UOM" } });
      return;
    }
    case "off_by_one_total": {
      const before = inv.grandTotal;
      inv.grandTotal = round2(before + r.pick([1, -1, 0.1, -0.1, 10]));
      inv.defects.push({ type, severity: "error", details: { computedTotal: before, printedTotal: inv.grandTotal, ruleId: "INV-TOTAL-TIE" } });
      return;
    }
    case "vendor_not_in_master": {
      const g = ghostVendor(r, vendor);
      inv.ghostVendor = g;
      inv.vendorCode = null;
      inv.printedVendorName = g.name;
      inv.printedVendorTaxId = g.taxId;
      inv.printedIban = g.iban;
      inv.printedBankName = g.bankName;
      inv.printedPoNumber = null;
      inv.defects.push({ type, severity: "critical", details: { printedVendorName: g.name, printedTaxId: g.taxId, ruleId: "INV-VENDOR-MASTER" } });
      return;
    }
  }
}

/**
 * Build the cycle around one PO. Which documents exist follows the PO status:
 *   draft/approved  -> maybe RFQ + quotes only
 *   sent            -> + maybe delivery note in transit; maybe an early invoice (no goods yet)
 *   partially_received -> + DN + GRN for part of the lines, invoice for received part
 *   received/closed -> + DN + GRN for everything, invoice(s); closed -> payment + receipt
 */
/** `existingInvoiceNumbers` are the earlier numbers of this PO's vendor, for the duplicate defect. */
export function generateCycle(r: Rng, po: GenPo, ctx: CycleContext, existingInvoiceNumbers: string[], defectRate = 0.3): GenCycle {
  const vendor = ctx.vendors.find((v) => v.code === po.vendorCode)!;
  const warehouse = ctx.employees.filter((e) => e.role === "warehouse").map((e) => e.code);
  const cycle: GenCycle = { po, rfq: null, quotes: [], deliveryNotes: [], grns: [], invoices: [], payments: [] };

  // RFQ + three quotes for ~40 % of POs.
  if (r.chance(0.4)) {
    const issueDate = toWorkingDay(addDays(po.orderDate, -r.int(7, 21)));
    ctx.seqs.rfq += 1;
    cycle.rfq = {
      number: seqNumber("RFQ", issueDate, ctx.seqs.rfq),
      requesterCode: po.requesterCode,
      buyerCode: po.buyerCode,
      costCenterCode: po.costCenterCode,
      issueDate,
      dueDate: toWorkingDay(addDays(issueDate, r.int(5, 10))),
      status: "awarded",
      notes: null,
      lines: po.lines.map((l) => ({ lineNo: l.lineNo, itemCode: l.itemCode, description: l.description, quantity: l.quantity, uom: l.uom })),
    };
    const others = r.sample(ctx.vendors.filter((v) => v.status === "active" && v.code !== vendor.code && v.category === vendor.category), 2);
    const pool = others.length === 2 ? others : r.sample(ctx.vendors.filter((v) => v.status === "active" && v.code !== vendor.code), 2);
    cycle.quotes.push(quoteFromPo(r.fork("q0"), po, vendor, issueDate, 1, "awarded"));
    for (const [i, ov] of pool.entries()) cycle.quotes.push(quoteFromPo(r.fork(`q${i + 1}`), po, ov, issueDate, r.float(1.02, 1.25), "rejected"));
  }

  const status = po.status;
  const grnQty = new Map<number, number>();
  const deliverLines = (fraction: number) => {
    const chosen = fraction >= 1 ? po.lines : po.lines.slice(0, Math.max(1, Math.floor(po.lines.length * fraction)));
    return chosen.map((l) => ({ line: l, qty: fraction >= 1 || r.chance(0.7) ? l.quantity : Math.max(1, Math.floor(l.quantity * r.float(0.4, 0.9))) }));
  };

  let delivered: { line: GenPoLine; qty: number }[] = [];
  if (status === "sent" && r.chance(0.6)) {
    // Goods on the way or at the dock, no GRN yet: the warehouse exercise starts here.
    const d = deliverLines(1);
    const deliveryDate = toWorkingDay(addDays(po.expectedDeliveryDate, r.int(-2, 5)));
    cycle.deliveryNotes.push(dnFrom(r, vendor, d, deliveryDate, po.deliveryLocationCode, r.chance(0.6) ? "delivered" : "in_transit"));
  }
  if (status === "partially_received" || status === "received" || status === "closed") {
    delivered = deliverLines(status === "partially_received" ? 0.6 : 1);
    const deliveryDate = toWorkingDay(addDays(po.expectedDeliveryDate, r.int(-3, 6)));
    const dn = dnFrom(r, vendor, delivered, deliveryDate, po.deliveryLocationCode, "received");
    cycle.deliveryNotes.push(dn);
    ctx.seqs.grn += 1;
    const receivedDate = toWorkingDay(addDays(deliveryDate, r.int(0, 2)));
    const grn: GenGrn = {
      number: seqNumber("GRN", receivedDate, ctx.seqs.grn),
      deliveryNoteNumber: dn.number,
      vendorCode: vendor.code,
      receivedDate,
      deliveryLocationCode: po.deliveryLocationCode,
      receivedByCode: r.pick(warehouse),
      status: "posted",
      notes: r.chance(0.2) ? r.pick(["Two cartons damaged, rejected.", "Delivered to dock B.", "Short shipment noted on DN."]) : null,
      lines: delivered.map((d, i) => {
        const rejected = r.chance(0.12) ? Math.min(d.qty - 1, Math.max(1, Math.round(d.qty * 0.1))) : 0;
        const accepted = d.qty - rejected;
        grnQty.set(d.line.lineNo, accepted);
        return { lineNo: i + 1, poLineNo: d.line.lineNo, itemCode: d.line.itemCode, description: d.line.description, quantityReceived: d.qty, quantityAccepted: accepted, quantityRejected: rejected, uom: d.line.uom, rejectionReason: rejected ? r.pick(["Damaged packaging", "Wrong variant", "Expired batch"]) : null };
      }),
    };
    cycle.grns.push(grn);
  }

  // Invoices.
  const invoiceLinesBasis = delivered.length ? delivered.map((d) => ({ line: d.line, qty: grnQty.get(d.line.lineNo) ?? d.qty })) : po.lines.map((l) => ({ line: l, qty: l.quantity }));
  const wantsInvoice = status === "received" || status === "closed" || status === "partially_received" || (status === "sent" && r.chance(0.25));
  if (wantsInvoice) {
    const lastDate = cycle.grns[0]?.receivedDate ?? po.expectedDeliveryDate;
    const invoiceDate = toWorkingDay(addDays(lastDate, r.int(0, 10)));
    const inv = invoiceFromPo(r.fork("inv"), po, vendor, invoiceLinesBasis, invoiceDate);
    if (status === "closed") inv.status = "paid";
    if (r.chance(defectRate) && status !== "closed") {
      const nDefects = r.chance(0.2) ? 2 : 1;
      const candidates: DefectType[] = ["price_variance", "over_delivery", "duplicate_invoice", "wrong_tax_rate", "bank_account_changed", "currency_mismatch", "uom_mismatch", "off_by_one_total", "invoice_no_po"];
      if (vendor.taxCertExpiry < inv.invoiceDate) candidates.push("expired_tax_certificate");
      for (const t of r.sample(candidates, nDefects)) applyDefect(r.fork(`d:${t}`), inv, t, { po, vendor, grnQty, existingInvoiceNumbers });
    } else if (vendor.taxCertExpiry < inv.invoiceDate) {
      applyDefect(r, inv, "expired_tax_certificate", { po, vendor, grnQty, existingInvoiceNumbers });
    }
    cycle.invoices.push(inv);
    if (inv.status === "paid") {
      ctx.seqs.payment += 1;
      const paidDate = toWorkingDay(addDays(inv.invoiceDate, Math.min(vendor.paymentTermsDays, r.int(5, 40))));
      const payment: GenPayment = {
        number: seqNumber("PAY", paidDate, ctx.seqs.payment),
        paidDate,
        amount: inv.grandTotal,
        currency: inv.currency,
        method: r.chance(0.9) ? "bank_transfer" : "cheque",
        reference: `TRF${r.digits(10)}`,
        ibanPaidTo: inv.printedIban,
      };
      cycle.payments.push({ invoiceNumber: inv.number, payment, receipt: r.chance(0.7) ? { number: vendorReceiptNumber(r), receiptDate: toWorkingDay(addDays(paidDate, r.int(1, 5))), amount: payment.amount, currency: payment.currency } : null });
    }
  }
  return cycle;
}

/** A request for quotation still open for award: three received quotes, no PO yet. The award exercise starts here. */
export function generateOpenRfq(r: Rng, ctx: CycleContext, orderDate: string, mkPo: (r: Rng, date: string) => GenPo): { rfq: GenRfq; quotes: GenQuote[] } {
  const po = mkPo(r.fork("po"), orderDate);
  const vendor = ctx.vendors.find((v) => v.code === po.vendorCode)!;
  const issueDate = toWorkingDay(addDays(orderDate, -r.int(3, 10)));
  ctx.seqs.rfq += 1;
  const rfq: GenRfq = {
    number: seqNumber("RFQ", issueDate, ctx.seqs.rfq),
    requesterCode: po.requesterCode,
    buyerCode: po.buyerCode,
    costCenterCode: po.costCenterCode,
    issueDate,
    dueDate: toWorkingDay(addDays(issueDate, r.int(5, 10))),
    status: "quoted",
    notes: r.chance(0.4) ? "Award to lowest compliant bidder." : null,
    lines: po.lines.map((l) => ({ lineNo: l.lineNo, itemCode: l.itemCode, description: l.description, quantity: l.quantity, uom: l.uom })),
  };
  const others = r.sample(ctx.vendors.filter((v) => v.status === "active" && v.code !== vendor.code && v.category === vendor.category), 2);
  const pool = others.length === 2 ? others : r.sample(ctx.vendors.filter((v) => v.status === "active" && v.code !== vendor.code), 2);
  const quotes = [quoteFromPo(r.fork("q0"), po, vendor, issueDate, r.float(0.97, 1.03), "received"), ...pool.map((ov, i) => quoteFromPo(r.fork(`q${i + 1}`), po, ov, issueDate, r.float(1.0, 1.25), "received"))];
  return { rfq, quotes };
}

/**
 * Adds a delivered note with no goods receipt to a cycle whose order has been
 * sent but nothing has arrived against it yet. Used to top the warehouse queue
 * up to its guaranteed size: what a scenario promises has to be there.
 */
export function addPendingDelivery(r: Rng, cycle: GenCycle, vendor: GenVendor): boolean {
  // An approved order counts too: it becomes "sent" the moment goods ship,
  // which is what adding a delivery note means.
  if (cycle.deliveryNotes.length > 0 || (cycle.po.status !== "sent" && cycle.po.status !== "approved")) return false;
  cycle.po.status = "sent";
  const deliveryDate = toWorkingDay(addDays(cycle.po.expectedDeliveryDate, r.int(-2, 5)));
  // A quarter of these deliveries bring more than was ordered. Refusing them is
  // the decision the warehouse scenario is really about, so the queue has to
  // contain some: a queue where everything is fine teaches nothing.
  const overDelivery = r.chance(0.25);
  const delivered = cycle.po.lines.map((l, i) => ({
    line: l,
    qty: overDelivery && i === 0 ? Math.ceil(l.quantity * r.float(1.08, 1.4)) : r.chance(0.75) ? l.quantity : Math.max(1, Math.floor(l.quantity * r.float(0.5, 0.9))),
  }));
  cycle.deliveryNotes.push(dnFrom(r, vendor, delivered, deliveryDate, cycle.po.deliveryLocationCode, "delivered"));
  return true;
}

function dnFrom(r: Rng, vendor: GenVendor, delivered: { line: GenPoLine; qty: number }[], deliveryDate: string, locationCode: string, status: GenDeliveryNote["status"]): GenDeliveryNote {
  return {
    number: vendorDnNumber(r, deliveryDate),
    vendorCode: vendor.code,
    deliveryDate,
    deliveryLocationCode: locationCode,
    carrier: r.pick(CARRIERS),
    vehicle: `${r.pick(["RUH", "JED", "DMM", "SHJ"])} ${r.digits(4)} ${r.pick(["A", "B", "T", "K"])}`,
    packages: r.int(1, 40),
    status,
    lines: delivered.map((d, i) => ({ lineNo: i + 1, poLineNo: d.line.lineNo, itemCode: d.line.itemCode, description: d.line.description, quantity: d.qty, uom: d.line.uom })),
  };
}

/** Stand-alone invoice with no PO, or from a vendor that is not in the master. */
export function generateOrphanInvoice(r: Rng, vendor: GenVendor, items: GenItem[], date: string, kind: "invoice_no_po" | "vendor_not_in_master"): GenInvoice {
  const chosen = r.sample(items.filter((i) => i.active), r.int(1, 3));
  const lines: GenInvoiceLine[] = chosen.map((it, idx) => {
    const qty = r.int(1, 40);
    const m = lineMoney({ quantity: qty, unitPrice: it.unitPrice, discountPct: 0, taxCode: it.taxCode });
    return { lineNo: idx + 1, poLineNo: null, itemCode: it.code, description: it.name, quantity: qty, uom: it.uom, unitPrice: it.unitPrice, discountPct: 0, taxCode: it.taxCode, taxRate: TAX_CODES[it.taxCode].rate, taxAmount: m.tax, lineTotal: m.net };
  });
  const invoiceDate = toWorkingDay(date);
  const inv: GenInvoice = {
    number: vendorInvoiceNumber(r, invoiceDate),
    vendorCode: vendor.code,
    printedVendorName: vendor.name,
    printedVendorTaxId: vendor.taxId,
    printedIban: vendor.iban,
    printedBankName: vendor.bankName,
    printedPoNumber: null,
    invoiceDate,
    dueDate: addDays(invoiceDate, vendor.paymentTermsDays),
    receivedDate: toWorkingDay(addDays(invoiceDate, r.int(0, 4))),
    currency: "SAR",
    ...recomputeInvoiceTotals(lines),
    status: "pending_extraction",
    lines,
    defects: [],
  };
  const fakePo: GenPo = { ...({} as GenPo), number: "", orderDate: invoiceDate, currency: "SAR", lines: [] };
  applyDefect(r, inv, kind, { po: fakePo, vendor, grnQty: new Map(), existingInvoiceNumbers: [] });
  return inv;
}

/** Vendor compliance documents; deterministic per vendor. */
export interface GenVendorDocument { kind: "vendor_licence" | "vendor_tax_card" | "vendor_bank_letter" | "vendor_trade_licence"; number: string; issuedDate: string; expiryDate: string; issuer: string; attributes: Record<string, string> }

export function generateVendorDocuments(r: Rng, v: GenVendor): GenVendorDocument[] {
  const issued = addDays(v.crExpiry, -5 * 365);
  const activities = r.sample(["Wholesale of office supplies", "Import and export", "General contracting", "IT services and software", "Retail trade", "Warehousing and logistics", "Industrial equipment supply", "Printing and publishing", "Cleaning and facility services", "Medical equipment trading"], r.int(1, 3));
  return [
    { kind: "vendor_licence", number: v.crNumber, issuedDate: issued, expiryDate: v.crExpiry, issuer: "Ministry of Commerce", attributes: { legalForm: v.legalForm, capital: `${r.pick([100000, 500000, 1000000, 5000000]).toLocaleString("en-US")} ${v.currency}`, activities: activities.join("; "), manager: v.contactName, city: v.city } },
    { kind: "vendor_tax_card", number: v.taxId, issuedDate: addDays(v.taxCertExpiry, -365), expiryDate: v.taxCertExpiry, issuer: "Tax and Customs Authority", attributes: { vatGroup: r.pick(["Standard", "Standard", "Simplified"]), taxOffice: `${v.city} Large Taxpayers Office` } },
    { kind: "vendor_bank_letter", number: `BL-${r.digits(8)}`, issuedDate: addDays(CORPUS_TODAY, -r.int(30, 400)), expiryDate: addDays(CORPUS_TODAY, r.int(200, 600)), issuer: v.bankName, attributes: { iban: v.iban, swift: v.swift, accountName: v.name, branch: `${v.city} Main Branch` } },
    { kind: "vendor_trade_licence", number: `TL-${r.digits(7)}`, issuedDate: addDays(issued, 30), expiryDate: addDays(v.crExpiry, -r.int(0, 300)), issuer: `${v.city} Municipality`, attributes: { premises: v.addressLine, category: v.category } },
  ];
}
