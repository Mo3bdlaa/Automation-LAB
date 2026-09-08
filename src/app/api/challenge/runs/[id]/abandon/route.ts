import { apiSession } from "@/lib/auth/server";
import { conflict, notFound, ok } from "@/lib/api/http";
import { abandonRun, runById } from "@/lib/challenge/runs";
import { serialiseRun } from "@/lib/challenge/serialise";

/** Gives up on a run without scoring it, so another can be started. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const run = await runById(s, id);
  if (!run) return notFound("Run");
  if (run.status !== "running") return conflict(`This run is already ${run.status}.`);
  return ok({ run: serialiseRun(await abandonRun(s, run)) });
}
