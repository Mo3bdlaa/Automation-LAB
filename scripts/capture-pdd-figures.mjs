/**
 * Captures the annotated screenshots used as figures in the PDD.
 *
 *   pnpm dev                                  (in one terminal)
 *   node scripts/capture-pdd-figures.mjs      (in another)
 *
 * Writes PNGs plus docs/pdd-assets/figures.json, which scripts/build-pdd.ts
 * reads. Callouts are drawn as numbered badges over the real UI, so the figure
 * captions in the document refer to the same numbers a reader sees on screen.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/pdd-assets";
const SCALE = 1.5;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SCALE });
const page = await ctx.newPage();
const figures = [];

/** PNG width/height from the IHDR chunk, for sizing the image in Word. */
function pngSize(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

async function login(email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill("#login-field-email", email);
  await page.fill("#login-field-password", password);
  await Promise.all([page.waitForURL(`${BASE}/`), page.click("#login-submit")]);
}

/** Draw numbered badges and outlines over the given selectors. */
async function annotate(callouts, minX = 2) {
  await page.evaluate(({ items, minX }) => {
    document.querySelectorAll("[data-pdd-overlay]").forEach((e) => e.remove());
    // The dev server injects a floating issues badge; it must not appear in a figure.
    if (!document.getElementById("pdd-hide-devtools")) {
      const st = document.createElement("style");
      st.id = "pdd-hide-devtools";
      st.textContent = "nextjs-portal, #__next-build-watcher, [data-nextjs-toast] { display: none !important; }";
      document.head.append(st);
    }
    for (const { selector, n } of items) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + window.scrollX;
      const y = r.top + window.scrollY;
      const box = document.createElement("div");
      box.setAttribute("data-pdd-overlay", "");
      box.style.cssText = `position:absolute;left:${x - 3}px;top:${y - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:2px solid #d04343;border-radius:4px;z-index:9998;pointer-events:none`;
      const badge = document.createElement("div");
      badge.setAttribute("data-pdd-overlay", "");
      badge.textContent = String(n);
      // Keep the badge inside the captured area when the element sits on the left edge.
      badge.style.cssText = `position:absolute;left:${Math.max(minX + 2, x - 13)}px;top:${y - 13}px;width:24px;height:24px;border-radius:50%;background:#d04343;color:#fff;font:700 14px/24px Arial,sans-serif;text-align:center;z-index:9999;box-shadow:0 1px 4px rgba(0,0,0,.45);pointer-events:none`;
      document.body.append(box, badge);
    }
  }, { items: callouts, minX });
}

/** Bounding box over the annotated elements, padded, clamped to the page. */
async function clipFor(selectors, pad = 24) {
  return page.evaluate(
    ({ selectors, pad }) => {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        left = Math.min(left, r.left + window.scrollX);
        top = Math.min(top, r.top + window.scrollY);
        right = Math.max(right, r.right + window.scrollX);
        bottom = Math.max(bottom, r.bottom + window.scrollY);
      }
      if (left === Infinity) return null;
      const w = document.documentElement.scrollWidth;
      const h = document.documentElement.scrollHeight;
      const x = Math.max(0, left - pad);
      const y = Math.max(0, top - pad);
      return { x, y, width: Math.min(w - x, right - left + pad * 2), height: Math.min(h - y, bottom - top + pad * 2) };
    },
    { selectors, pad },
  );
}

/**
 * Capture one figure. `callouts` are [selector, caption] pairs; the badge
 * number is the position in the list. `include` widens the clip beyond the
 * annotated elements (e.g. to keep the shell bar in frame).
 */
async function figure(id, title, callouts, { include = [], pad = 24, fullPage = false, element = null } = {}) {
  const items = callouts.map(([selector], i) => ({ selector, n: i + 1 }));
  const minX = element ? await page.locator(element).evaluate((el) => el.getBoundingClientRect().left + window.scrollX) : 2;
  await annotate(items, minX);
  const file = path.join(OUT, `${id}.png`);
  if (element) {
    // Element screenshots capture the whole element, including the part below the fold.
    await page.locator(element).screenshot({ path: file });
  } else {
    const clip = fullPage ? null : await clipFor([...callouts.map(([s]) => s), ...include], pad);
    await page.screenshot({ path: file, clip: clip ?? undefined, fullPage: fullPage || !clip });
  }
  const { width, height } = pngSize(file);
  figures.push({
    id,
    title,
    file: `${OUT}/${id}.png`,
    width,
    height,
    scale: SCALE,
    callouts: callouts.map(([selector, text], i) => ({ n: i + 1, selector, text })),
    bytes: statSync(file).size,
  });
  console.log(`✓ ${id} (${width}x${height}, ${Math.round(statSync(file).size / 1024)} KB)`);
}

