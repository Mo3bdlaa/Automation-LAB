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
 *   pnpm deck:preview
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { resolveChromiumExecutable } from "../src/lib/documents/renderer";

const ROOT = path.resolve(import.meta.dirname, "..");
const DECK = path.join(ROOT, "course/automation-lab-deck.pptx");
const PDF = path.join(ROOT, "course/automation-lab-deck.pdf");
const OUT = path.join(ROOT, "course/build/preview");

async function main() {
  mkdirSync(path.join(OUT, "png"), { recursive: true });
  execFileSync("python3", [path.join(ROOT, "course/preview.py"), DECK, OUT], { stdio: "inherit" });

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
    await page.goto(`file://${path.join(OUT, "deck.html")}`, { waitUntil: "networkidle", timeout: 120_000 });

    const slides = await page.$$eval("section", (s) => s.length);
    for (let i = 0; i < slides; i++) {
      const el = (await page.$$("section"))[i];
      await el.screenshot({ path: path.join(OUT, "png", `slide-${String(i + 1).padStart(2, "0")}.png`) });
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
      path: PDF,
      width: "13.333in",
      height: "7.5in",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: `1-${slides}`,
    });

    console.log(`${slides} slides → ${path.relative(ROOT, PDF)} and ${path.relative(ROOT, OUT)}/png`);
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
