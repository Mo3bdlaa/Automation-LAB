import { fontFaceCss } from "../fonts";

export const SPECIMEN_TEXT = "SPECIMEN — TRAINING ONLY";
export const SPECIMEN_TEXT_AR = "نموذج — للتدريب فقط";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Shared page chrome: fonts, the specimen footer, print sizing. Every document
 * template wraps its body in this.
 *
 * There used to be a large diagonal SPECIMEN watermark across the page as well.
 * It is gone: it sat on top of the very fields the exercise is about reading,
 * so it cost extraction accuracy on exactly the documents a participant is
 * graded on, and no invoice a bot will ever meet in production carries one.
 * The footer line stays, in both scripts, so a printed page still says what it
 * is (docs/spec.md, Safety); it sits in the bottom margin, clear of the body.
 */
export function baseDocument(opts: { title: string; body: string; extraCss?: string; lang?: "en" | "ar"; dir?: "ltr" | "rtl" }): string {
  return `<!doctype html>
<html lang="${opts.lang ?? "en"}" dir="${opts.dir ?? "ltr"}">
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
/* The secondary script on a document that leads with the other one. */
.alt { font-family: "Noto Sans", Arial, sans-serif; font-size: 0.82em; color: #555; font-weight: 400; direction: ltr; unicode-bidi: isolate; }
.alt.block, .ar.block { display: block; }
.hijri { font-size: 0.85em; color: #555; white-space: nowrap; }
/* Latin text and numbers inside an Arabic paragraph: isolate them so a
   trailing full stop or a hyphenated code does not jump to the wrong end. */
.ltr { direction: ltr; unicode-bidi: isolate; }
.nowrap { white-space: nowrap; }
[dir="rtl"] .num { text-align: left; }
[dir="rtl"] table.lines th, [dir="rtl"] table.lines td { text-align: right; }
.content { position: relative; }
.specimen-footer {
  position: fixed; bottom: 0; left: 0; right: 0; font-size: 7.5pt; color: #8a1c1c;
  text-align: center; letter-spacing: 0.08em;
}
${opts.extraCss ?? ""}
</style>
</head>
<body>
<div class="specimen-footer">${esc(SPECIMEN_TEXT)} · ${esc(SPECIMEN_TEXT_AR)} · Automation Lab · fictitious data</div>
<div class="content">
${opts.body}
</div>
</body>
</html>`;
}