// ---------------------------------------------------------------------------

await login("student@lab.local", "student");

// Wait until the sandbox is provisioned so counts and documents are real.
for (let i = 0; i < 200; i++) {
  await page.goto(`${BASE}/`);
  const s = page.locator("#sandbox-status");
  if ((await s.getAttribute("data-status")) === "ready" && (await s.getAttribute("data-rendered")) === (await s.getAttribute("data-documents"))) break;
  await page.waitForTimeout(3000);
}

// 1. Launchpad
await figure(
  "01-launchpad",
  "Launchpad: work queues after sign-in",
  [
    ["#sandbox-status", "Sandbox status and PDF render progress. A bot should wait until data-status is \"ready\" before starting."],
    ["#tile-invoices-pending", "Invoices pending extraction: the dispatcher queue for the invoice process. data-count holds the number."],
    ["#tile-pos-awaiting-invoice", "Purchase orders received but not yet invoiced: the awaiting-invoice process."],
    ["#tile-vendors-pending", "Vendor applications pending approval: the vendor onboarding process."],
    ["#nav-main", "Navigation. Each link carries a stable id (nav-invoices, nav-grns, …)."],
  ],
  { include: ["#page-title"] },
);

// 2. Invoice queue (dispatcher source)
await page.goto(`${BASE}/invoices?status=pending_extraction`);
await figure(
  "02-invoice-queue",
  "AP inbox filtered to invoices pending extraction",
  [
    ["#invoices-filter-status", "Status filter. The dispatcher navigates straight to ?status=pending_extraction."],
    ["#invoices-download-pending", "Bulk ZIP of the whole queue, for offline extraction training."],
    ["#invoices-table", "Real HTML table: no virtualisation, fixed page size of 25."],
    ["#invoices-table tbody tr:first-child", "Each row carries data-number and data-status; field values stay hidden until the invoice is extracted."],
    ["#invoices-pager", "Pagination by URL. data-page, data-page-count and data-total let a bot loop without scraping text."],
  ],
);

// 3. Invoice object page, pending extraction
const invNo = await page.locator("#invoices-table tbody tr").first().getAttribute("data-number");
await page.goto(`${BASE}/invoices/${invNo}`);
await figure(
  "03-invoice-pending",
  "Invoice object page before extraction: only the PDF is available",
  [
    [`#invoice-status-${invNo}`, "Status badge with data-status=\"pending_extraction\"."],
    ["#invoice-document", "Document card. data-rendered=\"1\" means the PDF is ready to download."],
    ["#invoice-download", "Download link. Content-Disposition is attachment with a predictable file name."],
    ["#extraction-form", "Extraction form: the student or bot types what the PDF shows."],
  ],
  { include: ["#page-title"] },
);

