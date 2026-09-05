import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/lib/jobs/runner";

export const maxDuration = 300;

/**
 * Processes queued jobs for up to ~4.5 minutes. Called by Vercel Cron
 * (vercel.json) and usable manually. Protected by JOBS_SECRET when set;
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.JOBS_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.replace(/^Bearer\s+/i, "");
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const report = await runJobs({ maxJobs: 200, timeBudgetMs: 270_000, log: (m) => console.log(`[jobs:cron] ${m}`) });
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
