import { describe, expect, it } from "vitest";
import { runRules } from "./engine";
import { grnRules, matchRules, type MatchContext } from "./matching";
import { Rng } from "../generator/rng";
import { generateEmployees, generateItems, generatePo, generateVendors } from "../generator/corpus";
import { applyDefect, generateCycle, type DefectType } from "../generator/cycle";

function baseCtx(): MatchContext {
  return {
    invoice: {
      number: "INV-2026-00001", printedPoNumber: "PO-2026-05001", printedVendorName: "V", printedVendorTaxId: "300124587600003", printedIban: "SA0380000000608010167519",
      invoiceDate: "2026-08-20", currency: "SAR", subtotal: 200, taxTotal: 30, grandTotal: 230,
      lines: [{ lineNo: 1, poLineNo: 1, itemCode: "ITM-000001", quantity: 2, uom: "EA", unitPrice: 100, discountPct: 0, taxCode: "S15", taxRate: 0.15, taxAmount: 30, lineTotal: 200 }],
    },
    vendor: { code: "V-00001", name: "V", iban: "SA0380000000608010167519", taxCertExpiry: "2027-01-01", status: "active", blacklisted: false },
    po: { number: "PO-2026-05001", currency: "SAR", vendorCode: "V-00001", lines: [{ lineNo: 1, itemCode: "ITM-000001", quantity: 2, uom: "EA", unitPrice: 100, discountPct: 0, taxCode: "S15" }] },
    receivedByPoLine: new Map([[1, 2]]),
    previouslyInvoicedByPoLine: new Map(),
    otherInvoiceNumbers: [],
    today: "2026-09-01",
  };
}

describe("three-way match", () => {
  it("passes a clean invoice", () => {
    const r = runRules(matchRules, baseCtx());
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });
  it("flags each seeded defect with its rule id", () => {
    const cases: [Partial<MatchContext> | ((c: MatchContext) => void), string][] = [
      [(c) => (c.invoice.lines[0].unitPrice = 110), "PO-INV-PRICE"],
      [(c) => (c.invoice.lines[0].quantity = 3), "GRN-QTY"],
      [(c) => (c.otherInvoiceNumbers = ["INV-2026-00001"]), "DUP-INV"],
      [(c) => (c.invoice.printedIban = "SA0380000000608010167518"), "BANK-CHANGE"],
      [(c) => (c.vendor!.taxCertExpiry = "2026-01-01"), "TAX-CERT-EXP"],
      [(c) => (c.invoice.currency = "USD"), "INV-CURRENCY"],
      [(c) => (c.invoice.lines[0].uom = "BOX"), "INV-UOM"],
      [(c) => (c.invoice.lines[0].taxRate = 0.05), "INV-TAX-RATE"],
      [(c) => (c.invoice.grandTotal = 231), "INV-TOTAL-TIE"],
      [(c) => (c.po = null), "INV-NO-PO"],
      [(c) => (c.vendor = null), "INV-VENDOR-MASTER"],
      [(c) => (c.po!.vendorCode = "V-00002"), "INV-PO-VENDOR"],
    ];
    for (const [mutate, ruleId] of cases) {
      const c = baseCtx();
      (mutate as (c: MatchContext) => void)(c);
      const r = runRules(matchRules, c);
      expect(r.violations.map((v) => v.ruleId), ruleId).toContain(ruleId);
    }
  });
  it("GRN-QTY accounts for quantities already invoiced", () => {
    const c = baseCtx();
    c.previouslyInvoicedByPoLine = new Map([[1, 1]]);
    expect(runRules(matchRules, c).violations.map((v) => v.ruleId)).toContain("GRN-QTY");
  });
});