// 4. Extraction form filled with a deliberately wrong reading
await page.fill("#extraction-field-number", "TI-7841119");
await page.fill("#extraction-field-invoiceDate", "2026-08-12");
await page.fill("#extraction-field-poNumber", "PO-2026-05057");
await page.fill("#extraction-field-currency", "SAR");
await page.fill("#extraction-field-vendorName", "Al Hikma Maintenance JSC");
await page.fill("#extraction-field-vendorTaxId", "300000000000000");
await page.fill("#extraction-field-iban", "SA0380000000608010167519");
await page.fill("#extraction-field-subtotal", "146819.16");
await page.fill("#extraction-field-taxTotal", "22022.88");
await page.fill("#extraction-field-grandTotal", "168000.00");
await page.fill("#extraction-field-line-1-poLine", "1");
await page.fill("#extraction-field-line-1-itemCode", "ITM-000327");
await page.fill("#extraction-field-line-1-description", "SSD 1TB NVMe - Heavy Duty");
await page.fill("#extraction-field-line-1-quantity", "7");
await page.fill("#extraction-field-line-1-uom", "BOX");
await page.fill("#extraction-field-line-1-unitPrice", "3700.00");
await page.fill("#extraction-field-line-1-taxRate", "15");
await page.fill("#extraction-field-line-1-taxAmount", "3885.00");
await page.fill("#extraction-field-line-1-lineTotal", "25900.00");
await figure(
  "04-extraction-form",
  "Extraction form: header fields and line items",
  [
    ["#extraction-field-number-group", "Every field has a stable id: extraction-field-{field}."],
    ["#extraction-field-iban-group", "The IBAN as printed. The match compares it with the vendor master (BANK-CHANGE)."],
    ["#extraction-lines-form", "Eight line rows, addressed as extraction-field-line-{n}-{field}."],
    ["#extraction-submit", "Submitting stores the extraction and runs the three-way match on the submitted values."],
  ],
  { element: "#extraction-form" },
);

// 5. Match result with rule IDs
await Promise.all([page.waitForURL(/extracted=1/), page.click("#extraction-submit")]);
await figure(
  "05-match-exception",
  "Three-way match result: violations carry stable rule IDs",
  [
    [`#invoice-status-${invNo}`, "The invoice moved to Exception because at least one blocking rule fired."],
    ["#validation-errors", "Fixed container. data-count and data-blocking let a bot branch without reading any text."],
    ["#validation-errors li:first-child", "One list item per violation with data-rule-id and data-severity."],
    ["#invoice-approve", "Approve and Reject actions. Critical findings must be escalated, never approved."],
    ["#invoice-rematch", "Re-run match after a corrected extraction."],
  ],
  { include: ["#page-title", "#invoice-reject", "#invoice-document"] },
);

// 6. Purchase order object page
await page.goto(`${BASE}/purchase-orders?status=received`);
const poNo = await page.locator("#purchase-orders-table tbody tr").first().getAttribute("data-number");
await page.goto(`${BASE}/purchase-orders/${poNo}`);
await figure(
  "06-purchase-order",
  "Purchase order object page with its related documents",
  [
    [`#po-detail-${poNo}`, "Header facts: vendor, dates, payment terms, cost centre."],
    ["#po-related", "Related documents: RFQ, quotation, delivery notes, goods receipts and invoices, each with its status."],
    ["#po-document", "The purchase order PDF itself."],
    ["#po-lines-table", "Lines with quantity, unit of measure, price and tax code: the reference values for the match."],
  ],
  { include: ["#page-title"] },
);

// 7. Vendor compliance documents
await page.goto(`${BASE}/vendors/V-00001`);
await figure(
  "07-vendor-compliance",
  "Vendor master record and its compliance documents",
  [
    ["#vendor-detail-V-00001", "Master data. Records from the shared corpus are read-only for students."],
    ["#vendor-documents-table", "Commercial registration, tax card, bank letter and trade licence, with issue and expiry dates."],
    ["#vendor-documents-download-vendor_licence", "The licence PDF renders on first download, then is cached."],
  ],
  { include: ["#page-title"] },
);

// 8. Goods receipt posting
await page.goto(`${BASE}/deliveries?status=delivered`);
const dnRow = page.locator("#deliveries-table tbody tr").first();
if (await dnRow.count()) {
  const dnId = (await dnRow.getAttribute("id")).replace("deliveries-row-", "");
  await page.goto(`${BASE}/deliveries/${dnId}`);
  await page.fill("#grn-field-line-1-received", "9999");
  await page.click("#grn-submit");
  await page.waitForSelector('#validation-errors[data-count]:not([data-count="0"])');
  await figure(
    "08-goods-receipt",
    "Posting a goods receipt: over-receipt is rejected by rule",
    [
      ["#grn-lines-form", "One row per delivered line. Accepted plus rejected must equal received (GRN-SPLIT)."],
      ["#validation-errors li:first-child", "GRN-OVER-PO fires when the total received would exceed the ordered quantity."],
      ["#grn-submit", "Posting updates the purchase order to Partially received or Received."],
    ],
  );
}

