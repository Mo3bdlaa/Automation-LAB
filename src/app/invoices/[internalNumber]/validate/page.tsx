import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { documentFiles, documents, extractions, invoices } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { LinkButton, Page, Status } from "@/components/ui";
import type { Violation } from "@/lib/validation/engine";
import { ValidationStation } from "./validation-station";

/**
 * Validation station: the document beside the extracted fields, with the
 * low-confidence ones flagged, mirroring UiPath's human-in-the-loop screen.
 */
export default async function ValidateInvoicePage({ params }: { params: Promise<{ internalNumber: string }> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { internalNumber: raw } = await params;
  const internalNumber = decodeURIComponent(raw);
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv) notFound();
  const doc = await session.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!);
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!) : null;
  const last = doc
    ? (await session.tdb.list(extractions, { where: eq(extractions.documentId, doc.id), orderBy: [{ column: extractions.submittedAt, direction: "desc" }], limit: 1 }))[0] ?? null
    : null;
  if (!last || last.fields.number === undefined) redirect(`/invoices/${encodeURIComponent(internalNumber)}`);

  return (
    <Page
      title={`${t.cycle.validationStation} · ${inv.internalNumber}`}
      status={<Status status={inv.status} testId={`invoice-status-${inv.internalNumber}`} />}
      subtitle={t.cycle.validationIntro}
      actions={
        <LinkButton testId="validate-back" href={`/invoices/${encodeURIComponent(internalNumber)}`} variant="secondary">
          {t.cycle.invoice}
        </LinkButton>
      }
    >
      <ValidationStation
        t={t}
        internalNumber={inv.internalNumber}
        documentUrl={doc && file ? `/api/documents/${doc.id}/file?inline=1` : null}
        fields={last.fields}
        confidence={last.confidence ?? {}}
        violations={(last.matchResult?.violations ?? []) as Violation[]}
      />
    </Page>
  );
}
