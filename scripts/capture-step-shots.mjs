/**
 * One small screenshot per process step, for the step table in the PDD.
 *
 * The figures captured by capture-pdd-figures.mjs are full-page and carry
 * numbered callouts; they are read at half a page each. These are different:
 * they sit inside a table cell about an inch and a half wide, one per row, and
 * their job is to answer "which screen is this step on, and where on it" at a
 * glance. So each one is cropped tight around the thing the step touches, with
 * a single red box on it and no badge — there is nothing to number when there
 * is only one.
 *
 * Crops are capped to a wide-ish aspect so that twelve of them stacked down a
 * table do not each demand a different row height.
 *
 *   scripts/serve-prod.sh 3200
 *   BASE_URL=http://127.0.0.1:3200 node scripts/capture-step-shots.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/pdd-assets";
const SCALE = 2;
/**
 * Widest and tallest a crop may be, in CSS pixels, before it is cut down.
 * Wide enough that the red box itself is never clipped — a box with one side
 * missing reads as a rendering fault rather than a highlight — and short
 * enough that twelve of these stacked in a table do not run to three pages.
 */
const MAX_W = 1120;
const MAX_H = 300;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SCALE });
const page = await ctx.newPage();
const shots = [];

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

/** One red box around the union of the given selectors. */
async function boxAround(selectors) {
  return page.evaluate((sels) => {
    document.querySelectorAll("[data-step-overlay]").forEach((e) => e.remove());
    if (!document.getElementById("step-hide-devtools")) {
      const st = document.createElement("style");
      st.id = "step-hide-devtools";
      st.textContent = "nextjs-portal, #__next-build-watcher, [data-nextjs-toast] { display: none !important; }";
      document.head.append(st);
    }
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left + window.scrollX);
      top = Math.min(top, r.top + window.scrollY);
      right = Math.max(right, r.right + window.scrollX);
      bottom = Math.max(bottom, r.bottom + window.scrollY);
    }
    if (left === Infinity) return null;
    const box = document.createElement("div");
    box.setAttribute("data-step-overlay", "");
    box.style.cssText = `position:absolute;left:${left - 4}px;top:${top - 4}px;width:${right - left + 8}px;height:${bottom - top + 8}px;border:3px solid #d04343;border-radius:5px;z-index:9999;pointer-events:none;box-shadow:0 0 0 2px rgba(255,255,255,.55)`;
    document.body.append(box);
    return { left, top, right, bottom };
  }, selectors);
}

/**
 * Capture one step.
 *
 * `box` is what gets the red outline. `context` widens the crop so the shot
 * still looks like a screen rather than a floating fragment — a red box around
 * a button, cropped to the button, tells a reader nothing.
 */
async function step(n, title, box, { context = [], pad = 20 } = {}) {
  const bounds = await boxAround(box);
  if (!bounds) throw new Error(`Step ${n}: none of ${box.join(", ")} is on the page ${page.url()}`);
  const clip = await page.evaluate(
    ({ sels, bounds, pad, maxW, maxH }) => {
      let { left, top, right, bottom } = bounds;
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        left = Math.min(left, r.left + window.scrollX);
        top = Math.min(top, r.top + window.scrollY);
        right = Math.max(right, r.right + window.scrollX);
        bottom = Math.max(bottom, r.bottom + window.scrollY);
      }
      const docW = document.documentElement.scrollWidth;
      const docH = document.documentElement.scrollHeight;
      let x = Math.max(0, left - pad);
      let y = Math.max(0, top - pad);
      let w = Math.min(docW - x, right - left + pad * 2);
      let h = Math.min(docH - y, bottom - top + pad * 2);
      // When a cap bites, the context is what gets sacrificed — never the red
      // box. Context exists to make the shot recognisable; the box is the
      // whole point, and a crop that cuts it away leaves a picture of a screen
      // with nothing highlighted on it.
      if (w > maxW) {
        if (bounds.right + pad > x + maxW) x = Math.max(0, Math.min(bounds.left - pad, docW - maxW));
        w = Math.min(maxW, docW - x);
      }
      if (h > maxH) {
        if (bounds.bottom + pad > y + maxH) y = Math.max(0, Math.min(bounds.top - pad, docH - maxH));
        h = Math.min(maxH, docH - y);
      }
      return { x, y, width: Math.round(w), height: Math.round(h) };
    },
    { sels: context, bounds, pad, maxW: MAX_W, maxH: MAX_H },
  );
  const id = `step-${String(n).padStart(2, "0")}`;
  const file = path.join(OUT, `${id}.png`);
  // fullPage, because the clip is in document coordinates: several of these
  // steps sit below the fold, and a viewport-relative clip of them is empty.
  await page.screenshot({ path: file, clip, fullPage: true });
  const { width, height } = pngSize(file);
  shots.push({ id, title, file, width, height, scale: SCALE, callouts: [] });
  console.log(`✓ ${id} ${title} (${width}x${height}, ${Math.round(statSync(file).size / 1024)} KB)`);
}

