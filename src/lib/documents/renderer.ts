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
import type { Browser, Page } from "playwright-core";

let browserPromise: Promise<Browser> | null = null;

/**
 * Playwright is loaded only when a document is actually rendered. Importing it
 * at module scope would pull the browser driver into every page's server
 * bundle, which breaks standalone builds and slows serverless cold starts.
 */
async function playwright() {
  return (await import("playwright-core")).chromium;
}

export interface ChromiumTarget {
  executablePath: string;
  /** Flags the host itself requires, ahead of ours. */
  args: string[];
  /**
   * Whether this browser must be thrown away after a single document.
   *
   * The serverless browser runs with `--single-process`, where closing a
   * context closes the browser with it: the first document printed fine and
   * the second failed with "Target page, context or browser has been closed".
   * Keeping one alive between requests would be wrong anyway — a serverless
   * instance is frozen between invocations, so a browser held across them is a
   * child process in an undefined state.
   */
  disposable: boolean;
}

export async function resolveChromiumExecutable(): Promise<ChromiumTarget> {
  const fromEnv = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`CHROMIUM_EXECUTABLE_PATH does not exist: ${fromEnv}`);
    return { executablePath: fromEnv, args: [], disposable: false };
  }
  // A serverless host has no browser on the filesystem, so this package carries
  // one and unpacks it into /tmp. The specifier is a literal because the
  // bundler has to be able to trace it: written dynamically it was invisible,
  // and the two routes that print a PDF - the certificate and a scenario's
  // process document - shipped without a browser and answered 500.
  // It brings its own flags for the sandbox it runs in; those go first.
  try {
    const mod = await import("@sparticuz/chromium");
    const sparticuz = mod.default;
    if (typeof sparticuz?.executablePath === "function") {
      return { executablePath: await sparticuz.executablePath(), args: sparticuz.args ?? [], disposable: true };
    }
  } catch (e) {
    // Worth saying out loud. Swallowing this is what made a missing browser in
    // production look like "No Chromium found" with no clue which of the three
    // lookups failed or why.
    console.warn("[renderer] the serverless browser could not be used:", e instanceof Error ? e.message : e);
  }
  const candidates = [
    process.env.PLAYWRIGHT_BROWSERS_PATH && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium"),
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return { executablePath: c, args: [], disposable: false };
  try {
    const p = (await playwright()).executablePath();
    if (p && existsSync(p)) return { executablePath: p, args: [], disposable: false };
  } catch {
    /* no registry */
  }
  throw new Error("No Chromium found. Set CHROMIUM_EXECUTABLE_PATH.");
}

/** Shared with the degradation pipeline, which drives its own pages. */
export async function sharedBrowser(): Promise<Browser> {
  return getBrowser();
}

async function launch(target: ChromiumTarget): Promise<Browser> {
  const { executablePath, args: hostArgs } = target;
  const chromium = await playwright();
  return chromium.launch({
    executablePath,
    headless: true,
    args: [
      ...hostArgs,
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      // A renderer on a server has nothing to talk to. Without these it
      // reaches for Google's update and sync endpoints on every launch,
      // which stalls startup wherever egress is filtered.
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--disable-default-apps",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
}

/**
 * The long-lived browser, for the seed: thousands of documents in one process,
 * where paying for a launch each time would add hours. Only ever a browser that
 * survives having a context closed — the serverless one does not, and is
 * launched per document instead.
 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const b = await launch(await resolveChromiumExecutable());
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
  /** Field boxes measured from the print layout, when `captureFields` is set. */
  boxes?: FieldBox[];
}

/** A ground-truth field's position on the page, normalised to 0..1. */
export interface FieldBox {
  field: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A4 content box in CSS pixels at 96 dpi, matching the `@page` margins the
 * templates declare (14mm sides, 14mm top, 16mm bottom). Laying the page out at
 * exactly this size before measuring reproduces the printed layout, so an
 * element's offset divided by the page height gives the page it lands on.
 */
export const PRINT_CONTENT_WIDTH_PX = Math.round((210 - 14 - 14) * (96 / 25.4));
export const PRINT_CONTENT_HEIGHT_PX = Math.round((297 - 14 - 16) * (96 / 25.4));

export interface RenderOptions {
  /** Chromium header/footer templates (HTML). Both must be given to enable them. */
  headerTemplate?: string;
  footerTemplate?: string;
  margin?: { top: string; bottom: string; left: string; right: string };
  /** Measure `[data-gt-field]` elements and return their page positions. */
  captureFields?: boolean;
}

export async function renderHtmlToPdf(html: string, opts: RenderOptions = {}): Promise<RenderResult> {
  // A serverless browser is single-use (see ChromiumTarget.disposable): it gets
  // its own process, which is closed whole rather than by closing the context.
  const target = await resolveChromiumExecutable();
  const browser = target.disposable ? await launch(target) : await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    if (opts.captureFields) {
      await page.setViewportSize({ width: PRINT_CONTENT_WIDTH_PX, height: PRINT_CONTENT_HEIGHT_PX });
      await page.emulateMedia({ media: "print" });
    }
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const boxes = opts.captureFields ? await captureFieldBoxes(page) : undefined;
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
    return { pdf: new Uint8Array(pdf), pages, boxes };
  } finally {
    // Closing a context on the single-process browser takes the browser with
    // it, so there is nothing to be gained by doing both — and on the shared
    // browser there is everything to lose.
    await (target.disposable ? browser.close() : context.close()).catch(() => {});
  }
}

/**
 * Reads the position of every element the templates marked with
 * `data-gt-field`. Positions are relative to the printed page: the element's
 * offset in the flow divided by the page content height gives its page, the
 * remainder its position on that page. Exact for the single-page documents the
 * lab generates; on a document that spills over, an element Chromium pushed to
 * the next page to avoid splitting it can land one page early.
 */
async function captureFieldBoxes(page: Page): Promise<FieldBox[]> {
  return page.evaluate(
    ({ w, h }) => {
      const seen = new Map<string, { field: string; page: number; x: number; y: number; w: number; h: number }>();
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-gt-field]"))) {
        const field = el.dataset.gtField!;
        const r = el.getBoundingClientRect();
        const top = r.top + window.scrollY;
        const left = r.left + window.scrollX;
        if (r.width <= 0 || r.height <= 0) continue;
        const pageIndex = Math.floor(top / h);
        const box = {
          field,
          page: pageIndex + 1,
          x: Math.min(1, Math.max(0, left / w)),
          y: Math.min(1, Math.max(0, (top - pageIndex * h) / h)),
          w: Math.min(1, r.width / w),
          h: Math.min(1, r.height / h),
        };
        // A field printed twice (a total repeated in a summary) keeps the first.
        if (!seen.has(field)) seen.set(field, box);
      }
      return [...seen.values()];
    },
    { w: PRINT_CONTENT_WIDTH_PX, h: PRINT_CONTENT_HEIGHT_PX },
  );
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
