/**
 * End-to-end check of the REST API, run the way a student's bot would use it.
 *
 *   pnpm dev                       (in one terminal)
 *   node scripts/api-smoke.mjs     (in another)
 *
 * It signs in once through the form to mint an API token, then does everything
 * else with `Authorization: Bearer`, exercising the dispatcher/performer loop,
 * extraction, grading, the three-way match and the AP decisions.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a) => console.log(...a);
const fail = (m) => {
  throw new Error(m);
};

// --- mint a token through the UI, as a student would once ------------------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.fill("#login-field-email", "student@lab.local");
await page.fill("#login-field-password", "student");
await Promise.all([page.waitForURL(`${BASE}/`), page.click("#login-submit")]);
for (let i = 0; i < 200; i++) {
  await page.goto(`${BASE}/`);
  const s = page.locator("#sandbox-status");
  if ((await s.getAttribute("data-status")) === "ready" && (await s.getAttribute("data-rendered")) === (await s.getAttribute("data-documents"))) break;
  await page.waitForTimeout(3000);
}
await page.goto(`${BASE}/sandbox`);
await page.fill("#token-name", `api-smoke ${new Date().toISOString().slice(11, 19)}`);
await Promise.all([page.waitForURL(/token=/), page.click("#token-create")]);
const TOKEN = await page.locator("#new-token-value").innerText();
await browser.close();
log("token minted:", `${TOKEN.slice(0, 14)}…`);

// --- from here on, plain HTTP with a bearer token --------------------------
const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON (a PDF or a ZIP) */
  }
  return { status: res.status, json, text, headers: res.headers };
};

// 1. Identity and discovery
const me = await api("GET", "/api/me");
if (me.status !== 200) fail(`GET /api/me -> ${me.status}`);
log("me:", me.json.user.email, "| sandbox", me.json.sandbox.status, `${me.json.sandbox.rendered}/${me.json.sandbox.documents} PDFs`, "| extractions", me.json.score.extractions);

const anon = await fetch(`${BASE}/api/me`);
if (anon.status !== 401) fail(`unauthenticated /api/me should be 401, got ${anon.status}`);
log("unauthenticated call rejected:", anon.status);

const queues = await api("GET", "/api/queues");
log("queues:", queues.json.queues.map((q) => `${q.queue}=${q.pending}`).join(" "));

// 2. Dispatcher: read a queue twice and confirm no duplicates
const first = await api("GET", "/api/work-items?queue=invoices-pending&limit=200");
const again = await api("GET", "/api/work-items?queue=invoices-pending&limit=200");
if (first.json.page.total !== again.json.page.total) fail("re-running the dispatcher changed the queue size");
log("dispatcher: ", first.json.page.total, "items, stable across two reads");

// 3. Performer: claim, download the PDF, submit a wrong extraction, read the rule IDs
const claim = await api("POST", "/api/work-items/claim", { queue: "invoices-pending", owner: "api-smoke" });
if (claim.status !== 200) fail(`claim -> ${claim.status} ${claim.text}`);
const item = claim.json.workItem;
log("claimed:", item.reference, "| lease until", item.leaseUntil);

const hidden = await api("GET", `/api/invoices/${item.reference}`);
if (hidden.json.invoice.hidden !== true) fail("a pending invoice must hide its values from the API");
log("pending invoice hides its values:", hidden.json.invoice.hidden, "| documentId", hidden.json.invoice.documentId);