// ---------------------------------------------------------------------------

// Step 1 is the only one taken signed out.
await page.goto(`${BASE}/login`);
await step(1, "Step 1 — Sign in", ["#login-submit"], { context: ["#login-field-email", "#login-field-password"] });

await login("student@lab.local", "student");
for (let i = 0; i < 200; i++) {
  await page.goto(`${BASE}/`);
  const s = page.locator("#sandbox-status");
  if ((await s.getAttribute("data-status")) === "ready") break;
  await page.waitForTimeout(3000);
}

await page.goto(`${BASE}/invoices?status=pending_extraction`);
await step(2, "Step 2 — Read the queue", ["#invoices-table"], { context: ["#invoices-filter-status"] });
await step(3, "Step 3 — Claim one item", ["#invoices-table tbody tr:first-child"], { context: ["#invoices-table thead"] });

const invNo = await page.locator("#invoices-table tbody tr").first().getAttribute("data-number");
await page.goto(`${BASE}/invoices/${invNo}`);
await step(4, "Step 4 — Open the invoice", [`#invoice-status-${invNo}`], { context: ["#page-title"] });
await step(5, "Step 5 — Download the document", ["#invoice-download"], { context: ["#invoice-document"] });
await step(6, "Step 6 — Read the header", ["#extraction-field-number-group", "#extraction-field-grandTotal-group"], { pad: 14 });
await step(7, "Step 7 — Read the lines", ["#extraction-lines-form"], { pad: 10 });

// A reading with one digit wrong in the IBAN, so the match has something to say.
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
// The first line as well: the form will not submit with a half-read invoice,
// which is the right behaviour and would otherwise look like a broken script.
await page.fill("#extraction-field-line-1-poLine", "1");
await page.fill("#extraction-field-line-1-itemCode", "ITM-000327");
await page.fill("#extraction-field-line-1-description", "SSD 1TB NVMe - Heavy Duty");
await page.fill("#extraction-field-line-1-quantity", "7");
await page.fill("#extraction-field-line-1-uom", "BOX");
await page.fill("#extraction-field-line-1-unitPrice", "3700.00");
await page.fill("#extraction-field-line-1-taxRate", "15");
await page.fill("#extraction-field-line-1-taxAmount", "3885.00");
await page.fill("#extraction-field-line-1-lineTotal", "25900.00");
await step(8, "Step 8 — Submit the extraction", ["#extraction-submit"], { context: ["#extraction-field-grandTotal-group"] });

await Promise.all([page.waitForURL(/extracted=1/), page.click("#extraction-submit")]);
await step(9, "Step 9 — Read the match result", ["#validation-errors"], { pad: 14 });
await step(10, "Step 10 — Decide", ["#invoice-approve", "#invoice-reject"], { context: [`#invoice-status-${invNo}`] });

// Steps 11 and 12 need an invoice that has already been paid. A sandbox is
// seeded with some; the pay button only exists on an approved invoice, and an
// approved one is a transient state nothing in the seed leaves behind, so the
// payment record on a paid invoice is what step 11 shows.
await page.goto(`${BASE}/invoices?status=paid`);
const paidRows = await page.locator("#invoices-table tbody tr").count();
if (!paidRows) throw new Error("No paid invoices in this sandbox; re-seed before capturing steps 11 and 12.");
const paid = await page.locator("#invoices-table tbody tr").first().getAttribute("data-number");
await page.goto(`${BASE}/invoices/${paid}`);
await step(11, "Step 11 — Pay", [`#invoice-cell-${paid}-payment`], { pad: 30 });

await page.goto(`${BASE}/invoices?status=paid`);
await step(12, "Step 12 — Close the work item", ["#invoices-table tbody tr:first-child"], { context: ["#invoices-filter-status", "#invoices-table thead"] });

writeFileSync(path.join(OUT, "steps.json"), `${JSON.stringify(shots, null, 2)}\n`);
console.log(`Wrote ${shots.length} step shots and ${OUT}/steps.json`);
await browser.close();
