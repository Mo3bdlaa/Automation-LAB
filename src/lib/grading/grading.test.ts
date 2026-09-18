import { describe, expect, it } from "vitest";
import { compareBest, compareField, fieldKind, normaliseIdentifier, normaliseText, parseDate, parseNumber, similarity, westernDigits } from "./normalise";
import { gradeDefects, scoreInvoiceExtraction } from "./score";

describe("normalisation", () => {
  it("parses numbers written in different ways", () => {
    expect(parseNumber("1,234.50")).toBe(1234.5);
    expect(parseNumber("SAR 1 234.50")).toBe(1234.5);
    expect(parseNumber("1.234,50")).toBe(1234.5);
    expect(parseNumber("١٢٣٤٫٥٠".replace("٫", "."))).toBe(1234.5);
    expect(parseNumber("15%")).toBe(15);
    expect(parseNumber("abc")).toBeNull();
  });
  it("parses dates written in different ways", () => {
    expect(parseDate("2026-08-20")).toBe("2026-08-20");
    expect(parseDate("20/08/2026")).toBe("2026-08-20");
    expect(parseDate("08/20/2026")).toBe("2026-08-20");
    expect(parseDate("20-Aug-2026")).toBe("2026-08-20");
    expect(parseDate("2026/8/2")).toBe("2026-08-02");
    expect(parseDate("nonsense")).toBeNull();
  });
  it("converts Arabic-Indic digits", () => {
    expect(westernDigits("٢٠٢٦-٠٨-٢٠")).toBe("2026-08-20");
    expect(parseDate("٢٠٢٦-٠٨-٢٠")).toBe("2026-08-20");
  });
  it("normalises text and identifiers", () => {
    expect(normaliseText("Automation Lab  Trading & Contracting Co.")).toBe("automation lab trading contracting co");
    expect(normaliseIdentifier("SA03 8000 0000 6080 1016 7519")).toBe("SA0380000000608010167519");
    expect(similarity("bookshelf small", "bookshelf small")).toBe(1);
    // Different variants of one product stay well below the 0.9 match threshold.
    expect(similarity("bookshelf small", "bookshelf large")).toBeCloseTo(0.67, 1);
    expect(compareField("lines[0].description", "Bookshelf - Small", "Bookshelf - Large").match).toBe(false);
  });
  it("classifies fields", () => {
    expect(fieldKind("lines[2].unitPrice")).toBe("number");
    expect(fieldKind("lines[2].taxRate")).toBe("percent");
    expect(fieldKind("vendor.iban")).toBe("iban");
    expect(fieldKind("invoiceDate")).toBe("date");
    expect(fieldKind("vendor.name")).toBe("text");
    expect(fieldKind("lines[0].uom")).toBe("uom");
  });
  it("compares with the right tolerance per kind", () => {
    expect(compareField("grandTotal", "1234.50", "1,234.50").match).toBe(true);
    expect(compareField("grandTotal", "1234.50", "1234.49").match).toBe(false);
    expect(compareField("lines[0].taxRate", "15.0", "15").match).toBe(true);
    expect(compareField("vendor.name", "Delta Equipment Co.", "delta equipment co").match).toBe(true);
    expect(compareField("vendor.name", "Delta Equipment Co.", "Gulf Trading LLC").match).toBe(false);
    expect(compareField("number", "INV-2026-54938", "inv 2026 54938").match).toBe(true);
    expect(compareField("grandTotal", "1234.50", "").match).toBe(false);
  });
});

