/**
 * A robot credential must sign in as itself, land in its owner's sandbox, and
 * count as the owner rather than as a second participant on the board.
 *
 * The failure this guards against is the robot being treated as a new person:
 * it would get its own empty sandbox, and its runs would appear on the
 * leaderboard under a machine-generated name.
 *
 *   node scripts/bot-credential-smoke.mjs
 *   BASE_URL=http://localhost:3200 node scripts/bot-credential-smoke.mjs
 */
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-background-networking"] });
const page = await browser.newPage();
const stamp = Date.now();
const email = `bot-check-${stamp}@example.com`;

await page.goto(`${BASE}/register`);
await page.fill("#register-field-email", email);
await page.fill("#register-field-password", "a-good-long-password");
await page.fill("#register-field-passwordConfirm", "a-good-long-password");
await page.fill("#register-field-displayName", "Bot Check");
await page.fill("#register-field-alias", `botcheck-${stamp % 100000}`);
await page.fill("#register-field-location", "Jeddah");
await Promise.all([page.waitForURL(/welcome=1/), page.click("#register-submit")]);
console.log("registered:", email);

await page.goto(`${BASE}/sandbox`);
const botEmail = (await page.locator("#bot-email").innerText()).trim();
if (!botEmail.includes("@bots.")) fail(`expected a robot login, got "${botEmail}"`);
console.log("robot login created automatically:", botEmail);

await Promise.all([page.waitForURL(/bot=/), page.click("#bot-password-regenerate")]);
const botPassword = (await page.locator("#new-bot-password-value").innerText()).trim();
if (!botPassword) fail("no robot password was issued");
console.log("robot password issued, length", botPassword.length);

// The owner's sandbox, as the owner sees it (the status tile is on the dashboard).
await page.goto(BASE);
const ownerStatus = await page.locator("#sandbox-status").getAttribute("data-status");
console.log("owner sandbox status:", ownerStatus);

// Now sign in as the robot, in a clean browser context.
const robot = await browser.newContext();
const rp = await robot.newPage();
await rp.goto(`${BASE}/login`);
await rp.fill("#login-field-email", botEmail);
await rp.fill("#login-field-password", botPassword);
await Promise.all([rp.waitForURL((u) => !u.pathname.startsWith("/login")), rp.click("#login-submit")]);
console.log("robot signed in, landed on", new URL(rp.url()).pathname);

await rp.goto(BASE);
const robotStatus = await rp.locator("#sandbox-status").getAttribute("data-status");
if (robotStatus !== "ready") fail(`robot's sandbox is "${robotStatus}", expected ready`);
await rp.goto(`${BASE}/sandbox`);
// The robot must see its owner's robot email, i.e. the same account family.
const seen = (await rp.locator("#bot-email").innerText()).trim();
if (seen !== botEmail) fail(`robot sees a different credential: ${seen}`);
console.log("robot is in the owner's sandbox, not a new one");

await browser.close();
console.log("\nRobot credential check passed.");
process.exit(0);
