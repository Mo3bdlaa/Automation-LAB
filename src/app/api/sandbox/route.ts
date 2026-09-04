import { apiSession } from "@/lib/auth/server";
import { sandboxProgress } from "@/lib/sandbox/lifecycle";

/** Bot-friendly sandbox status: poll until `status === "ready"` and `rendered === documents`. */
export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const p = await sandboxProgress(s.tenant);
  return Response.json(
    {
      tenantId: s.tenant.id,
      userId: s.principal.userId,
      status: s.tenant.status,
      progress: s.tenant.progress,
      statusMessage: s.tenant.statusMessage,
      seed: s.tenant.seed,
      resetCount: s.tenant.resetCount,
      documents: p.documents,
      rendered: p.rendered,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