describe("generated defects are caught by the match rules", () => {
  const rng = new Rng(11);
  const vendors = generateVendors(rng.fork("v"), 20);
  const items = generateItems(rng.fork("i"), 100);
  const employees = generateEmployees(rng.fork("e"));
  const po = generatePo(rng.fork("po"), { vendors, items, employees }, { number: "PO-2026-05001", orderDate: "2026-07-01", status: "received", historical: false });
  const cycle = generateCycle(rng.fork("c"), po, { vendors, items, employees, deliveryLocations: ["WH-RUH-01"], seqs: { rfq: 0, grn: 0, payment: 0, invoiceReg: 0 } }, [], 0);
  const vendor = vendors.find((v) => v.code === po.vendorCode)!;
  const invoice = cycle.invoices[0];

  function ctxFor(inv: typeof invoice): MatchContext {
    const grnQty = new Map<number, number>();
    for (const g of cycle.grns) for (const l of g.lines) grnQty.set(l.poLineNo, (grnQty.get(l.poLineNo) ?? 0) + l.quantityAccepted);
    return {
      invoice: { number: inv.number, printedPoNumber: inv.printedPoNumber, printedVendorName: inv.printedVendorName, printedVendorTaxId: inv.printedVendorTaxId, printedIban: inv.printedIban, invoiceDate: inv.invoiceDate, currency: inv.currency, subtotal: inv.subtotal, taxTotal: inv.taxTotal, grandTotal: inv.grandTotal, lines: inv.lines },
      vendor: inv.vendorCode ? { code: vendor.code, name: vendor.name, iban: vendor.iban, taxCertExpiry: "2027-01-01", status: "active", blacklisted: false } : null,
      po: inv.printedPoNumber === po.number ? { number: po.number, currency: po.currency, vendorCode: vendor.code, lines: po.lines } : null,
      receivedByPoLine: grnQty,
      previouslyInvoicedByPoLine: new Map(),
      otherInvoiceNumbers: ["INV-X"],
      today: "2026-09-30",
    };
  }

  it("clean generated invoice matches", () => {
    expect(invoice).toBeDefined();
    const r = runRules(matchRules, ctxFor(invoice));
    expect(r.violations.filter((v) => v.severity !== "warning")).toEqual([]);
  });

  const expected: [DefectType, string][] = [
    ["price_variance", "PO-INV-PRICE"], ["over_delivery", "GRN-QTY"], ["duplicate_invoice", "DUP-INV"], ["wrong_tax_rate", "INV-TAX-RATE"],
    ["bank_account_changed", "BANK-CHANGE"], ["currency_mismatch", "INV-CURRENCY"], ["uom_mismatch", "INV-UOM"], ["off_by_one_total", "INV-TOTAL-TIE"],
    ["invoice_no_po", "INV-NO-PO"], ["vendor_not_in_master", "INV-VENDOR-MASTER"],
  ];
  for (const [type, ruleId] of expected) {
    it(`${type} → ${ruleId}`, () => {
      const inv = structuredClone(invoice);
      const grnQty = new Map<number, number>();
      for (const g of cycle.grns) for (const l of g.lines) grnQty.set(l.poLineNo, l.quantityAccepted);
      applyDefect(new Rng(5), inv, type, { po, vendor, grnQty, existingInvoiceNumbers: ["INV-X"] });
      expect(inv.defects.map((d) => d.type)).toContain(type);
      expect(inv.defects[0].details.ruleId).toBe(ruleId);
      const r = runRules(matchRules, ctxFor(inv));
      expect(r.violations.map((v) => v.ruleId)).toContain(ruleId);
    });
  }
});

describe("GRN entry rules", () => {
  it("rejects over-receipt and inconsistent splits", () => {
    const r = runRules(grnRules, {
      poLines: [{ lineNo: 1, quantity: 10, uom: "EA" }],
      alreadyReceived: new Map([[1, 8]]),
      lines: [{ lineNo: 1, poLineNo: 1, quantityReceived: 5, quantityAccepted: 3, quantityRejected: 1 }],
    });
    expect(r.violations.map((v) => v.ruleId).sort()).toEqual(["GRN-OVER-PO", "GRN-SPLIT"]);
  });
});
