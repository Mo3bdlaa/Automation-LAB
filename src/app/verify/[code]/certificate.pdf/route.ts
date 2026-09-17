import { certificateByCode } from "@/lib/challenge/certificate";
import { renderCertificateHtml } from "@/lib/challenge/certificate-template";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";
// The serverless browser unpacks itself into /tmp on the first request an
// instance serves, which the ten-second default does not comfortably cover.
export const maxDuration = 30;

/**
 * The certificate as a PDF. Public, like the verification page: a certificate
 * that only its owner can produce is not much use when someone wants to check it.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const facts = await certificateByCode(decodeURIComponent(code).toUpperCase());
  if (!facts) return new Response("Not found", { status: 404 });
  const { renderHtmlToPdf } = await import("@/lib/documents/renderer");
  const { pdf } = await renderHtmlToPdf(renderCertificateHtml(facts, appOrigin(req)));
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="automation-lab-certificate-${facts.code}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
