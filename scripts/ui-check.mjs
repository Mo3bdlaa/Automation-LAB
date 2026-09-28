/**
 * Every control has to be clickable where it is drawn.
 *
 * A screen can look right and still be broken: a card that overlaps a button,
 * a sticky band that covers the row under it, a table that runs past its
 * column. None of that shows up in a unit test, and it does not show up in a
 * screenshot either — it shows up when somebody, or somebody's bot, clicks and
 * nothing happens. This walks the work screens at a few widths and checks two
 * things about every link, button and field:
 *
 *   covered  the element at its own centre is something else entirely, so the
 *            click lands on that instead. Always a fault.
 *   clipped  it is inside a box that scrolls sideways and is currently out of
 *            view. Reachable, but only after scrolling a table — worth knowing,
 *            and the reason for --strict.
 *
 *   scripts/serve-prod.sh 3200
 *   BASE_URL=http://127.0.0.1:3200 node scripts/ui-check.mjs [--strict]
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STRICT = process.argv.includes("--strict");
const EMAIL = process.env.LAB_EMAIL ?? "student@lab.local";
const PASSWORD = process.env.LAB_PASSWORD ?? "student";
const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 1440, height: 950 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: WIDTHS[0] });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.fill("#login-field-email", EMAIL);
await page.fill("#login-field-password", PASSWORD);
await Promise.all([page.waitForURL(`${BASE}/`), page.click("#login-submit")]);

/** First row of a list, for the detail screens. Null when the list is empty. */
async function first(list, selector, attr = "data-number") {
  await page.goto(`${BASE}${list}`);
  const row = page.locator(selector).first();
  return (await row.count()) ? row.getAttribute(attr) : null;
}

const po = await first("/purchase-orders", "#purchase-orders-table tbody tr");
const inv = await first("/invoices", "#invoices-table tbody tr");
const rfq = await first("/rfqs", "#rfqs-table tbody tr");
const vendor = await first("/vendors", "#vendors-table tbody tr", "data-code");
const item = await first("/items", "#items-table tbody tr", "data-code");
const grn = await first("/goods-receipts", "#goods-receipts-table tbody tr");
const delivery = await first("/deliveries", "#deliveries-table tbody tr", "data-id");
const payment = await first("/payments", "#payments-table tbody tr");

const screens = [
  "/", "/invoices", "/purchase-orders", "/vendors", "/items", "/payments", "/deliveries", "/goods-receipts", "/rfqs",
  po && `/purchase-orders/${po}`,
  inv && `/invoices/${inv}`,
  rfq && `/rfqs/${rfq}`,
  vendor && `/vendors/${vendor}`,
  vendor && `/vendors/${vendor}/edit`,
  item && `/items/${item}`,
  grn && `/goods-receipts/${grn}`,
  delivery && `/deliveries/${delivery}`,
  payment && `/payments/${payment}`,
  "/purchase-orders/new", "/vendors/new", "/items/new",
  po && `/invoices/new?po=${po}`, "/invoices/new",
  "/challenges", "/leaderboard", "/account", "/rules", "/sandbox", "/search?q=INV",
].filter(Boolean);

/**
 * The check itself, in the page. An element passes when the topmost element at
 * its centre is itself, something inside it, or something it sits inside — a
 * label wrapping its input is not a fault.
 */
function inspect() {
  const scrollParent = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e).overflowX;
      if ((o === "auto" || o === "scroll") && e.scrollWidth > e.clientWidth + 1) return e;
    }
    return null;
  };
  const covered = [];
  const clipped = [];
  for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea")) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const name = `${el.tagName.toLowerCase()}#${el.id || "(no id)"}`;
    const sp = scrollParent(el);
    if (sp) {
      const sr = sp.getBoundingClientRect();
      if (r.left < sr.left - 1 || r.right > sr.right + 1) {
        clipped.push(`${name} needs ${sp.id ? `#${sp.id}` : sp.className} scrolled sideways`);
        continue;
      }
    }
    const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
    const cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    const top = document.elementFromPoint(cx, cy);
    if (!top || top === el || el.contains(top) || top.contains(el)) continue;
    covered.push(`${name} covered by ${top.tagName.toLowerCase()}#${top.id || ""}${top.className ? `.${String(top.className).split(" ")[0]}` : ""}`);
  }
  return { covered, clipped };
}

let coveredTotal = 0;
let clippedTotal = 0;
for (const size of WIDTHS) {
  await page.setViewportSize(size);
  for (const path of screens) {
    await page.goto(BASE + path, { waitUntil: "load" });
    const { covered, clipped } = await page.evaluate(inspect);
    coveredTotal += covered.length;
    clippedTotal += clipped.length;
    for (const c of [...new Set(covered)]) console.log(`✗ ${size.width}px ${path}: ${c}`);
    for (const c of [...new Set(clipped)]) console.log(`· ${size.width}px ${path}: ${c}`);
  }
}

console.log(
  coveredTotal || clippedTotal
    ? `${coveredTotal} covered, ${clippedTotal} reachable only by scrolling sideways, over ${screens.length} screens at ${WIDTHS.map((w) => `${w.width}px`).join(" and ")}`
    : `No covered controls on ${screens.length} screens at ${WIDTHS.map((w) => `${w.width}px`).join(" and ")}.`,
);
await browser.close();
process.exit(coveredTotal || (STRICT && clippedTotal) ? 1 : 0);
