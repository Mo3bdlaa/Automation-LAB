"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth/server";
import { updateAccount } from "@/lib/identity/accounts";

export interface AccountState {
  error: { field: string; message: string } | null;
  saved: boolean;
}

export async function saveAccountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const principal = await requirePrincipal();
  const value = (k: string) => String(formData.get(k) ?? "");
  const problem = await updateAccount(principal.userId, { displayName: value("displayName"), alias: value("alias"), location: value("location") });
  if (problem) return { error: problem, saved: false };
  revalidatePath("/account");
  return { error: null, saved: true };
}
