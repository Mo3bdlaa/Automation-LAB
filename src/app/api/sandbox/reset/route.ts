import { apiSession } from "@/lib/auth/server";
import { ok } from "@/lib/api/http";
import { requestReset } from "@/lib/sandbox/lifecycle";

/**
 * Wipes the sandbox back to its starting state and regenerates it from the same
 * seed. A scored run needs a full queue, so this is what a performer calls when
 * a run refuses to start.
 */
export async function POST() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  await requestReset(s.tenant.id);
  return ok({ status: "provisioning", statusUrl: "/api/sandbox", message: "Reset queued. Poll /api/sandbox until status is ready." }, { status: 202 });
}
