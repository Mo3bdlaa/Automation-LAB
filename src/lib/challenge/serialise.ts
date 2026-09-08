/** The shape a run takes over the API and in the UI. */
import type { ChallengeRun } from "@/db/schema";
import { scenarioBySlug } from "./scenarios";

export function serialiseRun(run: ChallengeRun) {
  const scenario = scenarioBySlug(run.scenario);
  return {
    id: run.id,
    scenario: run.scenario,
    scenarioTitle: scenario?.title ?? run.scenario,
    mode: run.mode,
    status: run.status,
    channel: run.channel,
    level: run.level,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    targets: run.targets,
    processedCount: run.processedCount,
    score: run.score === null ? null : Number(run.score),
    breakdown: run.breakdown,
    publish: run.publish,
    certificate: run.certificateCode ? { code: run.certificateCode, url: `/verify/${run.certificateCode}`, issuedAt: run.certificateIssuedAt?.toISOString() ?? null } : null,
    closeUrl: run.status === "running" ? `/api/challenge/runs/${run.id}/close` : null,
  };
}
