/**
 * The certificate itself. Rendered through the same Chromium pipeline as every
 * other document in the lab, and deliberately sober: it states what was done,
 * when, and how it can be checked. It is not a UiPath credential and does not
 * pretend to be one - the wording says whose challenge it is.
 */
import { esc } from "../documents/templates/base";
import { fontFaceCss } from "../documents/fonts";
import type { CertificateFacts } from "./certificate";

export const CERTIFICATE_ISSUER = process.env.CERTIFICATE_ISSUER ?? "Automation Lab";
export const CERTIFICATE_ISSUER_NOTE = process.env.CERTIFICATE_ISSUER_NOTE ?? "Automation Lab is an independent practice environment. This certificate records a result in its challenge and is not a vendor certification.";

function duration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} seconds` : `${Math.floor(s / 60)} minutes ${s % 60} seconds`;
}

export function renderCertificateHtml(facts: CertificateFacts, origin: string): string {
  const issued = facts.issuedAt.toISOString().slice(0, 10);
  const verifyUrl = `${origin.replace(/\/$/, "")}/verify/${facts.code}`;
  const css = `
${fontFaceCss()}
@page { size: A4 landscape; margin: 0; }
html, body { margin: 0; padding: 0; }
.cert { position: relative; width: 297mm; height: 210mm; padding: 18mm 22mm; box-sizing: border-box; background: #fff; color: #16283e; font-family: "Noto Sans", Arial, sans-serif; }
.cert::before { content: ""; position: absolute; inset: 8mm; border: 1.5pt solid #1b4b8f; }
.cert::after { content: ""; position: absolute; inset: 9.5mm; border: 0.5pt solid #b9cbe3; }
.inner { position: relative; height: 100%; display: flex; flex-direction: column; }
.mark { font-size: 10pt; letter-spacing: 0.28em; text-transform: uppercase; color: #1b4b8f; }
.title { margin: 8mm 0 2mm; font-size: 30pt; font-weight: 300; letter-spacing: 0.02em; }
.lead { font-size: 11pt; color: #4a5b70; }
.name { margin: 6mm 0 2mm; font-size: 34pt; font-weight: 700; color: #16283e; }
.name-rule { width: 120mm; border-bottom: 1pt solid #b9cbe3; margin-bottom: 5mm; }
.scenario { font-size: 15pt; }
.scenario strong { color: #1b4b8f; }
.facts { margin-top: auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6mm; font-size: 9.5pt; }
.facts dt { color: #6b7a8d; text-transform: uppercase; letter-spacing: 0.1em; font-size: 7.5pt; }
.facts dd { margin: 1mm 0 0; font-size: 12pt; font-weight: 600; }
.score { color: #1b4b8f; }
.foot { margin-top: 6mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; font-size: 8pt; color: #6b7a8d; }
.verify { font-family: "Noto Sans", monospace; font-size: 9.5pt; color: #16283e; }
.code { letter-spacing: 0.18em; font-weight: 700; font-size: 13pt; }
.seal { width: 30mm; height: 30mm; border: 1.5pt solid #1b4b8f; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #1b4b8f; font-size: 7pt; line-height: 1.3; transform: rotate(-8deg); }
.seal b { font-size: 11pt; display: block; }
`;
  const body = `
<div class="cert">
  <div class="inner">
    <div class="mark">${esc(CERTIFICATE_ISSUER)}</div>
    <div class="title">Certificate of completion</div>
    <div class="lead">This certifies that</div>
    <div class="name">${esc(facts.name)}</div>
    <div class="name-rule"></div>
    <div class="scenario">completed the <strong>${esc(facts.scenarioTitle)}</strong> challenge, scoring <strong>${facts.score.toFixed(1)} out of 100</strong> against a pass mark of ${facts.passMark}.</div>
    <dl class="facts">
      <div><dt>Score</dt><dd class="score">${facts.score.toFixed(1)} / 100</dd></div>
      <div><dt>Items processed</dt><dd>${facts.itemsProcessed} of ${facts.itemsInScope}</dd></div>
      <div><dt>Document level</dt><dd>${facts.level}${facts.level > 1 ? " (scanned)" : " (native PDF)"}</dd></div>
      <div><dt>Completed in</dt><dd>${esc(duration(facts.durationMs))}</dd></div>
    </dl>
    <div class="foot">
      <div>
        <div class="verify">Verify at ${esc(verifyUrl)}</div>
        <div class="verify code">${esc(facts.code)}</div>
        <div style="margin-top:2mm;max-width:150mm">${esc(CERTIFICATE_ISSUER_NOTE)}</div>
      </div>
      <div class="seal"><b>${facts.score.toFixed(0)}</b>${esc(issued)}<br>ref ${esc(facts.reference)}</div>
    </div>
  </div>
</div>`;
  // Not baseDocument: every generated business document in the lab carries a
  // SPECIMEN watermark because it is fictitious. A certificate is the one
  // artefact here that is about a real person and a real result.
  return `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Certificate ${esc(facts.code)}</title>
<style>${css}</style></head>
<body>${body}</body>
</html>`;
}
