import { scenarioBySlug } from "@/lib/challenge/scenarios";
import { scenarioPddHtml } from "@/lib/challenge/documents";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";
// The serverless browser unpacks itself into /tmp on the first request an
// instance serves, which the ten-second default does not comfortably cover.
export const maxDuration = 30;

/** The process definition document for one scenario, as a PDF. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const scenario = scenarioBySlug(slug);
  if (!scenario) return new Response("Not found", { status: 404 });
  const { printPdf } = await import("@/lib/documents/print-route");
  return printPdf(scenarioPddHtml(scenario, appOrigin(req)), `automation-lab-pdd-${scenario.slug}.pdf`, {
    headerTemplate: `<div style="font-size:7pt;color:#6b7a8d;width:100%;padding:0 16mm">Automation Lab · ${scenario.title}</div>`,
    footerTemplate: '<div style="font-size:7pt;color:#6b7a8d;width:100%;padding:0 16mm;text-align:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
    cacheControl: "public, max-age=300",
  });
}
