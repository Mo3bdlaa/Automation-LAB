/**
 * End-to-end check of the challenge: sign up as a new participant, open a
 * scored run, work the queue properly through the API, close it, and confirm
 * the score, the certificate and the leaderboard.
 *
 * It works the goods receipt scenario because that one can be done correctly
 * without reading a PDF, which lets the check assert that a careful run scores
 * highly - a smoke test that only ever submits rubbish proves the grader
 * rejects rubbish, not that it rewards good work.
 *
 *   node scripts/challenge-smoke.mjs           (against pnpm dev on :3000)
 *   BASE_URL=http://localhost:3200 node scripts/challenge-smoke.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const log = (...a) => console.log(...a);
const fail = (m) => {
  throw new Error(m);
};

// --- sign up through the UI, the way a participant would -------------------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-background-networking"] });
const page = await browser.newPage();
const stamp = Date.now();
const email = `challenge-smoke-${stamp}@example.com`;
await page.goto(`${BASE}/register`);
await page.fill("#register-field-email", email);
await page.fill("#register-field-password", "a-good-long-password");
await page.fill("#register-field-passwordConfirm", "a-good-long-password");
await page.fill("#register-field-displayName", "Challenge Smoke");
await page.fill("#register-field-alias", `smoke-${stamp % 1000000}`);
await page.fill("#register-field-location", "Riyadh");
await Promise.all([page.waitForURL(/welcome=1/), page.click("#register-submit")]);
log("registered:", email);

for (let i = 0; i < 200; i++) {
  await page.goto(BASE);
  if ((await page.locator("#sandbox-status").getAttribute("data-status")) === "ready") break;
  await page.waitForTimeout(3000);
}
if ((await page.locator("#sandbox-status").getAttribute("data-status")) !== "ready") fail("the sandbox never became ready");
await page.goto(`${BASE}/sandbox`);
await page.fill("#token-name", `challenge-smoke ${stamp}`);
await Promise.all([page.waitForURL(/token=/), page.click("#token-create")]);
const TOKEN = await page.locator("#new-token-value").innerText();
await browser.close();
log("sandbox ready, token minted");

const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: r.status, json, text };
};

// --- the catalogue ---------------------------------------------------------
const catalogue = await api("GET", "/api/scenarios");
if (catalogue.status !== 200) fail(`GET /api/scenarios -> ${catalogue.status}`);
log("scenarios:", catalogue.json.scenarios.map((s) => `${s.slug}(${s.targetSize})`).join(" "));
const scenario = catalogue.json.scenarios.find((s) => s.slug === "goods-receipt");
if (!scenario) fail("the goods receipt scenario is missing");

// --- open a scored run -----------------------------------------------------
const started = await api("POST", "/api/challenge/runs", { scenario: "goods-receipt", mode: "scored" });
if (started.status !== 201) fail(`starting a run -> ${started.status} ${started.text}`);
const run = started.json.run;
log("run open:", run.id.slice(0, 8), "|", run.targets.length, "deliveries in scope");
if (run.targets.length !== scenario.targetSize) fail(`expected ${scenario.targetSize} targets, got ${run.targets.length}`);

const second = await api("POST", "/api/challenge/runs", { scenario: "invoice-processing", mode: "scored" });
if (second.status !== 409) fail("a second run should be refused while one is open");
log("second run refused:", second.status);

// --- work the queue properly ----------------------------------------------
const queue = await api("GET", `/api/work-items?queue=goods-receipt&limit=50`);
const items = await api("GET", "/api/work-items?queue=deliveries-awaiting-grn&limit=50");
if (items.status !== 200) fail(`reading the queue -> ${items.status}`);
let posted = 0;
let refused = 0;
for (const reference of run.targets) {
  const item = items.json.items.find((i) => i.reference === reference);
  if (!item) continue;
  const dn = await api("GET", `/api/deliveries/${item.specificContent.deliveryNoteId}`);
  if (dn.status !== 200) fail(`reading a delivery note -> ${dn.status}`);
  const po = await api("GET", `/api/purchase-orders/${dn.json.deliveryNote.purchaseOrderNumber}`);
  const poLines = po.json.purchaseOrder.lines;
  // Post what arrived, but never more than the order allows: an over-delivery
  // is refused, which is the decision this scenario is really testing.
  const over = dn.json.deliveryNote.lines.some((l) => {
    const ordered = poLines.find((p) => p.lineNo === l.poLineNo)?.quantity;
    return ordered !== undefined && l.quantity > ordered * 1.02;
  });
  if (over) {
    refused++;
    await api("POST", `/api/work-items/${item.id}/fail`, { reason: "business", message: "Over-delivery beyond tolerance", ruleIds: ["GRN-OVER-PO"] });
    continue;
  }
  const receipt = await api("POST", "/api/grns", {
    deliveryNoteId: dn.json.deliveryNote.id,
    lines: dn.json.deliveryNote.lines.map((l) => ({ lineNo: l.lineNo, quantityReceived: l.quantity })),
  });
  if (receipt.status !== 201) fail(`posting a goods receipt -> ${receipt.status} ${receipt.text}`);
  posted++;
  await api("POST", `/api/work-items/${item.id}/complete`, { outcome: { grn: receipt.json.grn.number } });
}
log(`worked the queue: ${posted} receipts posted, ${refused} over-deliveries refused`);
if (queue.status !== 400) fail("an unknown queue name should be rejected");

// --- close and read the result --------------------------------------------
const closed = await api("POST", `/api/challenge/runs/${run.id}/close`);
if (closed.status !== 200) fail(`closing the run -> ${closed.status} ${closed.text}`);
const result = closed.json.result;
log(`closed: ${result.score} / 100 · ${closed.json.passed ? "passed" : "not passed"} · driven by ${result.channel}`);
for (const p of result.parameters) log(`  ${p.key.padEnd(11)} ${String(p.points).padStart(6)} / ${p.max}   ${p.detail}`);
if (result.score < scenario.passMark) fail(`a run done properly should pass; scored ${result.score} against a pass mark of ${scenario.passMark}`);
if (result.channel !== "ui" && result.channel !== "api") fail(`unexpected channel ${result.channel}`);

// --- the certificate and its public verification ---------------------------
const certificate = closed.json.run.certificate;
if (!certificate) fail("a passing run should earn a certificate");
log("certificate:", certificate.code);
const verify = await fetch(`${BASE}/verify/${certificate.code}`);
const verifyHtml = await verify.text();
if (verify.status !== 200) fail(`the verification page -> ${verify.status}`);
if (!verifyHtml.includes(certificate.code)) fail("the verification page does not show the code");
if (!verifyHtml.includes("Challenge Smoke")) fail("the verification page does not show the name on the certificate");
const pdf = await fetch(`${BASE}/verify/${certificate.code}/certificate.pdf`);
const bytes = Buffer.from(await pdf.arrayBuffer());
if (!bytes.subarray(0, 5).toString().startsWith("%PDF")) fail("the certificate did not download as a PDF");
log("certificate verified publicly and downloaded:", bytes.length, "bytes");
const bogus = await fetch(`${BASE}/verify/AAAAA-BBBBB`);
if (bogus.status !== 404) fail("an invented certificate code should not verify");
log("an invented code does not verify:", bogus.status);

// --- the leaderboard is opt-in --------------------------------------------
const before = await (await fetch(`${BASE}/api/leaderboard?scenario=goods-receipt&limit=100`)).json();
if (before.entries.some((e) => e.certificate === certificate.code)) fail("a run should not be published until its owner says so");
await api("PATCH", `/api/challenge/runs/${run.id}`, { publish: true });
const after = await (await fetch(`${BASE}/api/leaderboard?scenario=goods-receipt&limit=100`)).json();
const mine = after.entries.find((e) => e.certificate === certificate.code);
if (!mine) fail("the published run is not on the leaderboard");
log(`leaderboard: rank ${mine.rank} as "${mine.name}" from ${mine.location}, ${mine.score} points`);
await api("PATCH", `/api/challenge/runs/${run.id}`, { publish: false });
const removed = await (await fetch(`${BASE}/api/leaderboard?scenario=goods-receipt&limit=100`)).json();
if (removed.entries.some((e) => e.certificate === certificate.code)) fail("opting out should remove the run from the board");
log("opting back out removes it again");

log("\nChallenge smoke test passed.");
process.exit(0);
