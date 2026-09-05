/**
 * Three-way match: invoice vs purchase order vs goods receipts. Runs on the
 * same engine as the form rules, so violations carry stable rule IDs that
 * bots branch on. The rule IDs here are the ones named in docs/spec.md.
 */
import { CORPUS_TODAY } from "../generator/dates";
import { TAX_CODES, round2 } from "../generator/money";
import type { Rule } from "./engine";

export interface MatchInvoiceLine {
  lineNo: number;
  poLineNo: number | null;
  itemCode: string | null;
  quantity: number;
  uom: string;
  unitPrice: number;
  discountPct: number;
  taxCode: string;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface MatchContext {
  invoice: {
    number: string;
    printedPoNumber: string | null;
    printedVendorName: string;
    printedVendorTaxId: string;
    printedIban: string;
    invoiceDate: string;
    currency: string;
    subtotal: number;
    taxTotal: number;
    grandTotal: number;
    lines: MatchInvoiceLine[];
  };
  /** Vendor from the master matched by tax id, or null. */
  vendor: { code: string; name: string; iban: string; taxCertExpiry: string; status: string; blacklisted: boolean } | null;
  /** Purchase order referenced by the printed PO number, or null. */
  po: { number: string; currency: string; vendorCode: string; lines: { lineNo: number; itemCode: string; quantity: number; uom: string; unitPrice: number; discountPct: number; taxCode: string }[] } | null;
  /** Accepted quantity per PO line across all posted GRNs. */
  receivedByPoLine: Map<number, number>;
  /** Quantity already invoiced per PO line by other invoices. */
  previouslyInvoicedByPoLine: Map<number, number>;
  /** Other invoice numbers from the same vendor (same fiscal year). */
  otherInvoiceNumbers: string[];
  today?: string;
}

const poLine = (ctx: MatchContext, l: MatchInvoiceLine) => ctx.po?.lines.find((p) => (l.poLineNo != null ? p.lineNo === l.poLineNo : p.itemCode === l.itemCode)) ?? null;

export const matchRules: Rule<MatchContext>[] = [
  {
    id: "INV-VENDOR-MASTER",
    severity: "critical",
    appliesTo: "invoice",
    description: "The invoicing vendor (by tax ID) must exist in the vendor master.",
    check: ({ invoice, vendor }) => (vendor ? null : { field: "vendor", message: `No vendor with tax ID ${invoice.printedVendorTaxId} (${invoice.printedVendorName}) in the master.` }),
  },
  {
    id: "INV-VENDOR-BLOCKED",
    severity: "critical",
    appliesTo: "invoice",
    description: "The vendor must be active and not blacklisted.",
    check: ({ vendor }) => (vendor && (vendor.blacklisted || vendor.status !== "active") ? { field: "vendor", message: `Vendor ${vendor.code} is ${vendor.blacklisted ? "blacklisted" : vendor.status}.` } : null),
  },
  {
    id: "INV-NO-PO",
    severity: "error",
    appliesTo: "invoice",
    description: "The invoice must reference an existing purchase order.",
    check: ({ invoice, po }) => (po ? null : { field: "poNumber", message: invoice.printedPoNumber ? `PO ${invoice.printedPoNumber} not found.` : "Invoice carries no PO number." }),
  },
  {
    id: "INV-PO-VENDOR",
    severity: "critical",
    appliesTo: "invoice",
    description: "The invoice vendor must be the PO vendor.",
    check: ({ vendor, po }) => (vendor && po && po.vendorCode !== vendor.code ? { field: "vendor", message: `Invoice is from ${vendor.code} but PO ${po.number} was issued to ${po.vendorCode}.` } : null),
  },
  {
    id: "DUP-INV",
    severity: "critical",
    appliesTo: "invoice",
    description: "Invoice number must be unique per vendor per fiscal year.",
    check: ({ invoice, otherInvoiceNumbers }) => (otherInvoiceNumbers.includes(invoice.number) ? { field: "number", message: `Invoice number ${invoice.number} was already registered for this vendor.` } : null),
  },
  {
    id: "BANK-CHANGE",
    severity: "critical",
    appliesTo: "invoice",
    description: "Bank account printed on the invoice must match the vendor master (fraud control).",
    check: ({ invoice, vendor }) => (vendor && invoice.printedIban.replace(/\s/g, "") !== vendor.iban.replace(/\s/g, "") ? { field: "iban", message: `Printed IBAN ${invoice.printedIban} differs from master ${vendor.iban}.` } : null),
  },
  {
    id: "TAX-CERT-EXP",
    severity: "warning",
    appliesTo: "invoice",
    description: "Vendor tax certificate must be valid on the invoice date.",
    check: ({ invoice, vendor }) => (vendor && vendor.taxCertExpiry < invoice.invoiceDate ? { field: "vendor", message: `Vendor tax certificate expired ${vendor.taxCertExpiry}, before invoice date ${invoice.invoiceDate}.` } : null),
  },
  {
    id: "INV-CURRENCY",
    severity: "error",
    appliesTo: "invoice",
    description: "Invoice currency must match the PO currency.",
    check: ({ invoice, po }) => (po && po.currency !== invoice.currency ? { field: "currency", message: `Invoice in ${invoice.currency}, PO in ${po.currency}.` } : null),
  },
  {
    id: "INV-LINE-PO",
    severity: "error",
    appliesTo: "invoice_line",
    description: "Every invoice line must map to a PO line.",
    check: (ctx) => (ctx.po ? ctx.invoice.lines.filter((l) => !poLine(ctx, l)).map((l) => ({ field: `lines[${l.lineNo}]`, message: `Line ${l.lineNo} (${l.itemCode ?? l.uom}) has no matching PO line.` })) : null),
  },
  {
    id: "PO-INV-PRICE",
    severity: "error",
    appliesTo: "invoice_line",
    description: "Invoice unit price must equal the PO price within tolerance.",
    params: { tolerance: 0.02 },
    check: (ctx, p) =>
      ctx.invoice.lines
        .map((l) => ({ l, pl: poLine(ctx, l) }))
        .filter(({ l, pl }) => pl && Math.abs(l.unitPrice - pl.unitPrice) > pl.unitPrice * Number(p.tolerance) + 0.005)
        .map(({ l, pl }) => ({ field: `lines[${l.lineNo}].unitPrice`, message: `Line ${l.lineNo}: invoiced ${l.unitPrice.toFixed(2)} vs PO ${pl!.unitPrice.toFixed(2)}.` })),
  },
  {
    id: "GRN-QTY",
    severity: "error",
    appliesTo: "invoice_line",
    description: "Invoiced quantity must not exceed the quantity received and not yet invoiced.",
    check: (ctx) =>
      ctx.po
        ? ctx.invoice.lines
            .map((l) => ({ l, pl: poLine(ctx, l) }))
            .filter(({ pl }) => pl)
            .map(({ l, pl }) => {
              const received = ctx.receivedByPoLine.get(pl!.lineNo) ?? 0;
              const already = ctx.previouslyInvoicedByPoLine.get(pl!.lineNo) ?? 0;
              const open = round2(received - already);
              return l.quantity > open + 1e-9 ? { field: `lines[${l.lineNo}].quantity`, message: `Line ${l.lineNo}: invoiced ${l.quantity} but only ${open} received and open (received ${received}, already invoiced ${already}).` } : null;
            })
            .filter(Boolean) as { field: string; message: string }[]
        : null,
  },
  {
    id: "PO-QTY",
    severity: "error",
    appliesTo: "invoice_line",
    description: "Invoiced quantity must not exceed the PO quantity.",
    check: (ctx) =>
      ctx.invoice.lines
        .map((l) => ({ l, pl: poLine(ctx, l) }))
        .filter(({ l, pl }) => pl && l.quantity > pl.quantity + 1e-9)
        .map(({ l, pl }) => ({ field: `lines[${l.lineNo}].quantity`, message: `Line ${l.lineNo}: invoiced ${l.quantity} exceeds PO quantity ${pl!.quantity}.` })),
  },
  {
    id: "INV-UOM",
    severity: "error",
    appliesTo: "invoice_line",
    description: "Invoice unit of measure must match the PO line.",
    check: (ctx) =>
      ctx.invoice.lines
        .map((l) => ({ l, pl: poLine(ctx, l) }))
        .filter(({ l, pl }) => pl && pl.uom !== l.uom)
        .map(({ l, pl }) => ({ field: `lines[${l.lineNo}].uom`, message: `Line ${l.lineNo}: invoiced in ${l.uom}, PO in ${pl!.uom}.` })),
  },
  {
    id: "INV-TAX-RATE",
    severity: "error",
    appliesTo: "invoice_line",
    description: "Tax rate applied on each line must match the item's tax code.",
    check: ({ invoice }) =>
      invoice.lines
        .filter((l) => l.taxCode in TAX_CODES && Math.abs(l.taxRate - TAX_CODES[l.taxCode as keyof typeof TAX_CODES].rate) > 0.0001)
        .map((l) => ({ field: `lines[${l.lineNo}].taxRate`, message: `Line ${l.lineNo}: tax ${(l.taxRate * 100).toFixed(1)}% applied, ${l.taxCode} is ${TAX_CODES[l.taxCode as keyof typeof TAX_CODES].rate * 100}%.` })),
  },
  {
    id: "INV-TOTAL-TIE",
    severity: "error",
    appliesTo: "invoice",
    description: "Printed totals must equal the sum of the lines.",
    check: ({ invoice }) => {
      let sub = 0;
      let tax = 0;
      for (const l of invoice.lines) {
        sub = round2(sub + l.lineTotal);
        tax = round2(tax + l.taxAmount);
      }
      const out: { field: string; message: string }[] = [];
      if (round2(invoice.subtotal) !== sub) out.push({ field: "subtotal", message: `Subtotal ${invoice.subtotal.toFixed(2)} vs line sum ${sub.toFixed(2)}.` });
      if (round2(invoice.taxTotal) !== tax) out.push({ field: "taxTotal", message: `Tax total ${invoice.taxTotal.toFixed(2)} vs computed ${tax.toFixed(2)}.` });
      if (round2(invoice.grandTotal) !== round2(sub + tax)) out.push({ field: "grandTotal", message: `Grand total ${invoice.grandTotal.toFixed(2)} vs computed ${round2(sub + tax).toFixed(2)}.` });
      return out;
    },
  },
  {
    id: "INV-DATE-FUTURE",
    severity: "warning",
    appliesTo: "invoice",
    description: "Invoice date must not be in the future.",
    check: ({ invoice, today }) => (invoice.invoiceDate > (today ?? CORPUS_TODAY) ? { field: "invoiceDate", message: `Invoice date ${invoice.invoiceDate} is in the future.` } : null),
  },
];

/** Received-quantity rules also apply to GRN entry. */
export interface GrnEntryContext {
  poLines: { lineNo: number; quantity: number; uom: string }[];
  alreadyReceived: Map<number, number>;
  lines: { lineNo: number; poLineNo: number; quantityReceived: number; quantityAccepted: number; quantityRejected: number }[];
}

export const grnRules: Rule<GrnEntryContext>[] = [
  {
    id: "GRN-LINE-MIN",
    severity: "error",
    appliesTo: "grn",
    description: "A goods receipt needs at least one line with a received quantity.",
    check: ({ lines }) => (lines.some((l) => l.quantityReceived > 0) ? null : { field: "lines", message: "Enter a received quantity on at least one line." }),
  },
  {
    id: "GRN-OVER-PO",
    severity: "error",
    appliesTo: "grn_line",
    description: "Total received per PO line must not exceed the ordered quantity (over-delivery).",
    params: { tolerance: 0 },
    check: ({ poLines, alreadyReceived, lines }) =>
      lines
        .filter((l) => l.quantityReceived > 0)
        .map((l) => {
          const pl = poLines.find((p) => p.lineNo === l.poLineNo);
          if (!pl) return { field: `lines[${l.lineNo}]`, message: `Line ${l.lineNo}: PO line ${l.poLineNo} not found.` };
          const total = (alreadyReceived.get(pl.lineNo) ?? 0) + l.quantityReceived;
          return total > pl.quantity + 1e-9 ? { field: `lines[${l.lineNo}].quantityReceived`, message: `Line ${l.lineNo}: total received ${total} exceeds ordered ${pl.quantity}.` } : null;
        })
        .filter(Boolean) as { field: string; message: string }[],
  },
  {
    id: "GRN-SPLIT",
    severity: "error",
    appliesTo: "grn_line",
    description: "Accepted + rejected must equal received on each line.",
    check: ({ lines }) => lines.filter((l) => l.quantityReceived > 0 && Math.abs(l.quantityAccepted + l.quantityRejected - l.quantityReceived) > 1e-9).map((l) => ({ field: `lines[${l.lineNo}].quantityAccepted`, message: `Line ${l.lineNo}: accepted ${l.quantityAccepted} + rejected ${l.quantityRejected} ≠ received ${l.quantityReceived}.` })),
  },
];
