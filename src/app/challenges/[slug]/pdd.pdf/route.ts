import { scenarioBySlug } from "@/lib/challenge/scenarios";
import { scenarioPddHtml } from "@/lib/challenge/documents";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/** The process definition document for one scenario, as a PDF. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const scenario = scenarioBySlug(slug);
  if (!scenario) return new Response("Not found", { status: 404 });
  const { renderHtmlToPdf } = await import("@/lib/documents/renderer");
  const { pdf } = await renderHtmlToPdf(scenarioPddHtml(scenario, appOrigin(req)), {
    headerTemplate: `<div style="font-size:7pt;color:#6b7a8d;width:100%;padding:0 16mm">Automation Lab · ${scenario.title}</div>`,
    footerTemplate: '<div style="font-size:7pt;color:#6b7a8d;width:100%;padding:0 16mm;text-align:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
  });
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="automation-lab-pdd-${scenario.slug}.pdf"`,
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
