import { renderHtmlToPdf, type RenderOptions } from "./renderer";

/**
 * Print a page to PDF for a request, and say what went wrong when it cannot.
 *
 * The two routes that print inside a request spent four deployments answering
 * 500 with an empty body. Every theory about why had to be tested by pushing a
 * change and looking at the site again, because nothing the deployment did
 * reached anybody: Next turns a thrown error into a bare 500, and the platform
 * log needs somebody with the dashboard open at the right moment.
 *
 * So a failure here answers with its own cause. That is a deliberate choice
 * about a public site: this one has no secrets to leak — the repository is
 * public, the data is generated, and the failure being described is "a browser
 * would not start". Weighed against another blind deployment cycle, saying so
 * plainly is worth more than the silence.
 */
export async function printPdf(
  html: string,
  filename: string,
  opts: RenderOptions & { cacheControl?: string } = {},
): Promise<Response> {
  const { cacheControl, ...render } = opts;
  try {
    const { pdf } = await renderHtmlToPdf(html, render);
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": cacheControl ?? "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[print] ${filename} could not be printed:`, e);
    return new Response(`This document could not be printed.\n\n${message}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
}
