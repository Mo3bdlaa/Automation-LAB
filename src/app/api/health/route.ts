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
 *
 * `jobs` is the next best thing to those logs, and is here because a deployed
 * lab is often a place whose logs nobody can read: it counts what the queue is
 * holding and carries the last failure's message. A participant reporting "the
 * PDF never arrives" is then one request away from the difference between a
 * render that is still queued, a render that failed, and a render that was
 * never asked for. Counts and one error string only — no tenant, no document,
 * nothing about a person.
 */
export async function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  try {
    await db.execute(sql`select 1`);
    const rows = await db.execute<{ status: string; kind: string; n: number }>(
      sql`select status, kind, count(*)::int as n from jobs where status in ('queued', 'running', 'failed') group by 1, 2`,
    );
    const counts = (rows.rows ?? rows) as unknown as { status: string; kind: string; n: number }[];
    const jobs: Record<string, number> = {};
    for (const r of counts) jobs[`${r.status}_${r.kind}`] = Number(r.n);
    const [failure] = ((await db.execute<{ error: string; kind: string }>(
      sql`select kind, error from jobs where status = 'failed' order by finished_at desc nulls last limit 1`,
    )) as unknown as { rows?: { kind: string; error: string }[] }).rows ?? [];
    return Response.json(
      { ok: true, app: "automation-lab", db: "ok", build, jobs, lastJobError: failure ? `${failure.kind}: ${(failure.error ?? "").split("\n")[0].slice(0, 200)}` : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json({ ok: false, build, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
