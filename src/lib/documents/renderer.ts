/**
 * HTML → PDF through headless Chromium (playwright-core). Rendering happens in
 * a background job, never in a request handler, so cold starts do not matter.
 * The browser binary is resolved from, in order:
 *   1. CHROMIUM_EXECUTABLE_PATH
 *   2. @sparticuz/chromium if installed (serverless deployments)
 *   3. Playwright's registry (PLAYWRIGHT_BROWSERS_PATH / default cache)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";

let browserPromise: Promise<Browser> | null = null;

export async function resolveChromiumExecutable(): Promise<string> {
  const fromEnv = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`CHROMIUM_EXECUTABLE_PATH does not exist: ${fromEnv}`);
    return fromEnv;
  }
  try {
    // Optional dependency for serverless hosts. Resolved at runtime so bundlers do not try to trace it.
    const specifier = ["@sparticuz", "chromium"].join("/");
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier)) as { default?: { executablePath: () => Promise<string> } };
    if (mod?.default?.executablePath) return await mod.default.executablePath();
  } catch {
    /* not installed */
  }
  const candidates = [
    process.env.PLAYWRIGHT_BROWSERS_PATH && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium"),
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    /* no registry */
  }
  throw new Error("No Chromium found. Set CHROMIUM_EXECUTABLE_PATH.");
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await resolveChromiumExecutable();
      const b = await chromium.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      });
      b.on("disconnected", () => {
        browserPromise = null;
      });
      return b;
    })();
  }
  return browserPromise;
}

export interface RenderResult {
  pdf: Uint8Array;
  pages: number;
}

export interface RenderOptions {
  /** Chromium header/footer templates (HTML). Both must be given to enable them. */
  headerTemplate?: string;
  footerTemplate?: string;
  margin?: { top: string; bottom: string; left: string; right: string };
}

export async function renderHtmlToPdf(html: string, opts: RenderOptions = {}): Promise<RenderResult> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const chrome = Boolean(opts.headerTemplate && opts.footerTemplate);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: !chrome,
      displayHeaderFooter: chrome,
      headerTemplate: opts.headerTemplate,
      footerTemplate: opts.footerTemplate,
      margin: opts.margin,
    });
    const pages = countPdfPages(pdf);
    return { pdf: new Uint8Array(pdf), pages };
  } finally {
    await context.close();
  }
}

export async function closeRenderer(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise;
  browserPromise = null;
  await b.close();
}

/** Cheap page count: count `/Type /Page` objects (not `/Pages`). */
export function countPdfPages(pdf: Uint8Array | Buffer): number {
  const s = Buffer.from(pdf).toString("latin1");
  const m = s.match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 1;
}