const truth = new Map<string, string>([
  ["number", "INV-2026-54938"],
  ["invoiceDate", "2026-09-15"],
  ["dueDate", "2026-09-30"],
  ["poNumber", "PO-2026-05057"],
  ["currency", "AED"],
  ["vendor.name", "Delta Equipment Co."],
  ["vendor.taxId", "318155144628699"],
  ["vendor.iban", "DE62370400440606913103"],
  ["vendor.bankName", "Commerzbank"],
  ["subtotal", "668679.78"],
  ["taxTotal", "100301.97"],
  ["grandTotal", "768981.75"],
  ["lineCount", "2"],
  ["lines[0].itemCode", "ITM-000046"],
  ["lines[0].description", "Bookshelf - Small"],
  ["lines[0].quantity", "41"],
  ["lines[0].uom", "EA"],
  ["lines[0].unitPrice", "693.66"],
  ["lines[0].taxRate", "15.0"],
  ["lines[0].taxAmount", "4266.01"],
  ["lines[0].lineTotal", "28440.06"],
  ["lines[1].itemCode", "ITM-000080"],
  ["lines[1].description", "Filing Cabinet 4-drawer"],
  ["lines[1].quantity", "170"],
  ["lines[1].uom", "SET"],
  ["lines[1].unitPrice", "2886.58"],
  ["lines[1].taxRate", "15.0"],
  ["lines[1].taxAmount", "73607.79"],
  ["lines[1].lineTotal", "490718.60"],
]);

const perfect: Record<string, string> = {
  number: "INV-2026-54938", invoiceDate: "15/09/2026", dueDate: "2026-09-30", poNumber: "PO-2026-05057", currency: "AED",
  vendorName: "Delta Equipment Co.", vendorTaxId: "318155144628699", iban: "DE62 3704 0044 0606 9131 03", bankName: "Commerzbank",
  subtotal: "668,679.78", taxTotal: "100301.97", grandTotal: "768981.75",
  line1ItemCode: "ITM-000046", line1Description: "Bookshelf - Small", line1Quantity: "41", line1Uom: "EA", line1UnitPrice: "693.66", line1TaxRate: "15", line1TaxAmount: "4266.01", line1LineTotal: "28440.06",
  line2ItemCode: "ITM-000080", line2Description: "Filing Cabinet 4-drawer", line2Quantity: "170", line2Uom: "SET", line2UnitPrice: "2886.58", line2TaxRate: "15", line2TaxAmount: "73607.79", line2LineTotal: "490718.60",
};

describe("extraction scoring", () => {
  it("scores a perfect extraction at 1.0 despite formatting differences", () => {
    const r = scoreInvoiceExtraction(truth, perfect);
    expect(r.score).toBe(1);
    expect(r.missingLines).toBe(0);
    expect(r.extraLines).toBe(0);
  });
  it("scores a wrong extraction far below 1", () => {
    const r = scoreInvoiceExtraction(truth, { number: "TEST-1", grandTotal: "1", line1Quantity: "1", line1UnitPrice: "1" });
    expect(r.score).toBeLessThan(0.2);
    expect(r.fields["number"].match).toBe(false);
  });
  it("does not punish lines listed out of order", () => {
    const swapped: Record<string, string> = { ...perfect };
    for (const suffix of ["ItemCode", "Description", "Quantity", "Uom", "UnitPrice", "TaxRate", "TaxAmount", "LineTotal"]) {
      swapped[`line1${suffix}`] = perfect[`line2${suffix}`];
      swapped[`line2${suffix}`] = perfect[`line1${suffix}`];
    }
    expect(scoreInvoiceExtraction(truth, swapped).score).toBe(1);
  });
  it("counts a missing line and an invented line", () => {
    const missing = { ...perfect };
    for (const suffix of ["ItemCode", "Description", "Quantity", "Uom", "UnitPrice", "TaxRate", "TaxAmount", "LineTotal"]) delete missing[`line2${suffix}`];
    const r = scoreInvoiceExtraction(truth, missing);
    expect(r.missingLines).toBe(1);
    expect(r.score).toBeLessThan(1);

    const invented = { ...perfect, line3ItemCode: "ITM-999999", line3Quantity: "5", line3Description: "Something else entirely", line3UnitPrice: "10" };
    const r2 = scoreInvoiceExtraction(truth, invented);
    expect(r2.extraLines).toBe(1);
    expect(r2.score).toBeLessThan(1);
  });
  it("blank submission scores zero", () => {
    expect(scoreInvoiceExtraction(truth, {}).score).toBe(0);
  });

  it("grades an Arabic reading of a bilingual document as correct", () => {
    // What a bot extracting the Arabic-first variant of the same invoice reads:
    // the Arabic vendor name and description, and Eastern Arabic numerals.
    const arabic: Record<string, string> = {
      ...perfect,
      vendorName: "شركة دلتا للمعدات",
      line1Description: "رف كتب - صغير",
      grandTotal: "٧٦٨٩٨١٫٧٥".replace("٫", "."),
      subtotal: "٦٦٨٦٧٩.٧٨",
      invoiceDate: "٢٠٢٦-٠٩-١٥",
    };
    const alternates = new Map<string, string[]>([
      ["vendor.name", ["شركة دلتا للمعدات"]],
      ["lines[0].description", ["رف كتب - صغير"]],
    ]);
    const r = scoreInvoiceExtraction(truth, arabic, { alternates });
    expect(r.score).toBe(1);
    // Without the alternates the same submission loses the two text fields.
    expect(scoreInvoiceExtraction(truth, arabic).score).toBeLessThan(1);
  });

  it("keeps the primary reading when the submission matches neither", () => {
    const cmp = compareBest("vendor.name", "Delta Equipment Co.", ["شركة دلتا للمعدات"], "Something Else Ltd");
    expect(cmp.match).toBe(false);
    expect(cmp.expectedNormalised).toBe("delta equipment co");
  });
});

