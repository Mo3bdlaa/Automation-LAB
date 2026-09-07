/**
 * Levels 2 to 5: the scanned and photographed variants of a level-1 PDF.
 *
 * Everything happens inside the Chromium we already run for rendering. The
 * level-1 PDF is rasterised with pdf.js in the page, the resulting canvas is
 * degraded with SVG filters and CSS transforms, each page is screenshotted as
 * JPEG, and the JPEGs are printed back into a PDF. Doing it in the browser
 * keeps one rendering engine for the whole lab: no native image library to
 * install, and the filters are seeded, so a level is reproducible.
 *
 * The output carries no text layer, which is the point - a bot that read level
 * 1 with a PDF text extractor has to switch to OCR from level 2 up.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Page } from "playwright-core";
import { sharedBrowser, type FieldBox } from "./renderer";
import { degradeParams, type DegradeParams } from "./degrade-params";
import type { Level } from "./levels";

export interface DegradeResult {
  pdf: Uint8Array;
  pages: number;
  /** The input boxes carried through the degradation geometry. */
  boxes: FieldBox[];
}

/**
 * pdf.js ships ESM only, and we hand its source to the browser rather than
 * importing it here, so it has to be found on disk. The legacy build is the one
 * transpiled for older Chromium versions, which is what a serverless host may
 * give us. `next.config.ts` traces both files into the standalone output.
 */
function pdfjsFile(name: string): string {
  const candidates = [
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", name),
    path.join(process.cwd(), ".next", "standalone", "node_modules", "pdfjs-dist", "legacy", "build", name),
  ];
  try {
    candidates.unshift(createRequire(__filename).resolve(`pdfjs-dist/legacy/build/${name}`));
  } catch {
    /* not resolvable from here; fall back to the paths above */
  }
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`pdfjs-dist not found (looked in ${candidates.join(", ")})`);
  return found;
}

let sources: Promise<{ lib: string; worker: string }> | null = null;
function pdfjsSources() {
  if (!sources) {
    sources = (async () => ({
      lib: await readFile(pdfjsFile("pdf.min.mjs"), "utf8"),
      worker: await readFile(pdfjsFile("pdf.worker.min.mjs"), "utf8"),
    }))();
  }
  return sources;
}

/**
 * One page holds the loaded pdf.js, reused across documents so its three
 * megabytes cross the wire once per process. It is recycled periodically
 * because a long-lived page accumulates canvases the GC is slow to reclaim.
 */
const RECYCLE_AFTER = 25;
let worker: { page: Page; used: number } | null = null;

async function workerPage(): Promise<Page> {
  if (worker && worker.used >= RECYCLE_AFTER) {
    await worker.page.context().close().catch(() => {});
    worker = null;
  }
  if (worker && !worker.page.isClosed()) {
    worker.used += 1;
    return worker.page;
  }
  const b = await sharedBrowser();
  const context = await b.newContext();
  const page = await context.newPage();
  await page.setContent("<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>");
  // Some TypeScript loaders keep function names by emitting a `__name` helper
  // into the source they hand us; the serialised page function would reference
  // a helper the browser never received. Defining it is cheaper than banning
  // named inner functions in the page code.
  await page.evaluate("globalThis.__name = globalThis.__name || ((fn) => fn)");
  const { lib, worker: workerSrc } = await pdfjsSources();
  await page.evaluate(async ({ lib, workerSrc }) => {
    const w = window as unknown as { __pdfjs?: unknown };
    const url = URL.createObjectURL(new Blob([lib], { type: "text/javascript" }));
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as { GlobalWorkerOptions: { workerSrc: string } };
    mod.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
    w.__pdfjs = mod;
  }, { lib, workerSrc });
  worker = { page, used: 1 };
  return page;
}

export async function closeDegrader(): Promise<void> {
  if (!worker) return;
  const w = worker;
  worker = null;
  // pdf.js keeps a web worker alive in the page; closing its context can block
  // on it. Closing the browser (closeRenderer) always finishes the job, so this
  // is best-effort rather than something to wait on.
  await Promise.race([w.page.context().close().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}

/**
 * The degraded pages as JPEGs, before they are wrapped in a PDF. Exposed
 * separately because it is the reproducible part: identical input gives
 * byte-identical images, while the PDF around them carries a creation date.
 */
export async function degradePageImages(
  documentId: string,
  level: Level,
  pdf: Uint8Array,
  boxes: FieldBox[] = [],
): Promise<{ images: Buffer[]; boxes: FieldBox[] }> {
  const params = degradeParams(documentId, level);
  const page = await workerPage();
  const built = await page.evaluate(buildPages, { pdfBase64: Buffer.from(pdf).toString("base64"), params, boxes });
  const images: Buffer[] = [];
  for (let i = 1; i <= built.pages; i++) {
    images.push(await page.locator(`#photo-${i}`).screenshot({ type: "jpeg", quality: params.jpegQuality }));
  }
  await page.evaluate(() => {
    document.body.innerHTML = "";
  });
  return { images, boxes: built.boxes };
}

/**
 * Rasterises a PDF's pages to PNG at the given resolution, with the same pdf.js
 * the degradation uses. Handy for anything that needs pixels rather than a PDF:
 * the OCR acceptance test and the documentation figures.
 */
export async function rasterisePages(pdf: Uint8Array, dpi = 150): Promise<Buffer[]> {
  const page = await workerPage();
  const count = await page.evaluate(rasteriseInPage, { pdfBase64: Buffer.from(pdf).toString("base64"), dpi });
  const out: Buffer[] = [];
  for (let i = 1; i <= count; i++) out.push(await page.locator(`#raster-${i}`).screenshot({ type: "png" }));
  await page.evaluate(() => {
    document.body.innerHTML = "";
  });
  return out;
}

function rasteriseInPage({ pdfBase64, dpi }: { pdfBase64: string; dpi: number }) {
  const lib = (window as unknown as { __pdfjs: { getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<void> } }> }> } } }).__pdfjs;
  return (async () => {
    document.body.innerHTML = "";
    document.body.style.margin = "0";
    const doc = await lib.getDocument({ data: Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0)) }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement("canvas");
      canvas.id = `raster-${i}`;
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      document.body.appendChild(canvas);
      await pg.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    }
    return doc.numPages;
  })();
}

