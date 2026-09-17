import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * Whether the deployment is alive, and enough about it to tell one deployment
 * from another.
 *
 * `build` is why: a fix was pushed four times while the live site kept serving
 * an older bundle, and there was no way to tell from outside which one was
 * answering. Vercel sets the commit in the environment at build time; seven
 * characters of it turn "is my fix deployed?" from a guess into a check.
 * Nothing here is a secret — the repository is public.
 *
 * Deliberately not reported here: whether a browser can be found. Asking would
 * mean importing the renderer, and tracing would then follow it and copy the
 * serverless browser package into this function — 67 MB on the one route that
 * ought to answer instantly. The two routes that print a PDF say why they could
 * not, in their own logs, and `pnpm pdf:proof` checks it before a deploy.
 */
export async function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, app: "automation-lab", db: "ok", build }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, build, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