// 9. Rule catalogue
await page.goto(`${BASE}/rules`);
await figure(
  "09-rule-catalogue",
  "Validation rule catalogue, also available as JSON at /api/rules",
  [
    ["#rules-table", "Every rule with its ID, severity, scope and parameters. Rule IDs are a public contract and never change."],
    ["#rules-table tbody tr:first-child", "Each row carries data-severity."],
  ],
  { include: ["#page-title"] },
);

// 10. Sandbox reset
await page.goto(`${BASE}/sandbox`);
await figure(
  "10-sandbox",
  "Sandbox page: seed, reset and the background job log",
  [
    ["#sandbox-detail", "Seed and tenant. The seed derives from the user id, so a reset reproduces the identical starting set."],
    ["#sandbox-reset", "Reset returns the sandbox to identical starting conditions, which makes every exercise replayable."],
    ["#jobs-table", "Background jobs: provisioning and PDF rendering."],
  ],
  { include: ["#page-title"] },
);

// 11. Arabic / RTL
await page.goto(`${BASE}/lang?to=ar`);
await page.goto(`${BASE}/invoices`);
await figure(
  "11-arabic-rtl",
  "The same screen in Arabic: the interface switches to right-to-left",
  [
    ["#nav-language", "Language switch. The choice is stored in a cookie and applies to every screen."],
    ["#invoices-table", "Tables, labels and status badges are translated; ids and data-testid values stay identical."],
  ],
  { include: ["#page-title"] },
);
await page.goto(`${BASE}/lang?to=en`);

// 12-14. The generated documents themselves (rendered from the same templates the lab uses).
const samples = JSON.parse(readFileSync(".data/pdd-samples/meta.json", "utf8"));
const fileUrl = (f) => `file://${path.resolve(".data/pdd-samples", f)}`;
const defectList = samples.defects.map((d) => `${d.type} (${d.ruleId})`).join(", ");

await page.setViewportSize({ width: 900, height: 1300 });
await page.goto(fileUrl("invoice.html"));
await page.evaluate(() => document.fonts.ready);
await figure(
  "12-document-invoice",
  `Input document: a vendor tax invoice as the lab generates it (seeded defect: ${defectList || "none"})`,
  [
    ["#po-number, .doc-title table, .dtitle table", "Header block: invoice number, dates and the purchase order reference the match needs."],
    ["#invoice-iban", "Bank details as printed. The match compares them with the vendor master (BANK-CHANGE)."],
    ["table.lines", "Line items: quantity, unit of measure, unit price, VAT rate and line total."],
    ["#invoice-grand-total", "Printed grand total. INV-TOTAL-TIE checks it against the sum of the lines."],
  ],
  { include: [".content"], pad: 10 },
);

await page.goto(fileUrl("purchase-order.html"));
await page.evaluate(() => document.fonts.ready);
await figure(
  "13-document-purchase-order",
  "Reference document: the purchase order, bilingual English and Arabic",
  [
    ["#po-number", "Purchase order number, quoted on every downstream document."],
    [".parties", "Vendor and delivery details, including payment terms and the approver."],
    ["table.lines", "Ordered quantities and prices: the reference side of the three-way match."],
    [".watermark span", "Every generated document is watermarked SPECIMEN - TRAINING ONLY in both languages."],
  ],
  { include: [".content"], pad: 10 },
);

await page.goto(fileUrl("licence.html"));
await page.evaluate(() => document.fonts.ready);
await figure(
  "14-document-licence",
  "Input document: a vendor commercial registration certificate",
  [
    ["#doc-number", "Commercial registration number: 10 digits with a mod-11 check digit (VEND-CR-FMT)."],
    [".grid", "Fields to extract during onboarding: legal name in both scripts, address, tax ID, activities, manager."],
    ["#doc-expiry", "Expiry date. An expired registration blocks the vendor (VEND-CR-EXP)."],
    [".seal", "Seal and machine-readable block, which make the document harder to read than plain text."],
  ],
  { include: [".cert"], pad: 10 },
);

writeFileSync(path.join(OUT, "figures.json"), JSON.stringify(figures, null, 2));
console.log(`\nWrote ${figures.length} figures and ${OUT}/figures.json`);
await browser.close();
