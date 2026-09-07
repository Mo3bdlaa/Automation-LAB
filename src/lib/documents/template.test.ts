import { describe, expect, it } from "vitest";
import { renderPurchaseOrderHtml } from "./templates/purchase-order";
import { SPECIMEN_TEXT } from "./templates/base";
import { documentFilename } from "./service";

describe("purchase order template", () => {
  it("contains the watermark, Arabic labels, and escapes user content", () => {
    const html = renderPurchaseOrderHtml({
      number: "PO-2026-05001",
      orderDate: "2026-08-20",
      expectedDeliveryDate: "2026-09-01",
      currency: "SAR",
      paymentTermsDays: 30,
      status: "approved",
      notes: "<script>alert(1)</script>",
      subtotal: "100.00",
      taxTotal: "15.00",
      grandTotal: "115.00",
      vendor: { code: "V-00001", name: "Acme & Sons", nameAr: "أكمي وأولاده", addressLine: "1 Road", city: "Riyadh", country: "SA", taxId: "300124587600003", crNumber: "1010456784", iban: "SA0380000000608010167519", bankName: "Bank", contactName: "X", email: "x@y.example", phone: "+966" },
      buyer: null,
      requester: null,
      approver: null,
      costCenter: null,
      deliveryLocation: null,
      lines: [{ lineNo: 1, itemCode: "ITM-000001", description: "Thing", descriptionAr: "شيء", quantity: "1", uom: "EA", unitPrice: "100.0000", discountPct: "0.00", taxCode: "S15", taxAmount: "15.00", lineTotal: "100.00" }],
    });
    expect(html).toContain(SPECIMEN_TEXT);
    expect(html).toContain("أمر شراء");
    expect(html).toContain("Acme &amp; Sons");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain('id="po-number" data-gt-field="number">PO-2026-05001');
    // Every graded field is tagged, which is what the renderer measures.
    expect(html).toContain('data-gt-field="grandTotal"');
    expect(html).toContain('data-gt-field="lines[0].unitPrice"');
    expect(html).toContain("@font-face");
  });
  it("builds predictable filenames", () => {
    expect(documentFilename("PO-2026-05001", "Al Faisal Trading LLC")).toBe("PO-2026-05001_AL-FAISAL-TRADING-LLC.pdf");
    expect(documentFilename("INV-2026-00412", "ACME Trading & Co.")).toBe("INV-2026-00412_ACME-TRADING-CO.pdf");
  });
});