/** Degrades one rendered PDF to the given level. Deterministic per (id, level). */
export async function degradePdf(documentId: string, level: Level, pdf: Uint8Array, boxes: FieldBox[] = []): Promise<DegradeResult> {
  const { images, boxes: out } = await degradePageImages(documentId, level, pdf, boxes);
  return { pdf: await imagesToPdf(images.map((b) => b.toString("base64"))), pages: images.length, boxes: out };
}

/** Wraps the degraded page images back into an A4 PDF, one image per page. */
async function imagesToPdf(images: string[]): Promise<Uint8Array> {
  const b = await sharedBrowser();
  const context = await b.newContext();
  try {
    const p = await context.newPage();
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: 210mm; height: 297mm; object-fit: cover; break-after: page; }
img:last-child { break-after: auto; }
</style></head><body>${images.map((d) => `<img src="data:image/jpeg;base64,${d}">`).join("")}</body></html>`;
    await p.setContent(html, { waitUntil: "load" });
    const pdf = await p.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return new Uint8Array(pdf);
  } finally {
    await context.close();
  }
}

/**
 * Runs inside the page: rasterise every PDF page, build the degraded sheet, and
 * report where the field boxes ended up. Written as one self-contained function
 * because it is serialised to the browser - it may not close over anything.
 */
function buildPages({ pdfBase64, params, boxes }: { pdfBase64: string; params: DegradeParams; boxes: FieldBox[] }) {
  const doc = document;
  const lib = (window as unknown as { __pdfjs: { getDocument: (o: unknown) => { promise: Promise<PdfDoc> } } }).__pdfjs;

  interface PdfViewport { width: number; height: number }
  interface PdfPage { getViewport: (o: { scale: number }) => PdfViewport; render: (o: unknown) => { promise: Promise<void> } }
  interface PdfDoc { numPages: number; getPage: (n: number) => Promise<PdfPage> }

  const css = (p: DegradeParams) => {
    const f: string[] = [];
    if (p.blur > 0) f.push(`blur(${p.blur}px)`);
    if (p.brightness !== 1) f.push(`brightness(${p.brightness})`);
    if (p.contrast !== 1) f.push(`contrast(${p.contrast})`);
    if (p.saturate !== 1) f.push(`saturate(${p.saturate})`);
    if (p.sepia > 0) f.push(`sepia(${p.sepia})`);
    return f.join(" ");
  };

  const noiseUrl = (p: DegradeParams) =>
    `url("data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${p.noise.frequency}" numOctaves="3" seed="${p.noise.seed}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="240" height="240" filter="url(%23n)"/></svg>`,
    )}")`;

  const stampSvg = (s: DegradeParams["stamps"][number], w: number) => {
    const size = Math.round(w * 0.22 * s.scale);
    const shape = s.round
      ? `<circle cx="110" cy="110" r="98" fill="none" stroke="${s.ink}" stroke-width="7"/><circle cx="110" cy="110" r="86" fill="none" stroke="${s.ink}" stroke-width="2"/>`
      : `<rect x="8" y="42" width="204" height="136" rx="10" fill="none" stroke="${s.ink}" stroke-width="7"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="${size}" height="${size}">${shape}<text x="110" y="104" text-anchor="middle" font-family="Noto Sans, Arial" font-size="34" font-weight="700" fill="${s.ink}" letter-spacing="2">${s.text}</text><text x="110" y="146" text-anchor="middle" font-family="Noto Naskh Arabic, Noto Sans" font-size="30" fill="${s.ink}">${s.textAr}</text></svg>`;
  };

  return (async () => {
    doc.body.innerHTML = "";
    doc.body.style.margin = "0";
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const pdf = await lib.getDocument({ data: bytes }).promise;
    const out: FieldBox[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: params.dpi / 72 });
      const W = Math.round(vp.width);
      const H = Math.round(vp.height);

      const photo = doc.createElement("div");
      photo.id = `photo-${i}`;
      photo.style.cssText = `position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${params.background};filter:${css(params)};`;

      const stage = doc.createElement("div");
      stage.style.cssText = params.perspective
        ? `position:absolute;inset:0;perspective:${params.perspective.depth}px;`
        : "position:absolute;inset:0;";

      const sheet = doc.createElement("div");
      const t: string[] = [];
      if (params.perspective) {
        t.push(`rotateX(${params.perspective.rotX}deg)`, `rotateY(${params.perspective.rotY}deg)`);
      }
      t.push(`rotate(${params.rotate}deg)`);
      if (params.perspective) t.push(`scale(${params.perspective.scale})`);
      sheet.style.cssText = `position:absolute;inset:0;background:${params.paper};transform:${t.join(" ")};transform-origin:50% 50%;box-shadow:0 ${Math.round(H * 0.006)}px ${Math.round(H * 0.02)}px rgba(0,0,0,0.25);`;

      const canvas = doc.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
      sheet.appendChild(canvas);

      // Fold lines and staple marks sit on the paper, so they travel with it.
      for (const at of params.folds) {
        const fold = doc.createElement("div");
        fold.style.cssText = `position:absolute;left:0;right:0;top:${(at * 100).toFixed(3)}%;height:${Math.max(2, Math.round(H * 0.004))}px;background:linear-gradient(to bottom, rgba(0,0,0,0.16), rgba(255,255,255,0.5));opacity:0.75;`;
        sheet.appendChild(fold);
      }
      if (params.staples) {
        for (const dy of [0, 1]) {
          const st = doc.createElement("div");
          const s = Math.round(W * 0.012);
          st.style.cssText = `position:absolute;left:${(0.045 * 100).toFixed(2)}%;top:${(0.035 + dy * 0.012) * 100}%;width:${s * 2}px;height:${Math.max(2, Math.round(s * 0.35))}px;background:#5a5a5a;transform:rotate(${dy ? -8 : 6}deg);opacity:0.8;`;
          sheet.appendChild(st);
        }
      }
      for (const s of params.stamps) {
        const el = doc.createElement("div");
        el.style.cssText = `position:absolute;left:${s.x * 100}%;top:${s.y * 100}%;transform:rotate(${s.rotate}deg);opacity:0.62;mix-blend-mode:multiply;`;
        el.innerHTML = stampSvg(s, W);
        sheet.appendChild(el);
      }
      for (const hw of params.handwriting) {
        const el = doc.createElement("div");
        el.style.cssText = `position:absolute;left:${hw.x * 100}%;top:${hw.y * 100}%;transform:rotate(${hw.rotate}deg);color:${hw.ink};opacity:0.85;`;
        if (hw.squiggle) {
          const w = Math.round(W * 0.16);
          el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 44" width="${w}" height="${Math.round(w * 0.49)}"><path d="${hw.squiggle}" fill="none" stroke="${hw.ink}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
        } else {
          el.style.cssText += `font-family:"Noto Naskh Arabic","Noto Sans",cursive;font-size:${(hw.size / 100) * H}px;font-style:italic;white-space:nowrap;`;
          el.textContent = hw.text;
        }
        sheet.appendChild(el);
      }

      // Markers measure where a level-1 box lands once the sheet is transformed.
      const markers: { field: string; el: HTMLElement }[] = [];
      for (const b of boxes) {
        if (b.page !== i) continue;
        const m = doc.createElement("div");
        m.style.cssText = `position:absolute;left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%;`;
        sheet.appendChild(m);
        markers.push({ field: b.field, el: m });
      }

      stage.appendChild(sheet);
      photo.appendChild(stage);

      if (params.lighting.strength > 0) {
        const light = doc.createElement("div");
        light.style.cssText = `position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;background:linear-gradient(${params.lighting.angle}deg, rgba(0,0,0,${params.lighting.strength}) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,${(params.lighting.strength * 0.6).toFixed(3)}) 100%);`;
        photo.appendChild(light);
      }
      if (params.noise.opacity > 0) {
        const n = doc.createElement("div");
        n.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:${params.noise.opacity};mix-blend-mode:overlay;background-image:${noiseUrl(params)};background-size:${Math.round(W / 3)}px ${Math.round(W / 3)}px;`;
        photo.appendChild(n);
      }
      if (params.vignette > 0) {
        const v = doc.createElement("div");
        v.style.cssText = `position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${params.vignette}) 100%);`;
        photo.appendChild(v);
      }

      doc.body.appendChild(photo);
      await pg.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: vp }).promise;

      const pr = photo.getBoundingClientRect();
      for (const m of markers) {
        const r = m.el.getBoundingClientRect();
        out.push({
          field: m.field,
          page: i,
          x: Math.min(1, Math.max(0, (r.left - pr.left) / pr.width)),
          y: Math.min(1, Math.max(0, (r.top - pr.top) / pr.height)),
          w: Math.min(1, r.width / pr.width),
          h: Math.min(1, r.height / pr.height),
        });
      }
    }
    return { pages: pdf.numPages, boxes: out };
  })();
}
