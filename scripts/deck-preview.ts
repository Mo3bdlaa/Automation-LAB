/**
 * Look at the course deck without PowerPoint.
 *
 * `course/preview.py` reads the package's geometry and lays it out as HTML at
 * exactly 13.333 × 7.5in; this prints that HTML with the same headless Chromium
 * the app uses for its own documents, and shoots every slide as a PNG.
 *
 * Two things to keep in mind about what comes out. The typeface is not the
 * deck's — Geist is neither installed here nor embedded in the file, so the
 * render substitutes a wider grotesque; everything else (position, size,
 * colour, letter-spacing, the gold rule) is read from the package and is exact.
 * That substitution is the point: anything that fits at this width fits in
 * PowerPoint. It cannot prove a line is safe by being narrow.
 *
 *   pnpm deck:preview                                  # every deck in course/
 *   pnpm deck:preview course/invoice-processing-deck.pptx
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright-core";
import { resolveChromiumExecutable } from "../src/lib/documents/renderer";

const ROOT = path.resolve(import.meta.dirname, "..");
const COURSE = path.join(ROOT, "course");

/** Every built deck, or the ones named on the command line. */
function decks(): string[] {
  const named = process.argv.slice(2);
  if (named.length) return named.map((f) => path.resolve(f));
  return readdirSync(COURSE)
    .filter((f) => f.endsWith(".pptx"))
    .sort()
    .map((f) => path.join(COURSE, f));
}

async function preview(page: Page, deck: string): Promise<string[]> {
  const name = path.basename(deck, ".pptx");
  const pdf = path.join(COURSE, `${name}.pdf`);
  const out = path.join(COURSE, "build/preview", name);
  mkdirSync(path.join(out, "png"), { recursive: true });
  execFileSync("python3", [path.join(COURSE, "preview.py"), deck, out], { stdio: "inherit" });

  await page.goto(`file://${path.join(out, "deck.html")}`, { waitUntil: "networkidle", timeout: 120_000 });

  const slides = await page.$$eval("section", (s) => s.length);
  for (let i = 0; i < slides; i++) {
    const el = (await page.$$("section"))[i];
    await el.screenshot({ path: path.join(out, "png", `slide-${String(i + 1).padStart(2, "0")}.png`) });
  }

  // Overflow, measured rather than eyeballed: a box whose content is taller
  // than the box is copy that will spill in PowerPoint too.
  const spills = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("section").forEach((sec, si) => {
      sec.querySelectorAll("div").forEach((d) => {
        if (!d.querySelector("p")) return;
        const over = d.scrollHeight - d.clientHeight;
        if (over > 2) out.push(`slide ${si + 1}: overflows by ${over}px — "${(d.textContent ?? "").trim().slice(0, 60)}"`);
      });
    });
    return out;
  });

  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: pdf,
    width: "13.333in",
    height: "7.5in",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    pageRanges: `1-${slides}`,
  });
  await page.emulateMedia({ media: "screen" });

  console.log(`${name}: ${slides} slides → ${path.relative(ROOT, pdf)} and ${path.relative(ROOT, out)}/png`);
  return spills.map((s) => `${name} ${s}`);
}

async function main() {
  const target = await resolveChromiumExecutable();
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: target.executablePath,
    args: [...target.args, "--no-sandbox"],
  });
  try {
    const page = await (await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1.2,
    })).newPage();
    const spills: string[] = [];
    for (const deck of decks()) spills.push(...(await preview(page, deck)));
    console.log(spills.length ? spills.join("\n") : "no text box overflows its own frame");
    if (spills.length) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
