import { scenarioBySlug } from "@/lib/challenge/scenarios";
import { scenarioSddDocx } from "@/lib/challenge/documents";

export const dynamic = "force-dynamic";

/** The solution design template for one scenario, as a Word document. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const scenario = scenarioBySlug(slug);
  if (!scenario) return new Response("Not found", { status: 404 });
  const docx = await scenarioSddDocx(scenario);
  return new Response(docx as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Length": String(docx.byteLength),
      "Content-Disposition": `attachment; filename="automation-lab-sdd-${scenario.slug}.docx"`,
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
