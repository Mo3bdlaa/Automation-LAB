import { describe, expect, it } from "vitest";
import { Rng, hashString, seedForUser, SHARED_CORPUS_SEED } from "./rng";
import { crCheckDigit, ibanCheckDigits, isLuhnValid, isValidCrNumber, isValidIban, isValidTaxId, luhnCheckDigit, makeCrNumber, makeTaxId } from "./checksums";
import { BANKS, makeIban } from "./iban";
import { lineMoney, totals } from "./money";
import { generateCorpus, generateVendors, assertCorpusCoherent, generateItems, generateEmployees, generatePo } from "./corpus";
import { assignInvoiceRegistrations, generateSandbox, purchaseOrderGroundTruth } from "./sandbox";
import { generateVendorDocuments } from "./cycle";
import { addDays, businessNumber, toWorkingDay } from "./dates";

describe("Rng", () => {
  it("is deterministic for the same seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 20 }, () => a.int(0, 1000))).toEqual(Array.from({ length: 20 }, () => b.int(0, 1000)));
  });
  it("forks give independent but deterministic streams", () => {
    const a = new Rng("x").fork("vendors");
    const b = new Rng("x").fork("vendors");
    const c = new Rng("x").fork("items");
    expect(a.next()).toEqual(b.next());
    expect(new Rng("x").fork("vendors").next()).not.toEqual(c.next());
  });
  it("seedForUser is stable", () => {
    expect(seedForUser("usr_student_01")).toEqual(seedForUser("usr_student_01"));
    expect(seedForUser("usr_student_01")).not.toEqual(seedForUser("usr_student_02"));
    expect(hashString("")).toBeTypeOf("number");
  });
});

describe("checksums", () => {
  it("validates known real-format IBANs", () => {
    expect(isValidIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("SA03 8000 0000 6080 1016 7519")).toBe(true);
    expect(isValidIban("GB82 WEST 1234 5698 7654 33")).toBe(false);
    expect(ibanCheckDigits("GB", "WEST12345698765432")).toBe("82");
  });
  it("generates mod-97-valid IBANs for every bank spec", () => {
    const rng = new Rng(7);
    for (const bank of BANKS) for (let i = 0; i < 25; i++) expect(isValidIban(makeIban(rng, bank))).toBe(true);
  });
  it("Luhn", () => {
    expect(luhnCheckDigit("7992739871")).toBe("3");
    expect(isLuhnValid("79927398713")).toBe(true);
    expect(isLuhnValid("79927398714")).toBe(false);
  });
  it("tax IDs and CR numbers round-trip", () => {
    const rng = new Rng(9);
    for (let i = 0; i < 200; i++) {
      const tax = makeTaxId(rng.digits(13));
      expect(tax).toHaveLength(15);
      expect(isValidTaxId(tax)).toBe(true);
      const cr = makeCrNumber(String(rng.int(1, 9)) + rng.digits(8));
      expect(isValidCrNumber(cr)).toBe(true);
    }
    expect(isValidTaxId("300124587600002")).toBe(false);
    expect(isValidCrNumber("1010456784")).toBe(true);
    expect(isValidCrNumber("1010456783")).toBe(false);
    expect(crCheckDigit("101045678")).toBe("4");
  });
});

describe("money", () => {
  it("lines tie", () => {
    const m = lineMoney({ quantity: 3, unitPrice: 19.99, discountPct: 5, taxCode: "S15" });
    expect(m.net).toBe(56.97);
    expect(m.tax).toBe(8.55);
    expect(m.gross).toBe(65.52);
    const t = totals([
      { quantity: 3, unitPrice: 19.99, discountPct: 5, taxCode: "S15" },
      { quantity: 1, unitPrice: 100, discountPct: 0, taxCode: "Z00" },
    ]);
    expect(t).toEqual({ subtotal: 156.97, taxTotal: 8.55, grandTotal: 165.52 });
  });
});

describe("dates", () => {
  it("helpers", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(businessNumber("PO", "2026-03-04", 17)).toBe("PO-2026-00017");
    expect(toWorkingDay("2026-09-04")).toBe("2026-09-06"); // Friday → Sunday
  });
});

