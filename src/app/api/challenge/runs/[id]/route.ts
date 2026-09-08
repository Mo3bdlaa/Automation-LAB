import { z } from "zod";
import { apiSession } from "@/lib/auth/server";
import { badRequest, notFound, ok, readJson } from "@/lib/api/http";
import { runById } from "@/lib/challenge/runs";
import { serialiseRun } from "@/lib/challenge/serialise";
import { scenarioBySlug } from "@/lib/challenge/scenarios";
import { publishRun } from "@/lib/challenge/publish";

/** One run: what is in scope, how far it has got, and its result once closed. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const run = await runById(s, id);
  if (!run) return notFound("Run");
  const scenario = scenarioBySlug(run.scenario);
  return ok({ run: serialiseRun(run), scenario: scenario ? { slug: scenario.slug, title: scenario.title, targetSize: scenario.targetSize, passMark: scenario.passMark } : null });
}

const Patch = z.object({ publish: z.boolean() });

/** Opt a finished run in or out of the public leaderboard. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const run = await runById(s, id);
  if (!run) return notFound("Run");
  const parsed = await readJson(req, Patch);
  if ("response" in parsed) return parsed.response;
  if (run.status !== "completed") return badRequest("Only a completed run can be published.");
  const updated = await publishRun(s, run, parsed.data.publish);
  return ok({ run: serialiseRun(updated) });
}
