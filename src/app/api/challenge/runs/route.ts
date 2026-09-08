import { z } from "zod";
import { apiSession } from "@/lib/auth/server";
import { badRequest, conflict, created, ok, problem } from "@/lib/api/http";
import { scenarioBySlug } from "@/lib/challenge/scenarios";
import { runsFor, startRun } from "@/lib/challenge/runs";
import { serialiseRun } from "@/lib/challenge/serialise";

const Body = z.object({
  scenario: z.string().min(1),
  mode: z.enum(["practice", "scored"]).default("practice"),
  level: z.number().int().min(1).max(5).optional(),
});

/** Your runs, newest first. */
export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const runs = await runsFor(s, 50);
  return ok({ runs: runs.map(serialiseRun) });
}

/**
 * Opens a run. This is the moment the clock starts, so a performer should do it
 * after it is ready to work and not before.
 */
export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await import("@/lib/api/http").then((m) => m.readJson(req, Body));
  if ("response" in parsed) return parsed.response;
  const scenario = scenarioBySlug(parsed.data.scenario);
  if (!scenario) return badRequest(`Unknown scenario. Ask GET /api/scenarios for the list.`);
  const result = await startRun(s, scenario, { mode: parsed.data.mode, level: parsed.data.level });
  if (!result.ok) {
    if (result.code === "already_running") return conflict(result.message, { run: serialiseRun(result.run) });
    if (result.code === "queue_short") return conflict(result.message, { available: result.available, required: result.required, resetUrl: "/api/sandbox/reset" });
    return problem(400, "bad_level", result.message);
  }
  return created({ run: serialiseRun(result.run), scenario: { slug: scenario.slug, title: scenario.title, targetSize: scenario.targetSize } }, `/api/challenge/runs/${result.run.id}`);
}
