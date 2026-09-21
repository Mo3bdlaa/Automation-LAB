/**
 * Rasterise a PDF so its pages can be looked at.
 *
 * A generated document is checked by reading it, not by trusting that the
 * generator ran. This environment has no PDF viewer and no poppler, but the
 * lab already rasterises PDFs in Chromium for the difficulty ladder, so the
 * same code serves here.
 *
 *   pnpm pdf:pages .data/Invoice-Processing-PDD.pdf out/
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { closeDegrader, rasterisePages } from "../src/lib/documents/degrade";
import { closeRenderer } from "../src/lib/documents/renderer";

async function main() {
  const [pdf, out = "/var/tmp/pdf-pages", dpi = "110"] = process.argv.slice(2);
  if (!pdf) throw new Error("usage: pnpm pdf:pages <file.pdf> [outDir] [dpi]");
  mkdirSync(out, { recursive: true });
  const pages = await rasterisePages(new Uint8Array(readFileSync(pdf)), Number(dpi));
  pages.forEach((p, i) => writeFileSync(`${out}/p${String(i + 1).padStart(2, "0")}.png`, p));
  console.log(`${pages.length} pages → ${out}`);
  await closeDegrader();
  await closeRenderer();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
