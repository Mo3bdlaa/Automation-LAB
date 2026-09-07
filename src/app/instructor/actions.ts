"use server";

import { redirect } from "next/navigation";
import { audit, requireLab } from "@/lib/auth/server";
import { isStaff } from "@/lib/identity";
import { isLevel } from "@/lib/documents/levels";
import { setDefaultLevel } from "@/lib/lab-settings";

/**
 * Sets the difficulty level the queues hand out to the whole cohort. Staff only:
 * the page is gated too, but an action is a public endpoint of its own.
 */
export async function setDefaultLevelAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  if (!isStaff(session.principal)) redirect("/");
  const level = Number(formData.get("level"));
  if (!isLevel(level)) redirect("/instructor");
  await setDefaultLevel(level, session.principal.userId);
  await audit(session, "lab.default_level", "setting", "defaultLevel", { level });
  redirect("/instructor?level=1");
}
