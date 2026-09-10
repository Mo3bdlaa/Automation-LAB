"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { register } from "@/lib/identity/accounts";
import { clientAddress, consume } from "@/lib/api/rate-limit";
import { selfServiceSignUp } from "@/lib/identity";
import { establishSession } from "@/lib/auth/server";

export interface RegisterState {
  error: { field: string; message: string } | null;
  values: Record<string, string>;
}

/**
 * Sign-up. The account is created and the session established in one step:
 * there is no email round trip, because a challenge someone found on a Friday
 * evening should not depend on their inbox. The email is still unique, so it
 * can carry password resets and certificate copies later.
 */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const value = (k: string) => String(formData.get(k) ?? "");
  const values = { email: value("email"), displayName: value("displayName"), alias: value("alias"), location: value("location") };
  if (!selfServiceSignUp()) return { error: { field: "email", message: "Sign-up is closed on this instance." }, values };
  const address = clientAddress(new Request("https://lab.invalid", { headers: await headers() }));
  const attempt = await consume("register", address);
  if (!attempt.ok) {
    return { error: { field: "email", message: `Too many sign-ups from here. Try again in ${Math.ceil(attempt.retryAfter / 60)} minutes.` }, values };
  }
  if (value("password") !== value("passwordConfirm")) {
    return { error: { field: "passwordConfirm", message: "The two passwords do not match." }, values };
  }
  const result = await register({
    email: values.email,
    password: value("password"),
    displayName: values.displayName,
    alias: values.alias,
    location: values.location,
  });
  if (!result.ok) return { error: { field: result.field, message: result.message }, values };
  await establishSession(result.principal);
  redirect("/?welcome=1");
}