describe("defect grading", () => {
  const seeded = [
    { defectType: "price_variance", details: { ruleId: "PO-INV-PRICE" } },
    { defectType: "bank_account_changed", details: { ruleId: "BANK-CHANGE" } },
  ];
  it("counts caught, missed and false positives", () => {
    const g = gradeDefects(seeded, [
      { ruleId: "PO-INV-PRICE", severity: "error" },
      { ruleId: "INV-TOTAL-TIE", severity: "error" },
      { ruleId: "TAX-CERT-EXP", severity: "warning" },
    ]);
    expect(g.caught.map((c) => c.ruleId)).toEqual(["PO-INV-PRICE"]);
    expect(g.missed.map((c) => c.ruleId)).toEqual(["BANK-CHANGE"]);
    expect(g.falsePositives).toEqual(["INV-TOTAL-TIE"]);
    expect(g.recall).toBe(0.5);
    expect(g.precision).toBe(0.5);
  });
  it("a clean document with no findings is perfect", () => {
    const g = gradeDefects([], []);
    expect(g.recall).toBe(1);
    expect(g.precision).toBe(1);
  });
  it("warnings never count as findings", () => {
    expect(gradeDefects([], [{ ruleId: "TAX-CERT-EXP", severity: "warning" }]).falsePositives).toEqual([]);
  });

  it("does not blame the reader for a violation the document itself carries", () => {
    // An invoice whose goods have not been receipted raises GRN-QTY however
    // perfectly it is read. Counting that as an invention made the exceptions
    // parameter unwinnable: a flawless run scored 12.5 of 25 on it.
    const baseline = [{ ruleId: "GRN-QTY", severity: "error" }];
    const g = gradeDefects([], [{ ruleId: "GRN-QTY", severity: "error" }], baseline);
    expect(g.falsePositives).toEqual([]);
  });

  it("still blames the reader for a violation their reading introduced", () => {
    const baseline = [{ ruleId: "GRN-QTY", severity: "error" }];
    const g = gradeDefects([], [{ ruleId: "GRN-QTY", severity: "error" }, { ruleId: "PO-INV-PRICE", severity: "error" }], baseline);
    expect(g.falsePositives).toEqual(["PO-INV-PRICE"]);
  });
});
