"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { documents, extractions, invoices } from "@/db/schema";
import { requireLab } from "@/lib/auth/server";
import { decideInvoice, matchStoredInvoice, submitExtraction } from "@/lib/services/invoices";
import { failedState, formValues, str, type FormState } from "@/lib/forms";
import { INVOICE_FORM_LINES } from "./constants";
import { EXTRACTION_HEADER_FIELDS, EXTRACTION_LINE_FIELDS, extractionToInvoice } from "@/lib/services/extraction";

export async function submitExtractionAction(internalNumber: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv || session.tdb.isReadOnlyRow(inv)) return failedState([{ ruleId: "INV-NOT-FOUND", severity: "error", message: "Invoice not found." }], values);
  if (!["pending_extraction", "extracted", "exception", "matched"].includes(inv.status)) {
    return failedState([{ ruleId: "INV-STATE", severity: "error", message: `Invoice is ${inv.status}; extraction is closed.` }], values);
  }

  const fields: Record<string, string> = {};
  for (const k of EXTRACTION_HEADER_FIELDS) fields[k] = str(values, k);
  for (let n = 1; n <= INVOICE_FORM_LINES; n++) for (const k of EXTRACTION_LINE_FIELDS) if (str(values, `line${n}${k}`)) fields[`line${n}${k}`] = str(values, `line${n}${k}`);
  const { asStored, lines } = extractionToInvoice(inv, fields);
  if (lines.length === 0) return failedState([{ ruleId: "INV-LINE-MIN", severity: "error", message: "Enter at least one line." }], values);

  await submitExtraction(session, inv, fields, asStored, lines, "ui");
  redirect(`/invoices/${encodeURIComponent(inv.internalNumber)}?extracted=1`);
}

export async function rematchAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const internalNumber = String(formData.get("internalNumber") ?? "");
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv || session.tdb.isReadOnlyRow(inv) || inv.status === "pending_extraction") redirect(`/invoices/${encodeURIComponent(internalNumber)}`);

  const doc = await session.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!);
  const last = doc
    ? (await session.tdb.list(extractions, { where: and(eq(extractions.documentId, doc.id), sql`${extractions.fields} ? 'number'`)!, orderBy: [{ column: extractions.submittedAt, direction: "desc" }], limit: 1 }))[0]
    : null;
  if (last) {
    const { asStored, lines } = extractionToInvoice(inv, last.fields);
    await submitExtraction(session, inv, last.fields, asStored, lines, "ui");
  } else {
    const result = await matchStoredInvoice(session, inv);
    if (doc) await session.tdb.insert(extractions, { documentId: doc.id, userId: session.principal.userId, source: "ui", fields: { rematch: "1" }, matchResult: { ok: result.ok, violations: result.violations } });
    if (["extracted", "matched", "exception"].includes(inv.status)) await session.tdb.update(invoices, { status: result.ok ? "matched" : "exception", updatedAt: new Date() }, eq(invoices.id, inv.id));
  }
  redirect(`/invoices/${encodeURIComponent(internalNumber)}?rematched=1`);
}

export async function decideInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const internalNumber = String(formData.get("internalNumber") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approve" | "reject" | "pay";
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv) redirect(`/invoices/${encodeURIComponent(internalNumber)}`);
  const result = await decideInvoice(session, inv, decision);
  const flag = result.ok ? { approve: "approved", reject: "rejected", pay: "paid" }[decision] : null;
  redirect(`/invoices/${encodeURIComponent(internalNumber)}${flag ? `?${flag}=1` : ""}`);
}