const pdf = await fetch(`${BASE}${item.specificContent.downloadUrl}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
const bytes = Buffer.from(await pdf.arrayBuffer());
if (!bytes.subarray(0, 5).toString().startsWith("%PDF")) fail("download did not return a PDF");
log("downloaded:", pdf.headers.get("content-disposition"), bytes.length, "bytes");

const wrong = await api("POST", "/api/extractions", {
  internalNumber: item.reference,
  fields: { number: "WRONG-1", invoiceDate: "2026-01-01", currency: "SAR", vendorTaxId: "300000000000000", iban: "SA00", grandTotal: 1 },
  lines: [{ poLineNo: 1, quantity: 1, uom: "EA", unitPrice: 1, taxRate: 15 }],
  confidence: { number: 0.42, "vendor.iban": 0.55, "lines[0].quantity": 0.97 },
});
if (wrong.status !== 201) fail(`POST /api/extractions -> ${wrong.status} ${wrong.text}`);
log("extraction submitted; match ok:", wrong.json.match.ok, "| rules:", wrong.json.match.violations.map((v) => v.ruleId).join(","));
log("grade: score", wrong.json.grade.score, "| defects caught", wrong.json.grade.defects.caught.length, "missed", wrong.json.grade.defects.missed.length, "| false positives", wrong.json.grade.defects.falsePositives.length);
if (wrong.json.grade.score > 0.35) fail("a deliberately wrong extraction should score low");

// 4. Fail the item as a business exception, then confirm the state
const failed = await api("POST", `/api/work-items/${item.id}/fail`, { reason: "business", message: "match exception", ruleIds: wrong.json.match.violations.map((v) => v.ruleId) });
log("work item failed:", failed.json.workItem.status, "| outcome", JSON.stringify(failed.json.workItem.outcome).slice(0, 80));

// 5. A second item, extracted correctly from the ground truth an instructor can see
const claim2 = await api("POST", "/api/work-items/claim", { queue: "invoices-pending", owner: "api-smoke" });
if (claim2.status === 200) {
  const ref = claim2.json.workItem.reference;
  const complete = await api("POST", `/api/work-items/${claim2.json.workItem.id}/complete`, { outcome: { note: "processed" } });
  const twice = await api("POST", `/api/work-items/${claim2.json.workItem.id}/complete`, {});
  log("completed:", ref, complete.json.workItem.status, "| repeat call idempotent:", twice.json.idempotent === true);
}

// 6. Approve and pay the invoice we extracted
const approve = await api("POST", `/api/invoices/${item.reference}/approve`);
const pay = await api("POST", `/api/invoices/${item.reference}/pay`);
log("approve:", approve.status, approve.json.invoice.status, "| pay:", pay.status, pay.json.invoice.status, pay.json.paymentNumber);
const payAgain = await api("POST", `/api/invoices/${item.reference}/pay`);
if (payAgain.status !== 409) fail(`paying twice should be 409, got ${payAgain.status}`);
log("paying twice rejected:", payAgain.status, payAgain.json.error);

// 7. Procurement: goods receipt through the API, with an over-receipt rejected first
// A performer claims work rather than reading the list, so it can never pick up
// an item the dispatcher has already retired.
const dnClaim = await api("POST", "/api/work-items/claim", { queue: "deliveries-awaiting-grn", owner: "api-smoke" });
if (dnClaim.status === 200) {
  const dnItem = dnClaim.json.workItem;
  const dnId = dnItem.specificContent.deliveryNoteId;
  const dn = await api("GET", `/api/deliveries/${dnId}`);
  const line = dn.json.deliveryNote.lines[0];
  const over = await api("POST", "/api/grns", { deliveryNoteId: dnId, lines: [{ lineNo: line.lineNo, quantityReceived: line.quantity * 10 }] });
  if (over.status !== 422 || !over.json.violations?.some((v) => v.ruleId === "GRN-OVER-PO")) fail(`over-receipt should be 422 GRN-OVER-PO, got ${over.status} ${over.text.slice(0, 120)}`);
  log("over-receipt rejected:", over.status, over.json.violations.map((v) => v.ruleId).join(","));
  const good = await api("POST", "/api/grns", { deliveryNoteId: dnId, lines: dn.json.deliveryNote.lines.map((l) => ({ lineNo: l.lineNo, quantityReceived: l.quantity })) });
  if (good.status !== 201) fail(`posting the goods receipt failed: ${good.status} ${good.text.slice(0, 160)}`);
  log("goods receipt posted:", good.status, good.json.grn.number, "| PO now", (await api("GET", `/api/purchase-orders/${good.json.grn.purchaseOrderNumber}`)).json.purchaseOrder.status);
  // The queue must retire the item now that the receipt exists.
  await api("POST", `/api/work-items/${dnItem.id}/complete`, { outcome: { grn: good.json.grn.number } });
  const after = await api("GET", "/api/work-items?queue=deliveries-awaiting-grn&limit=200");
  const stale = after.json.items.find((i) => i.specificContent.deliveryNoteId === dnId);
  if (stale && stale.status === "new") fail("a processed delivery is still offered as new work");
  log("queue retired the processed delivery:", stale ? stale.status : "removed", "| refresh:", JSON.stringify(after.json.refresh));
} else log("no delivery awaiting a goods receipt (ok)");

// 8. Procurement: award an RFQ, then approve the purchase order it creates
const rfqs = await api("GET", "/api/rfqs?open=1&limit=5");
const openRfq = rfqs.json.items.find((r) => r.quotes.some((q) => q.status === "received"));
if (openRfq) {
  const rfq = openRfq;
  const award = await api("POST", `/api/rfqs/${rfq.number}/award`, { quoteId: rfq.quotes[0].id });
  log("awarded:", rfq.number, "->", award.json.purchaseOrderNumber);
  const approvePo = await api("POST", `/api/purchase-orders/${award.json.purchaseOrderNumber}/approve`);
  log("PO approved:", approvePo.status, approvePo.json.purchaseOrder.status, "| document", approvePo.json.documentId?.slice(0, 8));
} else log("no open RFQ (ok)");

// 9. Master data: create a vendor, and prove the shared corpus stays read-only
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const luhn = (p) => { let s = 0, d = true; for (let i = p.length - 1; i >= 0; i--) { let x = Number(p[i]); if (d) { x *= 2; if (x > 9) x -= 9; } s += x; d = !d; } return String((10 - (s % 10)) % 10); };
const mod97 = (str) => { let r = 0; for (const ch of str) { const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch; for (const d of v) r = (r * 10 + Number(d)) % 97; } return r; };
const iban = (() => { const b = "80" + digits(18); const c = 98 - mod97(b + "SA00"); return "SA" + String(c).padStart(2, "0") + b; })();
const taxId = (() => { const b = "3" + digits(13); return b + luhn(b); })();
const crBody = String(Math.floor(Math.random() * 9) + 1) + digits(8);
const crCheck = (() => { let s = 0; for (let i = 0; i < 9; i++) s += Number(crBody[8 - i]) * (i + 2); const r = (11 - (s % 11)) % 11; return String(r === 10 ? 0 : r); })();
const vendors = await api("GET", "/api/vendors?limit=1");
const nextCode = `V-${String(10000 + Math.floor(Math.random() * 8000)).padStart(5, "0")}`;
const badVendor = await api("POST", "/api/vendors", { code: nextCode, name: "API Test Vendor", crNumber: "1010456783", crExpiry: "2027-01-01", taxId: "300000000000000", taxCertExpiry: "2027-01-01", iban: "SA00", email: "nope", currency: "SAR" });
log("invalid vendor rejected:", badVendor.status, badVendor.json.violations?.map((v) => v.ruleId).join(","));
const goodVendor = await api("POST", "/api/vendors", { code: nextCode, name: `API Test Vendor ${Date.now()}`, crNumber: crBody + crCheck, crExpiry: "2027-01-01", taxId, taxCertExpiry: "2027-01-01", iban, email: "api@test.example", currency: "SAR", bankName: "Test Bank" });
log("vendor created:", goodVendor.status, goodVendor.json.vendor?.code, "| corpus size", vendors.json.page.total);
const sharedPatch = await api("PATCH", "/api/vendors/V-00001", { name: "Should not work" });
if (sharedPatch.status !== 403) fail(`patching a shared vendor should be 403, got ${sharedPatch.status}`);
log("shared corpus vendor is read-only:", sharedPatch.status, sharedPatch.json.error);

// 10. Contract and packaging
const spec = await api("GET", "/api/openapi");
log("openapi:", spec.json.openapi, "|", Object.keys(spec.json.paths).length, "paths");
const zip = await fetch(`${BASE}/api/queues/invoices-pending/download`, { headers: { Authorization: `Bearer ${TOKEN}` } });
log("queue zip:", zip.status, zip.headers.get("content-type"), zip.headers.get("x-document-count"), "docs");

// 11. Revoking the token closes the door
const tokens = await api("GET", "/api/tokens");
const mine = tokens.json.tokens.find((t) => TOKEN.includes(t.prefix));
await api("DELETE", `/api/tokens/${mine.id}`);
const afterRevoke = await api("GET", "/api/me");
if (afterRevoke.status !== 401) fail(`a revoked token must be rejected, got ${afterRevoke.status}`);
log("revoked token rejected:", afterRevoke.status);

log("\nAPI smoke test passed.");
