/**
 * Prove the two routes that print a PDF on demand can do it with nothing but
 * the serverless browser.
 *
 * Every other PDF in this lab is rendered ahead of time, which is what lets the
 * deployed app run without Chromium. Two are not: a scenario's process document
 * and a certificate. Those render inside the request, so on Vercel they need
 * @sparticuz/chromium — a browser carried as a package and unpacked into /tmp.
 *
 * That arrangement failed silently twice in production while passing every test
 * here, because the tests ran on a machine that had a real browser sitting on
 * the lookup path. So this script takes the browser away: it clears the
 * variables that point at a local install and asserts the pages still print.
 * If it passes, the code path production uses is the code path that was proved.
 *
 *   pnpm pdf:proof
 */
delete process.env.CHROMIUM_EXECUTABLE_PATH;
delete process.env.PLAYWRIGHT_BROWSERS_PATH;

import { SCENARIOS } from "../src/lib/challenge/scenarios";
import { scenarioPddHtml } from "../src/lib/challenge/documents";
import { renderCertificateHtml } from "../src/lib/challenge/certificate-template";
import type { CertificateFacts } from "../src/lib/challenge/certificate";

const ORIGIN = "https://automationlab.example.com";

/** Enough of a certificate to lay one out, with a name that needs shaping. */
const SPECIMEN: CertificateFacts = {
  code: "AL-PROOF-0001",
  name: "محمد شاكر",
  scenarioSlug: "invoice-processing",
  scenarioTitle: "Invoice processing",
  score: 92.5,
  passMark: 70,
  level: 3,
  channel: "api",
  durationMs: 414_000,
  issuedAt: new Date("2026-01-01T09:00:00Z"),
  itemsProcessed: 12,
  itemsInScope: 12,
  reference: "9f3c1a2b",
  datasetVersion: 1,
};

async function main() {
  const { resolveChromiumExecutable, renderHtmlToPdf, closeRenderer } = await import("../src/lib/documents/renderer");

  const { executablePath } = await resolveChromiumExecutable();
  console.log(`browser: ${executablePath}`);

  const failures: string[] = [];
  const check = (what: string, pdf: Uint8Array) => {
    const header = Buffer.from(pdf.slice(0, 5)).toString("latin1");
    const ok = header === "%PDF-" && pdf.byteLength > 1024;
    console.log(`  ${ok ? " " : "!"} ${what.padEnd(34)} ${(pdf.byteLength / 1024).toFixed(0)} kB`);
    if (!ok) failures.push(what);
  };

  for (const scenario of SCENARIOS) {
    const { pdf } = await renderHtmlToPdf(scenarioPddHtml(scenario, ORIGIN));
    check(`pdd · ${scenario.slug}`, pdf);
  }
  const { pdf } = await renderHtmlToPdf(renderCertificateHtml(SPECIMEN, ORIGIN));
  check("certificate", pdf);

  await closeRenderer();
  console.log(failures.length ? `\n${failures.length} did not print: ${failures.join(", ")}` : "\nBoth on-demand PDFs print with the serverless browser alone.");
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
