/**
 * Render a sample purchase order straight from the generator (no database)
 * to ./.data/sample-po.pdf. Use it to eyeball the template and Arabic shaping.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Rng, SHARED_CORPUS_SEED } from "../src/lib/generator/rng";
import { generateEmployees, generateItems, generatePo, generateVendors } from "../src/lib/generator/corpus";
import { renderPurchaseOrderHtml } from "../src/lib/documents/templates/purchase-order";
import { closeRenderer, renderHtmlToPdf } from "../src/lib/documents/renderer";

async function main() {
  const rng = new Rng(SHARED_CORPUS_SEED);
  const vendors = generateVendors(rng.fork("vendors"), 40);
  const items = generateItems(rng.fork("items"), 200);
  const employees = generateEmployees(rng.fork("employees"));
  const po = generatePo(rng.fork("sample"), { vendors, items, employees }, { number: "PO-2026-05001", orderDate: "2026-08-20", status: "approved", historical: false });
  const vendor = vendors.find((v) => v.code === po.vendorCode)!;
  const html = renderPurchaseOrderHtml({
    ...po,
    vendor: { ...vendor },
    buyer: { name: employees.find((e) => e.code === po.buyerCode)!.name, email: employees.find((e) => e.code === po.buyerCode)!.email },
    requester: { name: employees.find((e) => e.code === po.requesterCode)!.name },
    approver: { name: employees.find((e) => e.code === po.approverCode)!.name },
    costCenter: { code: po.costCenterCode, name: "Operations" },
    deliveryLocation: { code: po.deliveryLocationCode, name: "Riyadh Central Warehouse", addressLine: "Exit 18, Second Industrial City", city: "Riyadh" },
    lines: po.lines.map((l) => ({ ...l, descriptionAr: items.find((i) => i.code === l.itemCode)?.nameAr ?? null })),
  });
  const out = path.join(process.cwd(), ".data");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "sample-po.html"), html);
  const { pdf, pages } = await renderHtmlToPdf(html);
  await writeFile(path.join(out, "sample-po.pdf"), pdf);
  console.log(`Wrote .data/sample-po.pdf (${pages} page(s), ${pdf.byteLength} bytes)`);
  await closeRenderer();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
