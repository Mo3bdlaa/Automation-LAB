/**
 * Renders one sample of each document kind used as a figure in the PDD, from
 * the same generators the lab uses, into .data/pdd-samples/*.html.
 * scripts/capture-pdd-figures.mjs screenshots them with callouts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Rng, SHARED_CORPUS_SEED } from "../src/lib/generator/rng";
import { generateEmployees, generateItems, generatePo, generateVendors } from "../src/lib/generator/corpus";
import { generateCycle, generateVendorDocuments } from "../src/lib/generator/cycle";
import { renderInvoiceHtml, renderVendorComplianceHtml } from "../src/lib/documents/templates/vendor-documents";
import { renderPurchaseOrderHtml } from "../src/lib/documents/templates/purchase-order";

const OUT = ".data/pdd-samples";
mkdirSync(OUT, { recursive: true });

const rng = new Rng(SHARED_CORPUS_SEED);
const vendors = generateVendors(rng.fork("vendors"), 40);
const items = generateItems(rng.fork("items"), 200);
const employees = generateEmployees(rng.fork("employees"));
const ctx = { vendors, items, employees };

const po = generatePo(rng.fork("pdd:po"), ctx, { number: "PO-2026-05057", orderDate: "2026-08-20", status: "received", historical: false });
const vendor = vendors.find((v) => v.code === po.vendorCode)!;
const party = { ...vendor, code: vendor.code, swift: vendor.swift, contactName: vendor.contactName };
const emp = (code: string) => employees.find((e) => e.code === code)!;
const itemAr = (code: string) => items.find((i) => i.code === code)?.nameAr ?? null;

writeFileSync(
  `${OUT}/purchase-order.html`,
  renderPurchaseOrderHtml({
    ...po,
    vendor: party,
    buyer: { name: emp(po.buyerCode).name, email: emp(po.buyerCode).email },
    requester: { name: emp(po.requesterCode).name },
    approver: { name: emp(po.approverCode).name },
    costCenter: { code: po.costCenterCode, name: "Operations" },
    deliveryLocation: { code: po.deliveryLocationCode, name: "Riyadh Central Warehouse", addressLine: "Exit 18, Second Industrial City", city: "Riyadh" },
    lines: po.lines.map((l) => ({ ...l, descriptionAr: itemAr(l.itemCode) })),
  }),
);

// A cycle with a defect rate of 1 guarantees the invoice figure shows a seeded defect.
const cycle = generateCycle(rng.fork("pdd:cycle"), po, { ...ctx, deliveryLocations: ["WH-RUH-01"], seqs: { rfq: 0, grn: 0, payment: 0, invoiceReg: 0 } }, [], 1);
const inv = cycle.invoices[0];
const invoiceHtml = renderInvoiceHtml({
    number: inv.number, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, poNumber: inv.printedPoNumber, currency: inv.currency,
    subtotal: inv.subtotal, taxTotal: inv.taxTotal, grandTotal: inv.grandTotal,
    // Pinned so the figures show one bilingual and one Arabic-first invoice
    // whatever script this particular vendor happens to print in.
    vendor: { ...party, ...(inv.ghostVendor ?? {}), documentLanguage: "bilingual" as const }, printedIban: inv.printedIban, printedBankName: inv.printedBankName,
  lines: inv.lines.map((l) => ({ ...l, descriptionAr: l.itemCode ? itemAr(l.itemCode) : null })),
});
writeFileSync(`${OUT}/invoice.html`, invoiceHtml);

// The same invoice as an Arabic-first vendor would print it.
writeFileSync(
  `${OUT}/invoice-arabic.html`,
  renderInvoiceHtml({
    number: inv.number, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, poNumber: inv.printedPoNumber, currency: inv.currency,
    subtotal: inv.subtotal, taxTotal: inv.taxTotal, grandTotal: inv.grandTotal,
    vendor: { ...party, ...(inv.ghostVendor ?? {}), documentLanguage: "ar" as const }, printedIban: inv.printedIban, printedBankName: inv.printedBankName,
    lines: inv.lines.map((l) => ({ ...l, descriptionAr: l.itemCode ? itemAr(l.itemCode) : null })),
  }),
);

writeFileSync(
  `${OUT}/meta.json`,
  JSON.stringify({ poNumber: po.number, invoiceNumber: inv.number, invoiceCurrency: inv.currency, poCurrency: po.currency, defects: inv.defects.map((d) => ({ type: d.type, ruleId: d.details.ruleId })), vendorCode: vendor.code, vendorName: vendor.name }, null, 2),
);

const licence = generateVendorDocuments(rng.fork("pdd:vd"), vendor).find((d) => d.kind === "vendor_licence")!;
writeFileSync(`${OUT}/licence.html`, renderVendorComplianceHtml({ ...licence, vendor: party }));

/**
 * The difficulty ladder as a figure: the same invoice at level 1, 3 and 5, with
 * a magnified crop of the totals block underneath so the damage is visible at
 * page scale. Rendered through the real pipeline, not mocked up.
 */
async function renderLadder(invoiceHtml: string) {
  const { renderHtmlToPdf, closeRenderer } = await import("../src/lib/documents/renderer");
  const { degradePageImages, rasterisePages, closeDegrader } = await import("../src/lib/documents/degrade");
  const { LEVEL_SPECS } = await import("../src/lib/documents/levels");
  const shown = [1, 3, 5] as const;
  const { pdf } = await renderHtmlToPdf(invoiceHtml);
  const images: Record<number, string> = {};
  images[1] = (await rasterisePages(pdf, 150))[0].toString("base64");
  for (const level of [3, 5] as const) {
    const { images: pages } = await degradePageImages("pdd-ladder-sample", level, pdf);
    images[level] = pages[0].toString("base64");
  }
  const src = (l: number) => `data:image/${l === 1 ? "png" : "jpeg"};base64,${images[l]}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; font-family: "Noto Sans", Arial, sans-serif; background: #fff; color: #111; }
.ladder { display: flex; gap: 14px; padding: 14px; }
figure { margin: 0; flex: 1; }
figure img { width: 100%; display: block; border: 1px solid #cfd6de; }
figcaption { font-size: 12px; margin-top: 6px; }
figcaption b { display: block; font-size: 13px; }
.zoom { height: 150px; margin-top: 8px; border: 1px solid #cfd6de; background-repeat: no-repeat; background-size: 300%; background-position: 78% 68%; }
</style></head><body><div class="ladder">
${shown
  .map(
    (l) => `<figure id="ladder-${l}">
  <img src="${src(l)}" alt="Level ${l}">
  <div class="zoom" style="background-image:url('${src(l)}')"></div>
  <figcaption><b>Level ${l} - ${LEVEL_SPECS[l].label}</b>${LEVEL_SPECS[l].textLayer ? "Selectable text, no OCR needed." : `Image only at ${LEVEL_SPECS[l].dpi} dpi: OCR required.`}</figcaption>
</figure>`,
  )
  .join("\n")}
</div></body></html>`;
  writeFileSync(`${OUT}/ladder.html`, html);
  await closeDegrader();
  await closeRenderer();
}

renderLadder(invoiceHtml)
  .then(() => {
    console.log(`Wrote ${OUT}/{purchase-order,invoice,invoice-arabic,licence,ladder}.html · invoice defects: ${inv.defects.map((d) => d.type).join(", ") || "none"}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
