import { fontFaceCss } from "../fonts";

export const SPECIMEN_TEXT = "SPECIMEN — TRAINING ONLY";
export const SPECIMEN_TEXT_AR = "نموذج — للتدريب فقط";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Shared page chrome: fonts, watermark, print sizing. Every document template
 * wraps its body in this. The watermark is non-negotiable (docs/spec.md, Safety).
 */
export function baseDocument(opts: { title: string; body: string; extraCss?: string; lang?: "en" | "ar" }): string {
  return `<!doctype html>
<html lang="${opts.lang ?? "en"}">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>${esc(opts.title)}</title>
<style>
${fontFaceCss()}
@page { size: A4; margin: 14mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Noto Sans", "Noto Naskh Arabic", Arial, sans-serif;
  font-size: 10.5pt; color: #111; line-height: 1.35;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.ar, [lang="ar"], [dir="rtl"] { font-family: "Noto Naskh Arabic", "Noto Sans", sans-serif; }
.watermark {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
.watermark span {
  transform: rotate(-32deg);
  font-size: 34pt; font-weight: 700; letter-spacing: 0.12em;
  color: rgba(180, 30, 30, 0.13); border: 3px solid rgba(180, 30, 30, 0.13);
  padding: 8pt 20pt; white-space: nowrap; text-align: center; line-height: 1.2;
}
.watermark small { display: block; font-size: 16pt; letter-spacing: 0.05em; font-family: "Noto Naskh Arabic"; }
.content { position: relative; z-index: 1; }
.specimen-footer {
  position: fixed; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: #8a1c1c;
  text-align: center; letter-spacing: 0.08em;
}
${opts.extraCss ?? ""}
</style>
</head>
<body>
<div class="watermark" aria-hidden="true"><span>${esc(SPECIMEN_TEXT)}<small>${esc(SPECIMEN_TEXT_AR)}</small></span></div>
<div class="specimen-footer">${esc(SPECIMEN_TEXT)} · ${esc(SPECIMEN_TEXT_AR)} · Automation Lab · fictitious data</div>
<div class="content">
${opts.body}
</div>
</body>
</html>`;
}
