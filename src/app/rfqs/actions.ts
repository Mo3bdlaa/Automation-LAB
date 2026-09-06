"use server";

import { redirect } from "next/navigation";
import { requireLab } from "@/lib/auth/server";
import { awardQuote } from "@/lib/services/rfqs";

export async function awardQuoteAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const rfqNumber = String(formData.get("rfqNumber") ?? "");
  const result = await awardQuote(session, rfqNumber, String(formData.get("quoteId") ?? ""));
  redirect(`/rfqs/${encodeURIComponent(rfqNumber)}${result.ok ? "?awarded=1" : ""}`);
}
