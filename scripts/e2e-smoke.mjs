/**
 * Browser smoke test against a running dev server with the seeded corpus.
 *   pnpm dev            (in one terminal)
 *   node scripts/e2e-smoke.mjs [screenshot-dir]
 * Logs in as student@lab.local, waits for provisioning, exercises vendors/items/POs,
 * downloads a PDF, switches to Arabic, resets the sandbox and checks replayability.
 */
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const shots = process.argv[2] ?? ".data/shots";
import { mkdirSync } from "node:fs";
mkdirSync(shots, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const log = (...a) => console.log(...a);
const mod97 = (str) => { let r = 0; for (const ch of str) { const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch; for (const d of v) r = (r * 10 + Number(d)) % 97; } return r; };
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const makeIban = () => { const bban = "80" + digits(18); const c = 98 - mod97(bban + "SA00"); return "SA" + String(c).padStart(2, "0") + bban; };
const luhn = (payload) => { let sum = 0, dbl = true; for (let i = payload.length - 1; i >= 0; i--) { let d = Number(payload[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; } return String((10 - (sum % 10)) % 10); };
const makeTaxId = () => { const body = "3" + digits(13); return body + luhn(body); };
const uniq = Date.now().toString(36);

await p.goto(`${base}/login`);
await p.fill("#login-field-email", "student@lab.local");
await p.fill("#login-field-password", "student");
await Promise.all([p.waitForURL(`${base}/`), p.click("#login-submit")]);
log("logged in:", await p.locator("#nav-user").getAttribute("data-user-id"));

// Wait for provisioning (dashboard auto-refreshes every 3s while provisioning).
for (let i = 0; i < 60; i++) {
  const status = await p.locator("#sandbox-status").getAttribute("data-status");
  const rendered = await p.locator("#sandbox-status").getAttribute("data-rendered");
  const docs = await p.locator("#sandbox-status").getAttribute("data-documents");
  if (status === "ready" && rendered === docs && Number(docs) > 0) { log(`sandbox ready: ${rendered}/${docs} PDFs`); break; }
  if (status === "failed") throw new Error("provisioning failed: " + (await p.locator("#sandbox-status-message").innerText()));
  await p.waitForTimeout(3000);
  await p.goto(`${base}/`);
}
await p.screenshot({ path: `${shots}/dashboard.png`, fullPage: true });

// Vendors table + pager
await p.goto(`${base}/vendors?q=Trading`);
const rows = await p.locator("#vendors-table tbody tr").count();
log("vendors filtered rows:", rows, "pager:", await p.locator("#vendors-pager").getAttribute("data-total"));
await p.screenshot({ path: `${shots}/vendors.png`, fullPage: true });

// Vendor create: invalid first (bad IBAN/tax id) then valid
await p.goto(`${base}/vendors/new`);
const code = await p.inputValue("#vendor-field-code");
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
const ruleIds = await p.locator("#validation-errors li").evaluateAll((els) => els.map((e) => e.dataset.ruleId));
log("vendor invalid submit rule ids:", ruleIds.join(","));
await p.screenshot({ path: `${shots}/vendor-form-errors.png`, fullPage: true });
await p.fill("#vendor-field-crNumber", "1010456784");
await p.fill("#vendor-field-taxId", makeTaxId());
await p.fill("#vendor-field-iban", makeIban());
await p.fill("#vendor-field-email", "t@test.example");
await Promise.all([p.waitForURL(/\/vendors\/V-\d+\?saved=1/), p.click("#vendor-submit")]);
log("vendor created:", code, "flash:", await p.locator("#flash").getAttribute("data-status"));

// Item create
await p.goto(`${base}/items/new`);
const itemCode = await p.inputValue("#item-field-code");
await p.fill("#item-field-name", "Test Widget");
await p.fill("#item-field-unitPrice", "12.5");
await Promise.all([p.waitForURL(/\/items\/ITM-\d+\?saved=1/), p.click("#item-submit")]);
log("item created:", itemCode);

// Shared row is read-only: edit URL redirects to detail
await p.goto(`${base}/vendors/V-00001/edit`);
log("shared vendor edit redirected to:", p.url());

// PO list + PO detail + download
await p.goto(`${base}/purchase-orders?status=approved`);
const firstPo = await p.locator("#purchase-orders-table tbody tr").first().getAttribute("data-number");
log("first approved PO:", firstPo, "total:", await p.locator("#purchase-orders-pager").getAttribute("data-total"));
await p.goto(`${base}/purchase-orders/${firstPo}`);
for (let i = 0; i < 5; i++) {
  const flag = await p.locator("#po-document").getAttribute("data-rendered");
  log("po rendered flag:", flag, "doc:", await p.locator("#po-document").getAttribute("data-document-id"));
  if (flag === "1") break;
  await p.waitForTimeout(2000);
  await p.reload();
}
log("file:", await p.locator("#po-document-filename").innerText());
await p.screenshot({ path: `${shots}/po-detail.png`, fullPage: true });
const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#po-download")]);
const path = await dl.path();
const fs = await import("node:fs");
const bytes = fs.readFileSync(path);
log("download:", dl.suggestedFilename(), bytes.length, "bytes, header:", bytes.subarray(0, 5).toString());
fs.copyFileSync(path, `${shots}/downloaded.pdf`);

// New PO with validation errors then success + approve
await p.goto(`${base}/purchase-orders/new`);
await p.selectOption("#po-field-vendorCode", { index: 1 });
await p.fill("#po-field-line-1-itemCode", "ITM-000001");
await p.fill("#po-field-line-1-quantity", "10");
await p.fill("#po-field-line-1-unitPrice", "99999");
await p.fill("#po-field-line-2-itemCode", "ITM-NOPE");
await p.fill("#po-field-line-2-quantity", "0");
await p.click("#po-submit");
await p.waitForSelector('#validation-errors[data-count]:not([data-count="0"])');
log("po invalid rule ids:", (await p.locator("#validation-errors li").evaluateAll((els) => els.map((e) => e.dataset.ruleId))).join(","));
await p.fill("#po-field-line-1-unitPrice", "");
await p.fill("#po-field-line-2-itemCode", "");
await p.fill("#po-field-line-2-quantity", "");
await Promise.all([p.waitForURL(/\/purchase-orders\/PO-\d{4}-9\d{4}\?created=1/), p.click("#po-submit")]);
const newPo = p.url().match(/PO-\d{4}-\d{5}/)[0];
log("po created:", newPo, "status:", await p.locator(`#po-status-${newPo}`).innerText());
await Promise.all([p.waitForURL(/approved=1/), p.click("#po-approve")]);
for (let i = 0; i < 20; i++) {
  if ((await p.locator("#po-document").getAttribute("data-rendered")) === "1") break;
  await p.waitForTimeout(2000);
  await p.reload();
}
log("approved PO rendered:", await p.locator("#po-document").getAttribute("data-rendered"));

// Arabic / RTL
await p.goto(`${base}/lang?to=ar`);
await p.goto(`${base}/vendors`);
log("dir:", await p.locator("html").getAttribute("dir"), "title:", await p.locator("#page-title").innerText());
await p.screenshot({ path: `${shots}/vendors-ar.png`, fullPage: true });
await p.goto(`${base}/lang?to=en`);

// API
const api = await p.request.get(`${base}/api/sandbox`);
log("api/sandbox:", JSON.stringify(await api.json()));
const notRendered = await p.request.get(`${base}/api/documents/00000000-0000-0000-0000-000000000000/file`);
log("api unknown doc status:", notRendered.status());

// Reset sandbox and wait
await p.goto(`${base}/sandbox`);
await Promise.all([p.waitForURL(/reset=1/), p.click("#sandbox-reset")]);
for (let i = 0; i < 60; i++) {
  await p.goto(`${base}/`);
  const s = await p.locator("#sandbox-status").getAttribute("data-status");
  const r = await p.locator("#sandbox-status").getAttribute("data-rendered");
  const d = await p.locator("#sandbox-status").getAttribute("data-documents");
  if (s === "ready" && r === d && Number(d) > 0) { log(`after reset: ${r}/${d} PDFs`); break; }
  await p.waitForTimeout(3000);
}
await p.goto(`${base}/purchase-orders?status=approved`);
log("first approved PO after reset (should match):", await p.locator("#purchase-orders-table tbody tr").first().getAttribute("data-number"), "vs", firstPo);
log("student-created vendor gone after reset:", (await p.request.get(`${base}/vendors/${code}`)).status());

// Expired enrollment → no access
const ctx2 = await b.newContext();
const p2 = await ctx2.newPage();
await p2.goto(`${base}/login`);
await p2.fill("#login-field-email", "expired@lab.local");
await p2.fill("#login-field-password", "expired");
await Promise.all([p2.waitForURL(/no-access/), p2.click("#login-submit")]);
log("expired user landed on:", p2.url());
await b.close();
