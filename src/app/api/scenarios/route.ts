import { apiSession } from "@/lib/auth/server";
import { ok } from "@/lib/api/http";
import { PARAMETERS, PARAMETER_MEANINGS, SCENARIOS } from "@/lib/challenge/scenarios";
import { defaultLevel } from "@/lib/lab-settings";

/** The challenge catalogue: what can be attempted and how it is judged. */
export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const level = await defaultLevel();
  return ok({
    level,
    judging: PARAMETERS.map((key) => ({ key, meaning: PARAMETER_MEANINGS[key] })),
    scenarios: SCENARIOS.map((sc) => ({
      slug: sc.slug,
      version: sc.version,
      title: sc.title,
      tagline: sc.tagline,
      brief: sc.brief,
      difficulty: sc.difficulty,
      queue: sc.queue,
      targetSize: sc.targetSize,
      documentUnderstanding: sc.documentUnderstanding,
      parSecondsPerItem: sc.parSecondsPerItem,
      weights: sc.weights,
      rules: sc.rules,
      passMark: sc.passMark,
      steps: sc.steps,
      startUrl: "/api/challenge/runs",
    })),
  });
}
