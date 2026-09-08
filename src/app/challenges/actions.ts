"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLab } from "@/lib/auth/server";
import { scenarioBySlug } from "@/lib/challenge/scenarios";
import { abandonRun, activeRun, runById, startRun } from "@/lib/challenge/runs";
import { closeRun } from "@/lib/challenge/score";
import { issueCertificate } from "@/lib/challenge/certificate";
import { publishRun } from "@/lib/challenge/publish";
import { requestReset } from "@/lib/sandbox/lifecycle";

/** Starts a run and sends the participant into the queue it works on. */
export async function startRunAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const slug = String(formData.get("scenario") ?? "");
  const mode = String(formData.get("mode") ?? "practice") === "scored" ? "scored" : "practice";
  const scenario = scenarioBySlug(slug);
  if (!scenario) redirect("/challenges");
  const result = await startRun(session, scenario, { mode });
  if (!result.ok) redirect(`/challenges/${slug}?problem=${result.code}`);
  // The run banner has to appear immediately, everywhere.
  revalidatePath("/", "layout");
  redirect(`/challenges/${slug}?started=${result.run.id}`);
}

export async function closeRunAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const id = String(formData.get("runId") ?? "");
  const run = (await runById(session, id)) ?? (await activeRun(session));
  if (!run) redirect("/challenges");
  const scenario = scenarioBySlug(run.scenario);
  if (!scenario) redirect("/challenges");
  const { run: closed } = await closeRun(session, run, scenario);
  await issueCertificate(session, closed, scenario);
  revalidatePath("/", "layout");
  redirect(`/runs/${closed.id}`);
}

export async function abandonRunAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const run = await runById(session, String(formData.get("runId") ?? ""));
  if (run && run.status === "running") await abandonRun(session, run);
  revalidatePath("/", "layout");
  redirect("/challenges");
}

export async function publishRunAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const run = await runById(session, String(formData.get("runId") ?? ""));
  if (!run) redirect("/challenges");
  await publishRun(session, run, String(formData.get("publish") ?? "") === "1");
  revalidatePath("/", "layout");
  redirect(`/runs/${run.id}`);
}

/** A scored run needs a full queue; this is the way back to one. */
export async function resetForRunAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  await requestReset(session.tenant.id);
  redirect(`/challenges/${String(formData.get("scenario") ?? "")}?reset=1`);
}
