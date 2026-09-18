/**
 * Photograph the shell at the two widths that matter.
 *
 * This exists because three defects shipped in one afternoon that every other
 * check was blind to: the media queries were written above the rules they had
 * to override and so lost the cascade, the module list did not render at a
 * desk at all, and four dashboard tiles carried whatever string was nearest to
 * hand. Types passed, lint passed, the tests passed, the build passed. Looking
 * at it took thirty seconds.
 *
 * It runs against a local server on purpose. A browser in a sandboxed
 * environment often cannot trust the egress proxy's certificate, and localhost
 * does not go through one.
 *
 *   scripts/serve-prod.sh 3200
 *   node scripts/shell-shots.mjs            (writes to /var/tmp/shots)
 *   OUT=/tmp/x BASE_URL=http://127.0.0.1:3000 node scripts/shell-shots.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const OUT = process.env.OUT ?? "/var/tmp/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const stamp = Date.now();
const email = `shots-${stamp}@example.com`;

const desktop = await browser.newContext({ viewport: { width: 1440, height: 980 } });
const page = await desktop.newPage();
await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/01-register-1440.png` });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/02-landing-1440.png` });

await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
await page.fill("#register-field-email", email);
await page.fill("#register-field-password", "a-good-long-password");
await page.fill("#register-field-passwordConfirm", "a-good-long-password");
for (const [sel, val] of [["#register-field-displayName", "Mohammed Shaker"], ["#register-field-alias", `shots${stamp % 100000}`], ["#register-field-location", "Riyadh"]]) {
  const el = await page.$(sel);
  if (el) await el.fill(val);
}
await Promise.all([page.waitForURL(/welcome=1/, { timeout: 30000 }).catch(() => {}), page.click("#register-submit")]);

// The sandbox is a status flip now, but wait for it rather than assume.
for (let i = 0; i < 40; i++) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  if ((await page.locator("#sandbox-status").getAttribute("data-status")) === "ready") break;
  await page.waitForTimeout(1000);
}
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/03-dashboard-1440.png` });
await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/04-invoices-1440.png` });

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await desktop.storageState() });
const mob = await phone.newPage();
await mob.goto(`${BASE}/`, { waitUntil: "networkidle" });
await mob.screenshot({ path: `${OUT}/05-dashboard-390.png` });

const burger = await mob.$("#nav-toggle");
if (!burger) throw new Error("the phone menu button is not on the page");
await burger.click();
await mob.waitForTimeout(400);
await mob.screenshot({ path: `${OUT}/06-dashboard-390-menu.png` });

// The numbers worth failing on rather than eyeballing.
const links = await mob.$$eval("#nav-modules a", (a) => a.filter((x) => x.offsetParent !== null).length);
const width = await mob.$eval(".app-main", (el) => Math.round(el.getBoundingClientRect().width));
console.log(`signed in as ${email}`);
console.log(`module links reachable from the phone menu: ${links}`);
console.log(`the work gets ${width}px of a 390px screen`);

/*
 * Sideways scroll, measured rather than looked for.
 *
 * Ten pixels of it is invisible in a screenshot and horrible on a phone, and
 * it came from a min-width set inline — which a media query cannot override,
 * so the rule written to prevent exactly this did nothing. Both the public
 * pages and the signed-in ones, because the two have different chrome.
 */
const overflows = [];
for (const path of ["/", "/challenges", "/login", "/invoices", "/vendors"]) {
  await mob.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await mob.waitForTimeout(250);
  const o = await mob.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  if (o.doc > o.win + 1) overflows.push(`${path} scrolls ${o.doc - o.win}px sideways`);
}
console.log(overflows.length ? overflows.map((o) => `  ! ${o}`).join("\n") : "nothing scrolls sideways at 390px");

await browser.close();
if (links < 10) throw new Error(`only ${links} module links are reachable on a phone`);
if (width < 360) throw new Error(`the content column is ${width}px on a 390px screen`);
if (overflows.length) throw new Error(overflows.join("; "));
console.log("\nShell looks right at both widths.");
