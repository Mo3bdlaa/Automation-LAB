import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { deliveryLocations, deliveryNotes, documentFiles, documents, employees, grnLines, grns, items, purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { DocumentCard, Facts, Flash, LinkButton, Page, Section, Status, TableWrap } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";

export default async function GrnDetailPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { number: raw } = await params;
  const sp = await searchParams;
  const number = decodeURIComponent(raw);
  const g = await session.tdb.one(grns, eq(grns.number, number));
  if (!g) notFound();
  const tc = t.cycle;
  const [po, vendor, dn, lines, doc, loc, by] = await Promise.all([
    session.tdb.one(purchaseOrders, eq(purchaseOrders.id, g.purchaseOrderId)),
    session.tdb.one(vendors, eq(vendors.id, g.vendorId)),
    g.deliveryNoteId ? session.tdb.one(deliveryNotes, eq(deliveryNotes.id, g.deliveryNoteId)) : null,
    session.tdb.list(grnLines, { where: eq(grnLines.grnId, g.id), orderBy: [{ column: grnLines.lineNo }] }),
    session.tdb.one(documents, and(eq(documents.kind, "grn"), eq(documents.sourceId, g.id))!),
    g.deliveryLocationId ? session.tdb.one(deliveryLocations, eq(deliveryLocations.id, g.deliveryLocationId)) : null,
    g.receivedById ? session.tdb.one(employees, eq(employees.id, g.receivedById)) : null,
  ]);
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!) : null;
  const poLines = await session.tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, g.purchaseOrderId) });
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const its = itemIds.length ? await session.tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const q = (v: string) => fmtNumber(v, "en-US", Number(v) % 1 === 0 ? 0 : 3);
  return (
    <Page
      title={g.number}
      status={<Status status={g.status} testId={`grn-status-${g.number}`} />}
      actions={
        <LinkButton testId="grn-back" href="/grns" variant="secondary">
          {tc.grns}
        </LinkButton>
      }
    >
      <Flash status="success" message={sp.posted ? tc.grnPosted : null} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Facts
            entity="grn"
            code={g.number}
            facts={[
              { key: "poNumber", label: tc.poNumber, value: po ? <Link href={`/purchase-orders/${encodeURIComponent(po.number)}`}>{po.number}</Link> : t.common.none },
              { key: "deliveryNote", label: tc.delivery, value: dn ? <Link href={`/deliveries/${dn.id}`}>{dn.number}</Link> : t.common.none },
              { key: "vendor", label: tc.vendor, value: vendor ? <Link href={`/vendors/${encodeURIComponent(vendor.code)}`}>{`${vendor.code} · ${vendor.name}`}</Link> : t.common.none },
              { key: "receivedDate", label: tc.receivedDate, value: g.receivedDate },
              { key: "location", label: tc.location, value: loc ? `${loc.code} · ${loc.name}` : t.common.none },
              { key: "receivedBy", label: tc.receivedBy, value: by?.name ?? session.principal.displayName },
              { key: "notes", label: t.po.notes, value: g.notes ?? t.common.none },
            ]}
          />
          <Section title={tc.lines}>
            <TableWrap>
              <table id="grn-lines-table" data-testid="grn-lines-table" className="al-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>PO line</th>
                    <th>{t.po.item}</th>
                    <th>{t.po.description}</th>
                    <th className="num">{tc.quantityReceived}</th>
                    <th className="num">{tc.quantityAccepted}</th>
                    <th className="num">{tc.quantityRejected}</th>
                    <th>{t.po.uom}</th>
                    <th>{tc.rejectionReason}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} id={`grn-line-row-${l.lineNo}`} data-testid={`grn-line-row-${l.lineNo}`}>
                      <td>{l.lineNo}</td>
                      <td>{poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? ""}</td>
                      <td>{its.find((i) => i.id === l.itemId)?.code ?? ""}</td>
                      <td>{l.description}</td>
                      <td className="num" id={`grn-line-cell-${l.lineNo}-quantityReceived`} data-testid={`grn-line-cell-${l.lineNo}-quantityReceived`}>{q(l.quantityReceived)}</td>
                      <td className="num" id={`grn-line-cell-${l.lineNo}-quantityAccepted`} data-testid={`grn-line-cell-${l.lineNo}-quantityAccepted`}>{q(l.quantityAccepted)}</td>
                      <td className="num" id={`grn-line-cell-${l.lineNo}-quantityRejected`} data-testid={`grn-line-cell-${l.lineNo}-quantityRejected`}>{q(l.quantityRejected)}</td>
                      <td>{l.uom}</td>
                      <td>{l.rejectionReason ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Section>
        </div>
        <DocumentCard entity="grn" documentId={doc?.id ?? null} file={file} labels={{ title: t.po.document, download: t.common.download, rendering: t.common.rendering, notRendered: t.common.notRendered, filename: t.po.filename }} />
      </div>
    </Page>
  );
}
