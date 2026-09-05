/**
 * Browser smoke test against a running dev server with the seeded corpus.
 *   pnpm dev            (in one terminal)
 *   node scripts/e2e-smoke.mjs [screenshot-dir]
 * Logs in as student@lab.local, waits for provisioning, exercises the full
 * cycle (vendors, items, RFQ award, GRN posting, invoice extraction + match,
 * approve, pay), downloads PDFs and a ZIP, switches to Arabic, resets the
 * sandbox and checks replayability.
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, copyFileSync } from "node:fs";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const shots = process.argv[2] ?? ".data/shots";
mkdirSync(shots, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const log = (...a) => console.log(...a);
const fail = (m) => { throw new Error(m); };
const mod97 = (str) => { let r = 0; for (const ch of str) { const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch; for (const d of v) r = (r * 10 + Number(d)) % 97; } return r; };
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const makeIban = () => { const bban = "80" + digits(18); const c = 98 - mod97(bban + "SA00"); return "SA" + String(c).padStart(2, "0") + bban; };
const luhn = (payload) => { let sum = 0, dbl = true; for (let i = payload.length - 1; i >= 0; i--) { let d = Number(payload[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; } return String((10 - (sum % 10)) % 10); };
const makeTaxId = () => { const body = "3" + digits(13); return body + luhn(body); };
const uniq = Date.now().toString(36);
const ruleIds = async () => (await p.locator("#validation-errors li").evaluateAll((els) => els.map((e) => e.dataset.ruleId))).join(",");

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    await p.goto(`${base}/`);
    const s = p.locator("#sandbox-status");
    const status = await s.getAttribute("data-status");
    const rendered = Number(await s.getAttribute("data-rendered"));
    const docs = Number(await s.getAttribute("data-documents"));
    if (status === "ready" && docs > 0 && rendered === docs) return { rendered, docs };
    if (status === "failed") fail("provisioning failed: " + (await p.locator("#sandbox-status-message").innerText()));
    await p.waitForTimeout(3000);
  }
  fail("sandbox never became ready");
}

await p.goto(`${base}/login`);
await p.fill("#login-field-email", "student@lab.local");
await p.fill("#login-field-password", "student");
await Promise.all([p.waitForURL(`${base}/`), p.click("#login-submit")]);
log("logged in:", await p.locator("#nav-user").getAttribute("data-user-id"));
const ready = await waitReady();
log(`sandbox ready: ${ready.rendered}/${ready.docs} PDFs`);
await p.screenshot({ path: `${shots}/dashboard.png`, fullPage: true });

// Vendors: filter, invalid then valid create, read-only shared row, compliance docs lazy render
await p.goto(`${base}/vendors?q=Trading`);
log("vendors filtered rows:", await p.locator("#vendors-table tbody tr").count(), "pager total:", await p.locator("#vendors-pager").getAttribute("data-total"));
await p.screenshot({ path: `${shots}/vendors.png`, fullPage: true });
await p.goto(`${base}/vendors/new`);
const vendorCode = await p.inputValue("#vendor-field-code");
await p.fill("#vendor-field-name", `Test Vendor ${uniq} LLC`);
await p.fill("#vendor-field-crNumber", "1010456783");
await p.fill("#vendor-field-crExpiry", "2027-06-30");
await p.fill("#vendor-field-taxId", "300124587600004");
await p.fill("#vendor-field-taxCertExpiry", "2025-01-01");
await p.fill("#vendor-field-iban", "SA0380000000608010167518");
await p.fill("#vendor-field-bankName", "Test Bank");
await p.fill("#vendor-field-swift", "TESTSARI");
await p.fill("#vendor-field-contactName", "T. Person");
await p.fill("#vendor-field-email", "not-an-email");
await p.fill("#vendor-field-phone", "+966 5 0000 0000");
await p.fill("#vendor-field-addressLine", "1 Test St");
await p.fill("#vendor-field-city", "Riyadh");
await p.click("#vendor-submit");
await p.waitForSelector('#validation-errors[data-count]:not([data-count="0"])');
log("vendor invalid submit rule ids:", await ruleIds());
await p.screenshot({ path: `${shots}/vendor-form-errors.png`, fullPage: true });
await p.fill("#vendor-field-crNumber", "1010456784");
await p.fill("#vendor-field-taxId", makeTaxId());
await p.fill("#vendor-field-iban", makeIban());
await p.fill("#vendor-field-email", "t@test.example");
await Promise.all([p.waitForURL(/\/vendors\/V-\d+\?saved=1/), p.click("#vendor-submit")]);
log("vendor created:", vendorCode, "flash:", await p.locator("#flash").getAttribute("data-status"));
await p.goto(`${base}/vendors/V-00001/edit`);
log("shared vendor edit redirected to:", p.url());
await p.goto(`${base}/vendors/V-00001`);
const licenceDocId = await p.locator("#vendor-documents-row-vendor_licence").getAttribute("data-document-id");
const lic = await p.request.get(`${base}/api/documents/${licenceDocId}/file`);
log("vendor licence lazy render:", lic.status(), lic.headers()["content-type"], lic.headers()["content-disposition"]);
await p.screenshot({ path: `${shots}/vendor-detail.png`, fullPage: true });

// Items
await p.goto(`${base}/items/new`);
const itemCode = await p.inputValue("#item-field-code");
await p.fill("#item-field-name", "Test Widget");
await p.fill("#item-field-unitPrice", "12.5");
await Promise.all([p.waitForURL(/\/items\/ITM-\d+\?saved=1/), p.click("#item-submit")]);
log("item created:", itemCode);

// PO detail with related documents and download
await p.goto(`${base}/purchase-orders?status=received`);
const receivedPo = await p.locator("#purchase-orders-table tbody tr").first().getAttribute("data-number");
await p.goto(`${base}/purchase-orders/${receivedPo}`);
log("received PO", receivedPo, "related docs:", await p.locator("#po-related").getAttribute("data-count"), "rendered:", await p.locator("#po-document").getAttribute("data-rendered"));
await p.screenshot({ path: `${shots}/po-detail.png`, fullPage: true });
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#po-download")]);
const bytes = readFileSync(await dl.path());
log("download:", dl.suggestedFilename(), bytes.length, "bytes, header:", bytes.subarray(0, 5).toString());
copyFileSync(await dl.path(), `${shots}/downloaded-po.pdf`);

// RFQ award → draft PO
await p.goto(`${base}/rfqs`);
const rfqCount = Number(await p.locator("#rfqs-pager").getAttribute("data-total"));
log("rfqs:", rfqCount);
// Generated RFQs are already awarded; award flow tested on a fresh one if present, else skip.
const openRfq = await p.locator('#rfqs-table tbody tr[data-status="open"], #rfqs-table tbody tr[data-status="quoted"]').first();
if (await openRfq.count()) {
  const n = await openRfq.getAttribute("data-number");
  await p.goto(`${base}/rfqs/${n}`);
  await Promise.all([p.waitForURL(/awarded=1/), p.locator('[id^="quotes-action-award-"]').first().click()]);
  log("awarded rfq", n);
} else {
  const anyRfq = await p.locator("#rfqs-table tbody tr").first().getAttribute("data-number");
  await p.goto(`${base}/rfqs/${anyRfq}`);
  log("rfq", anyRfq, "quotes:", await p.locator("#quotes-table tbody tr").count(), "status:", await p.locator(`#rfq-status-${anyRfq}`).getAttribute("data-status"));
  await p.screenshot({ path: `${shots}/rfq-detail.png`, fullPage: true });
}

// Delivery → post GRN (over-receipt rejected first, then valid)
await p.goto(`${base}/deliveries?status=delivered`);
const dnRow = p.locator("#deliveries-table tbody tr").first();
if (await dnRow.count()) {
  const dnId = (await dnRow.getAttribute("id")).replace("deliveries-row-", "");
  await p.goto(`${base}/deliveries/${dnId}`);
  const shipped = await p.locator("#grn-line-1 td:nth-child(5)").innerText();
  await p.fill("#grn-field-line-1-received", String(Number(shipped) * 5));
  await p.click("#grn-submit");
  await p.waitForSelector('#validation-errors[data-count]:not([data-count="0"])');
  log("grn over-receipt rule ids:", await ruleIds());
  await p.fill("#grn-field-line-1-received", shipped);
  await p.fill("#grn-field-line-1-rejected", "0");
  await Promise.all([p.waitForURL(/\/grns\/GRN-\d{4}-9\d{4}\?posted=1/), p.click("#grn-submit")]);
  log("grn posted:", p.url().match(/GRN-\d{4}-\d{5}/)[0]);
} else log("no delivered DN awaiting GRN (ok)");

// Invoice extraction + match with a wrong price → PO-INV-PRICE, then correct → approve → pay
await p.goto(`${base}/invoices?status=pending_extraction`);
log("pending invoices:", await p.locator("#invoices-pager").getAttribute("data-total"));
const zip = await p.request.get(`${base}/api/queues/invoices-pending/download`);
log("queue zip:", zip.status(), zip.headers()["content-type"], "docs:", zip.headers()["x-document-count"], "bytes:", (await zip.body()).length);
// Pick an invoice whose PO is known and rendered: read the PDF's number from ground truth is hidden, so we use the API-free path:
// choose a pending invoice, download its PDF (proves the file), then submit an extraction with obviously wrong values to see rule ids.
const invRow = p.locator("#invoices-table tbody tr").first();
const invNo = await invRow.getAttribute("data-number");
await p.goto(`${base}/invoices/${invNo}`);
log("invoice", invNo, "hidden:", await p.locator(`#invoice-detail-${invNo}`).getAttribute("data-hidden"), "pdf rendered:", await p.locator("#invoice-document").getAttribute("data-rendered"));
await p.screenshot({ path: `${shots}/invoice-pending.png`, fullPage: true });
await p.fill("#extraction-field-number", "TEST-1");
await p.fill("#extraction-field-invoiceDate", "2026-08-01");
await p.fill("#extraction-field-poNumber", receivedPo);
await p.fill("#extraction-field-currency", "SAR");
await p.fill("#extraction-field-vendorTaxId", "300000000000000");
await p.fill("#extraction-field-iban", "SA0000");
await p.fill("#extraction-field-grandTotal", "1");
await p.fill("#extraction-field-line-1-poLine", "1");
await p.fill("#extraction-field-line-1-quantity", "1");
await p.fill("#extraction-field-line-1-unitPrice", "1");
await p.fill("#extraction-field-line-1-taxRate", "15");
await Promise.all([p.waitForURL(/extracted=1/), p.click("#extraction-submit")]);
log("extraction submitted; status:", await p.locator(`#invoice-status-${invNo}`).getAttribute("data-status"), "match rule ids:", await ruleIds());
const shownNumber = await p.locator(`#invoice-cell-${invNo}-number`).innerText();
if (shownNumber !== "TEST-1") fail(`student view must show the extracted number, got ${shownNumber}`);
log("student sees extracted values only:", shownNumber, "| lines source:", await p.locator("#invoice-lines-table").getAttribute("data-source"));
await p.screenshot({ path: `${shots}/invoice-matched.png`, fullPage: true });
await Promise.all([p.waitForURL(/approved=1/), p.click("#invoice-approve")]);
log("approved; status:", await p.locator(`#invoice-status-${invNo}`).getAttribute("data-status"));
await Promise.all([p.waitForURL(/paid=1/), p.click("#invoice-pay")]);
log("paid; status:", await p.locator(`#invoice-status-${invNo}`).getAttribute("data-status"), "payment link:", await p.locator(`#invoice-cell-${invNo}-payment a`).innerText());

// Payments + receipt PDF
await p.goto(`${base}/payments`);
const payRow = p.locator('#payments-table tbody tr[data-number^="PAY-2026-0"]').first();
if (await payRow.count()) {
  const payNo = await payRow.getAttribute("data-number");
  await p.goto(`${base}/payments/${payNo}`);
  log("payment", payNo, "receipt rendered:", await p.locator("#receipt-document").getAttribute("data-rendered"));
}

// Arabic / RTL
await p.goto(`${base}/lang?to=ar`);
await p.goto(`${base}/invoices`);
log("dir:", await p.locator("html").getAttribute("dir"), "title:", await p.locator("#page-title").innerText());
await p.screenshot({ path: `${shots}/invoices-ar.png`, fullPage: true });
await p.goto(`${base}/lang?to=en`);

// API + rules
const api = await p.request.get(`${base}/api/sandbox`);
log("api/sandbox:", JSON.stringify(await api.json()));
const rules = await (await p.request.get(`${base}/api/rules`)).json();
log("rules:", rules.rules.length, rules.rules.map((r) => r.id).filter((id) => /INV|GRN|BANK|DUP|TAX-CERT/.test(id)).join(","));

// Reset and replayability
await p.goto(`${base}/sandbox`);
await Promise.all([p.waitForURL(/reset=1/), p.click("#sandbox-reset")]);
const after = await waitReady();
log(`after reset: ${after.rendered}/${after.docs} PDFs (before: ${ready.rendered}/${ready.docs})`);
await p.goto(`${base}/purchase-orders?status=received`);
log("first received PO after reset (should match):", await p.locator("#purchase-orders-table tbody tr").first().getAttribute("data-number"), "vs", receivedPo);
log("student-created vendor gone after reset:", (await p.request.get(`${base}/vendors/${vendorCode}`)).status());

// Expired enrollment → no access
const ctx2 = await b.newContext();
const p2 = await ctx2.newPage();
await p2.goto(`${base}/login`);
await p2.fill("#login-field-email", "expired@lab.local");
await p2.fill("#login-field-password", "expired");
await Promise.all([p2.waitForURL(/no-access/), p2.click("#login-submit")]);
log("expired user landed on:", p2.url());
await b.close();