describe("corpus", () => {
  const corpus = generateCorpus(SHARED_CORPUS_SEED);
  it("has the designed sizes and unique codes", () => {
    expect(corpus.vendors).toHaveLength(250);
    expect(corpus.items).toHaveLength(1200);
    expect(corpus.employees).toHaveLength(60);
    expect(corpus.costCenters).toHaveLength(15);
    expect(corpus.glAccounts).toHaveLength(40);
    expect(corpus.deliveryLocations).toHaveLength(8);
    expect(new Set(corpus.vendors.map((v) => v.code)).size).toBe(250);
    expect(new Set(corpus.items.map((i) => i.code)).size).toBe(1200);
    expect(new Set(corpus.history.map((p) => p.number)).size).toBe(corpus.history.length);
  });
  it("is deterministic", () => {
    const again = generateCorpus(SHARED_CORPUS_SEED);
    expect(again.vendors[17]).toEqual(corpus.vendors[17]);
    expect(again.history[123]).toEqual(corpus.history[123]);
    expect(generateVendors(new Rng(1), 3)).toEqual(generateVendors(new Rng(1), 3));
  });
  it("every vendor has valid identifiers and bilingual names", () => {
    for (const v of corpus.vendors) {
      expect(isValidIban(v.iban)).toBe(true);
      expect(isValidTaxId(v.taxId)).toBe(true);
      expect(isValidCrNumber(v.crNumber)).toBe(true);
      expect(v.nameAr.length).toBeGreaterThan(0);
      expect(v.email).toMatch(/@/);
    }
  });
  it("history ties arithmetically and dates are ordered", () => {
    assertCorpusCoherent(corpus);
    for (const po of corpus.history) {
      expect(po.expectedDeliveryDate >= po.orderDate).toBe(true);
      expect(po.historical).toBe(true);
      expect(po.lines.length).toBeGreaterThan(0);
    }
  });
});

describe("sandbox", () => {
  const rng = new Rng(3);
  const ctx = { vendors: generateVendors(rng.fork("v"), 30), items: generateItems(rng.fork("i"), 150), employees: generateEmployees(rng.fork("e")), deliveryLocations: ["WH-RUH-01", "HQ-RUH"] };
  it("is reproducible from the seed and does not collide with history numbering", () => {
    const a = generateSandbox(seedForUser("u1"), ctx);
    const b = generateSandbox(seedForUser("u1"), ctx);
    expect(a).toEqual(b);
    expect(a.cycles).toHaveLength(60);
    for (const c of a.cycles) expect(Number(c.po.number.slice(-5))).toBeGreaterThan(5000);
    expect(generateSandbox(seedForUser("u2"), ctx)).not.toEqual(a);
  });
  it("produces a coherent cycle with labelled defects", () => {
    const a = generateSandbox(seedForUser("u1"), ctx);
    const invoices = [...a.cycles.flatMap((c) => c.invoices), ...a.orphanInvoices];
    expect(invoices.length).toBeGreaterThan(20);
    const defects = invoices.flatMap((i) => i.defects);
    expect(defects.length).toBeGreaterThan(5);
    expect(new Set(defects.map((d) => d.type)).size).toBeGreaterThan(4);
    for (const c of a.cycles) {
      if (c.rfq) expect(c.quotes).toHaveLength(3);
      for (const q of c.quotes) expect(q.quoteDate >= c.rfq!.issueDate).toBe(true);
      for (const g of c.grns) for (const l of g.lines) expect(l.quantityAccepted + l.quantityRejected).toBe(l.quantityReceived);
      for (const inv of c.invoices) {
        if (!inv.defects.some((d) => d.type === "off_by_one_total")) {
          const sub = inv.lines.reduce((s, l) => s + l.lineTotal, 0);
          expect(Math.abs(sub - inv.subtotal)).toBeLessThan(0.02);
        }
        if (c.po.status === "closed") expect(inv.status).toBe("paid");
      }
      for (const p of c.payments) expect(c.invoices.some((i) => i.number === p.invoiceNumber)).toBe(true);
    }
    for (const o of a.orphanInvoices) expect(o.defects.some((d) => d.type === "invoice_no_po" || d.type === "vendor_not_in_master")).toBe(true);
    const regs = assignInvoiceRegistrations(a);
    expect(new Set(regs.values()).size).toBe(invoices.length);
  });
  it("vendor compliance documents are deterministic and consistent with the vendor", () => {
    const v = ctx.vendors[0];
    const d1 = generateVendorDocuments(new Rng(1).fork("x"), v);
    const d2 = generateVendorDocuments(new Rng(1).fork("x"), v);
    expect(d1).toEqual(d2);
    expect(d1.find((d) => d.kind === "vendor_licence")!.number).toBe(v.crNumber);
    expect(d1.find((d) => d.kind === "vendor_tax_card")!.expiryDate).toBe(v.taxCertExpiry);
  });
  it("ground truth covers header and every line", () => {
    const po = generatePo(rng.fork("po"), ctx, { number: "PO-2026-05001", orderDate: "2026-08-01", status: "approved", historical: false });
    const vendor = ctx.vendors.find((v) => v.code === po.vendorCode)!;
    const gt = purchaseOrderGroundTruth(po, vendor);
    const fields = new Set(gt.map((g) => g.field));
    expect(fields.has("grandTotal")).toBe(true);
    expect(fields.has("vendor.iban")).toBe(true);
    expect(fields.has(`lines[${po.lines.length - 1}].lineTotal`)).toBe(true);
    expect(gt.find((g) => g.field === "grandTotal")!.value).toBe(po.grandTotal.toFixed(2));
  });
});
