"use server";

import { redirect } from "next/navigation";
import { requireLab, audit } from "@/lib/auth/server";
import { requestReset } from "@/lib/sandbox/lifecycle";
import { createApiToken, revokeApiToken } from "@/lib/api/tokens";
import { issueBotCredential } from "@/lib/identity/accounts";
import { personUserId } from "@/lib/identity/types";
import { consume } from "@/lib/api/rate-limit";

export async function resetSandboxAction(): Promise<void> {
  const session = await requireLab();
  const attempt = await consume("reset", personUserId(session.principal));
  if (!attempt.ok) redirect("/sandbox?slowDown=1");
  if (session.tenant.status !== "provisioning") {
    await requestReset(session.tenant.id);
    await audit(session, "sandbox.reset", "tenant", session.tenant.id);
  }
  redirect("/sandbox?reset=1");
}

/** Creates a token and returns the plaintext once, through the redirect. */
export async function createTokenAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const name = String(formData.get("name") ?? "").slice(0, 80) || "token";
  const { plaintext } = await createApiToken(session.principal.userId, name);
  await audit(session, "token.create", "api_token", name);
  redirect(`/sandbox?token=${encodeURIComponent(plaintext)}`);
}

export async function revokeTokenAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const id = String(formData.get("id") ?? "");
  await revokeApiToken(session.principal.userId, id);
  await audit(session, "token.revoke", "api_token", id);
  redirect("/sandbox?revoked=1");
}

/**
 * Issues a fresh password for the robot login and shows it once.
 *
 * Also the way a leaked one is revoked: the old password stops working the
 * moment a new one is issued.
 */
export async function regenerateBotPasswordAction(): Promise<void> {
  const session = await requireLab();
  const attempt = await consume("credential", personUserId(session.principal));
  if (!attempt.ok) redirect("/sandbox?slowDown=1");
  const { password } = await issueBotCredential(personUserId(session.principal));
  await audit(session, "bot.credential.issue", "account", personUserId(session.principal));
  redirect(`/sandbox?bot=${encodeURIComponent(password)}`);
}
