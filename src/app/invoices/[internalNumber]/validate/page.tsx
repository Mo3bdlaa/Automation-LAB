import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { documentFieldBoxes, documentFiles, documents, extractions, invoices } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { LinkButton, Page, Status } from "@/components/ui";
import type { Violation } from "@/lib/validation/engine";
import { ValidationStation } from "./validation-station";
import { isLevel, LEVELS, LEVEL_SPECS, type Level } from "@/lib/documents/levels";

/**
 * Validation station: the document beside the extracted fields, with the
 * low-confidence ones flagged, mirroring UiPath's human-in-the-loop screen.
 */
export default async function ValidateInvoicePage({ params, searchParams }: { params: Promise<{ internalNumber: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { internalNumber: raw } = await params;
  const internalNumber = decodeURIComponent(raw);
  const sp = await searchParams;
  const rawLevel = Number(Array.isArray(sp.level) ? sp.level[0] : sp.level ?? "1");
  const level: Level = isLevel(rawLevel) ? rawLevel : 1;
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv) notFound();
  const doc = await session.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!);
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, level))!) : null;
  // Where each field sits on this level's page, so the station can show a map
  // of the document beside the values.
  const boxes = doc
    ? (await session.tdb.list(documentFieldBoxes, { where: and(eq(documentFieldBoxes.documentId, doc.id), eq(documentFieldBoxes.level, level))! })).map((b) => ({
        field: b.field,
        page: b.page,
        x: Number(b.x),
        y: Number(b.y),
        w: Number(b.w),
        h: Number(b.h),
      }))
    : [];
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
        documentUrl={doc ? `/api/documents/${doc.id}/file?inline=1${level > 1 ? `&level=${level}` : ""}` : null}
        documentReady={Boolean(file)}
        level={level}
        levels={LEVELS.map((l) => ({ level: l, label: LEVEL_SPECS[l].label }))}
        levelHrefBase={`/invoices/${encodeURIComponent(internalNumber)}/validate`}
        boxes={boxes}
        fields={last.fields}
        confidence={last.confidence ?? {}}
        violations={(last.matchResult?.violations ?? []) as Violation[]}
      />
    </Page>
  );
}
