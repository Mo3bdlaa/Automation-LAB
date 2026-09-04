import { describe, expect, it } from "vitest";
import { runRules, describeRules } from "./engine";
import { vendorRules, itemRules, poRules, ALL_RULES, type VendorContext, type PoContext } from "./rules";

const goodVendor: VendorContext["vendor"] = {
  code: "V-10001",
  name: "Test Supplies LLC",
  crNumber: "1010456784",
  crExpiry: "2027-01-01",
  taxId: "300124587600003",
  taxCertExpiry: "2027-01-01",
  iban: "SA0380000000608010167519",
  currency: "SAR",
  paymentTermsDays: 30,
  email: "a@b.example",
  rating: 4,
  blacklisted: false,
  status: "active",
};

describe("engine", () => {
  it("rule ids are unique and described", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(describeRules(ALL_RULES).every((r) => r.id && r.severity && r.description)).toBe(true);
  });
  it("warnings do not block, errors do", () => {
    const res = runRules(vendorRules, { vendor: { ...goodVendor, taxCertExpiry: "2020-01-01" }, existing: [], today: "2026-09-01" });
    expect(res.ok).toBe(true);
    expect(res.violations.map((v) => v.ruleId)).toEqual(["VEND-TAX-CERT-EXP"]);
    const bad = runRules(vendorRules, { vendor: { ...goodVendor, iban: "SA0380000000608010167518" }, existing: [], today: "2026-09-01" });
    expect(bad.ok).toBe(false);
    expect(bad.violations.some((v) => v.ruleId === "VEND-IBAN")).toBe(true);
  });
  it("sorts critical first", () => {
    const res = runRules(vendorRules, {
      vendor: { ...goodVendor, taxCertExpiry: "2020-01-01" },
      existing: [{ code: "V-00001", name: "Other", taxId: goodVendor.taxId, iban: "X", blacklisted: false }],
      today: "2026-09-01",
    });
    expect(res.violations[0].ruleId).toBe("VEND-DUP-TAXID");
    expect(res.violations[0].severity).toBe("critical");
  });
});

describe("vendor rules", () => {
  it("catches bad formats and duplicates", () => {
    const res = runRules(vendorRules, {
      vendor: { ...goodVendor, code: "V1", crNumber: "1010456783", taxId: "300124587600004", email: "nope", paymentTermsDays: 500, blacklisted: true },
      existing: [{ code: "V-00002", name: "test supplies llc", taxId: "1", iban: goodVendor.iban, blacklisted: false }],
      today: "2026-09-01",
    });
    const ids = res.violations.map((v) => v.ruleId).sort();
    expect(ids).toEqual(["VEND-BLACKLIST", "VEND-CR-FMT", "VEND-DUP-NAME", "VEND-EMAIL-FMT", "VEND-IBAN-DUP", "VEND-TAXID-FMT", "VEND-TERMS-RANGE", "VEND-CODE-FMT"].sort());
  });
});

describe("item rules", () => {
  it("validates uom, tax code, price", () => {
    const res = runRules(itemRules, { item: { code: "ITM-000001", name: "Xy", uom: "BLAH", taxCode: "S99", unitPrice: 0, currency: "SAR" }, existing: [{ code: "ITM-000001", name: "X" }] });
    expect(res.violations.map((v) => v.ruleId).sort()).toEqual(["ITEM-DUP-CODE", "ITEM-PRICE-POS", "ITEM-TAX-CODE", "ITEM-UOM"]);
  });
});

describe("po rules", () => {
  const items = new Map([["ITM-000001", { code: "ITM-000001", unitPrice: 100, uom: "EA", taxCode: "S15", active: true }]]);
  const base: PoContext = {
    po: { vendorCode: "V-00001", currency: "SAR", orderDate: "2026-09-01", expectedDeliveryDate: "2026-09-10", lines: [{ lineNo: 1, itemCode: "ITM-000001", quantity: 2, unitPrice: 100, discountPct: 0, taxCode: "S15", uom: "EA" }], subtotal: 200, taxTotal: 30, grandTotal: 230 },
    vendor: { code: "V-00001", status: "active", blacklisted: false, taxCertExpiry: "2027-01-01" },
    items,
    approver: { approvalLimit: 1000 },
    today: "2026-09-01",
  };
  it("passes a clean PO", () => {
    expect(runRules(poRules, base).ok).toBe(true);
  });
  it("flags price variance beyond tolerance, but not within", () => {
    const within = runRules(poRules, { ...base, po: { ...base.po, lines: [{ ...base.po.lines[0], unitPrice: 101.5 }], subtotal: 203, taxTotal: 30.45, grandTotal: 233.45 } });
    expect(within.violations.map((v) => v.ruleId)).not.toContain("PO-PRICE-VARIANCE");
    const beyond = runRules(poRules, { ...base, po: { ...base.po, lines: [{ ...base.po.lines[0], unitPrice: 110 }], subtotal: 220, taxTotal: 33, grandTotal: 253 } });
    expect(beyond.violations.map((v) => v.ruleId)).toContain("PO-PRICE-VARIANCE");
  });
  it("flags totals that do not tie, unknown items, blacklisted vendor, approval limit", () => {
    const res = runRules(poRules, {
      ...base,
      po: { ...base.po, grandTotal: 231, lines: [...base.po.lines, { lineNo: 2, itemCode: "ITM-999999", quantity: 0, unitPrice: 1, discountPct: 0, taxCode: "S15", uom: "EA" }] },
      vendor: { ...base.vendor!, blacklisted: true },
      approver: { approvalLimit: 100 },
    });
    const ids = res.violations.map((v) => v.ruleId);
    expect(ids).toContain("PO-TOTAL-TIE");
    expect(ids).toContain("PO-ITEM-EXISTS");
    expect(ids).toContain("PO-QTY-POS");
    expect(ids).toContain("PO-VENDOR-ACTIVE");
    expect(ids).toContain("PO-APPROVAL-LIMIT");
    expect(res.ok).toBe(false);
  });
});
