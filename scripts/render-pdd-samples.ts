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
writeFileSync(
  `${OUT}/invoice.html`,
  renderInvoiceHtml({
    number: inv.number, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, poNumber: inv.printedPoNumber, currency: inv.currency,
    subtotal: inv.subtotal, taxTotal: inv.taxTotal, grandTotal: inv.grandTotal,
    vendor: { ...party, ...(inv.ghostVendor ?? {}) }, printedIban: inv.printedIban, printedBankName: inv.printedBankName,
    lines: inv.lines.map((l) => ({ ...l, descriptionAr: l.itemCode ? itemAr(l.itemCode) : null })),
  }),
);

writeFileSync(
  `${OUT}/meta.json`,
  JSON.stringify({ poNumber: po.number, invoiceNumber: inv.number, invoiceCurrency: inv.currency, poCurrency: po.currency, defects: inv.defects.map((d) => ({ type: d.type, ruleId: d.details.ruleId })), vendorCode: vendor.code, vendorName: vendor.name }, null, 2),
);

const licence = generateVendorDocuments(rng.fork("pdd:vd"), vendor).find((d) => d.kind === "vendor_licence")!;
writeFileSync(`${OUT}/licence.html`, renderVendorComplianceHtml({ ...licence, vendor: party }));

console.log(`Wrote ${OUT}/{purchase-order,invoice,licence}.html · invoice defects: ${inv.defects.map((d) => d.type).join(", ") || "none"}`);
