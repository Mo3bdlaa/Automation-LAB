import { readFileSync } from "node:fs";
import path from "node:path";

/** Fonts are inlined as data URIs so the HTML is self-contained for Chromium. */
const cache = new Map<string, string>();

function fontDataUri(file: string): string {
  const hit = cache.get(file);
  if (hit) return hit;
  const p = path.join(process.cwd(), "templates", "fonts", file);
  const uri = `data:font/woff2;base64,${readFileSync(p).toString("base64")}`;
  cache.set(file, uri);
  return uri;
}

export function fontFaceCss(): string {
  return `
@font-face { font-family: "Noto Sans"; font-weight: 400; src: url(${fontDataUri("noto-sans-latin-400-normal.woff2")}) format("woff2"); }
@font-face { font-family: "Noto Sans"; font-weight: 700; src: url(${fontDataUri("noto-sans-latin-700-normal.woff2")}) format("woff2"); }
@font-face { font-family: "Noto Naskh Arabic"; font-weight: 400; src: url(${fontDataUri("noto-naskh-arabic-arabic-400-normal.woff2")}) format("woff2"); }
@font-face { font-family: "Noto Naskh Arabic"; font-weight: 700; src: url(${fontDataUri("noto-naskh-arabic-arabic-700-normal.woff2")}) format("woff2"); }
`;
}
