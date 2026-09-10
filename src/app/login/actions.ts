"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identityProvider, hasLabAccess } from "@/lib/identity";
import { establishSession } from "@/lib/auth/server";
import { clientAddress, consume } from "@/lib/api/rate-limit";

export interface LoginState {
  error: "failed" | "noAccess" | "tooMany" | null;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const input: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") input[k] = v;
  // Counted against the address, not the email that was typed: limiting by
  // email would let anyone lock a participant out of their own account by
  // failing to sign in as them.
  const address = clientAddress(new Request("https://lab.invalid", { headers: await headers() }));
  const attempt = await consume("login", address);
  if (!attempt.ok) return { error: "tooMany" };
  const principal = await identityProvider().login(input);
  if (!principal) return { error: "failed" };
  await establishSession(principal);
  if (!hasLabAccess(principal)) redirect("/no-access");
  redirect("/");
}
