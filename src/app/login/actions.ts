"use server";

import { redirect } from "next/navigation";
import { identityProvider, hasLabAccess } from "@/lib/identity";
import { establishSession } from "@/lib/auth/server";

export interface LoginState {
  error: "failed" | "noAccess" | null;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const input: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") input[k] = v;
  const principal = await identityProvider().login(input);
  if (!principal) return { error: "failed" };
  await establishSession(principal);
  if (!hasLabAccess(principal)) redirect("/no-access");
  redirect("/");
}
