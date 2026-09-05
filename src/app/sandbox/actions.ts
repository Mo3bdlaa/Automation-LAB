"use server";

import { redirect } from "next/navigation";
import { requireLab, audit } from "@/lib/auth/server";
import { requestReset } from "@/lib/sandbox/lifecycle";

export async function resetSandboxAction(): Promise<void> {
  const session = await requireLab();
  if (session.tenant.status !== "provisioning") {
    await requestReset(session.tenant.id);
    await audit(session, "sandbox.reset", "tenant", session.tenant.id);
  }
  redirect("/sandbox?reset=1");
}
