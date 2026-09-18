/**
 * Duplicate ids on the pages a participant actually works through.
 *
 * An id repeated is worse than an id missing: a missing one fails loudly, a
 * repeated one resolves — to whichever element the engine happened to return
 * first — and the bot quietly reads the wrong cell.
 *
 * This is not hypothetical. Splitting a detail page into a header strip and
 * the full record renders from two components that build ids the same way,
 * and a key left in both lists puts the same id on the page twice.
 *
 *   scripts/serve-prod.sh 3200
 *   node scripts/duplicate-ids.mjs
 */
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const stamp = Date.now();
await p.goto(`${BASE}/register`, { waitUntil: "networkidle" });
await p.fill("#register-field-email", `dup-${stamp}@example.com`);
await p.fill("#register-field-password", "a-good-long-password");
await p.fill("#register-field-passwordConfirm", "a-good-long-password");
for (const [s, v] of [["#register-field-displayName", "Dup Check"], ["#register-field-alias", `dup${stamp % 100000}`], ["#register-field-location", "Riyadh"]]) {
  const el = await p.$(s); if (el) await el.fill(v);
}
await Promise.all([p.waitForURL(/welcome=1/, { timeout: 30000 }).catch(() => {}), p.click("#register-submit")]);
for (let i = 0; i < 40; i++) {
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  if ((await p.locator("#sandbox-status").getAttribute("data-status")) === "ready") break;
  await p.waitForTimeout(1000);
}
const firstVendor = await (await p.goto(`${BASE}/vendors`, { waitUntil: "networkidle" })) && await p.$eval("[id^='vendors-row-']", (el) => el.id.replace("vendors-row-", ""));
const pages = ["/", "/invoices", "/vendors", `/vendors/${encodeURIComponent(firstVendor)}`, "/purchase-orders", "/deliveries", "/rfqs", "/challenges"];
let bad = 0;
for (const path of pages) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const dups = await p.evaluate(() => {
    const seen = new Map();
    for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);
  });
  console.log(`${path.padEnd(34)} ${dups.length ? "DUPLICATES: " + dups.join(", ") : "ok"}`);
  bad += dups.length;
}
await b.close();
if (bad) { console.log(`\n${bad} duplicated ids`); process.exit(1); }
console.log("\nNo duplicate ids on the work screens.");
