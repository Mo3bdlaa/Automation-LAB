import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { deliveryLocations, deliveryNoteLines, deliveryNotes, documentFiles, documents, grns, items, purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Button, DocumentCard, Facts, Input, LinkButton, Page, Section, Status, TableWrap } from "@/components/ui";
import { refuseDeliveryAction } from "../actions";
import { CORPUS_TODAY } from "@/lib/generator/dates";
import { GrnForm } from "../grn-form";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const dn = await session.tdb.one(deliveryNotes, eq(deliveryNotes.id, id));
  if (!dn) notFound();
  const tc = t.cycle;
  const [po, vendor, lines, doc, grn, loc] = await Promise.all([
    session.tdb.one(purchaseOrders, eq(purchaseOrders.id, dn.purchaseOrderId)),
    session.tdb.one(vendors, eq(vendors.id, dn.vendorId)),
    session.tdb.list(deliveryNoteLines, { where: eq(deliveryNoteLines.deliveryNoteId, dn.id), orderBy: [{ column: deliveryNoteLines.lineNo }] }),
    session.tdb.one(documents, and(eq(documents.kind, "delivery_note"), eq(documents.sourceId, dn.id))!),
    session.tdb.one(grns, eq(grns.deliveryNoteId, dn.id)),
    dn.deliveryLocationId ? session.tdb.one(deliveryLocations, eq(deliveryLocations.id, dn.deliveryLocationId)) : null,
  ]);
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!) : null;
  const poLines = await session.tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, dn.purchaseOrderId) });
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const its = itemIds.length ? await session.tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const viewLines = lines.map((l) => ({ lineNo: l.lineNo, poLineNo: poLines.find((p) => p.id === l.purchaseOrderLineId)?.lineNo ?? null, itemCode: its.find((i) => i.id === l.itemId)?.code ?? null, description: l.description, quantity: String(Number(l.quantity)), uom: l.uom }));
  const canPost = !session.tdb.isReadOnlyRow(dn) && !grn;
  return (
    <Page
      title={`${tc.delivery} ${dn.number}`}
      status={<Status status={dn.status} testId={`delivery-status-${dn.id}`} />}
      actions={
        <LinkButton testId="delivery-back" href="/deliveries" variant="secondary">
          {tc.deliveries}
        </LinkButton>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Facts
            entity="delivery"
            code={dn.id}
            facts={[
              { key: "number", label: tc.number, value: dn.number },
              { key: "vendor", label: tc.vendor, value: vendor ? <Link href={`/vendors/${encodeURIComponent(vendor.code)}`}>{`${vendor.code} · ${vendor.name}`}</Link> : t.common.none },
              { key: "poNumber", label: tc.poNumber, value: po ? <Link href={`/purchase-orders/${encodeURIComponent(po.number)}`}>{po.number}</Link> : t.common.none },
              { key: "deliveryDate", label: tc.deliveryDate, value: dn.deliveryDate },
              { key: "location", label: tc.location, value: loc ? `${loc.code} · ${loc.name}` : t.common.none },
              { key: "carrier", label: tc.carrier, value: dn.carrier ?? t.common.none },
              { key: "vehicle", label: tc.vehicle, value: dn.vehicle ?? t.common.none },
              { key: "packages", label: tc.packages, value: String(dn.packages ?? "—") },
              { key: "grn", label: tc.grn, value: grn ? <Link href={`/grns/${encodeURIComponent(grn.number)}`}>{grn.number}</Link> : t.common.none },
            ]}
          />
          {canPost ? (
            <Section title={tc.postGrn} testId="delivery-post-grn">
              <GrnForm t={t} deliveryNoteId={dn.id} today={CORPUS_TODAY} lines={viewLines} />
              <form action={refuseDeliveryAction} className="mt-3 flex flex-wrap items-end gap-2" id="delivery-refuse-form" data-testid="delivery-refuse-form">
                <input type="hidden" name="deliveryNoteId" value={dn.id} />
                <div>
                  <label htmlFor="delivery-refuse-reason" className="al-label">
                    {tc.refuseReason}
                  </label>
                  <Input testId="delivery-refuse-reason" name="reason" placeholder={tc.refuseReasonHint} />
                </div>
                <Button testId="delivery-refuse" variant="danger">
                  {tc.refuse}
                </Button>
              </form>
            </Section>
          ) : (
            <Section title={tc.lines}>
              <TableWrap>
                <table id="delivery-lines-table" data-testid="delivery-lines-table" className="al-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>PO line</th>
                      <th>{t.po.item}</th>
                      <th>{t.po.description}</th>
                      <th className="num">{tc.shipped}</th>
                      <th>{t.po.uom}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewLines.map((l) => (
                      <tr key={l.lineNo} id={`delivery-line-row-${l.lineNo}`} data-testid={`delivery-line-row-${l.lineNo}`}>
                        <td>{l.lineNo}</td>
                        <td>{l.poLineNo ?? ""}</td>
                        <td>{l.itemCode ?? ""}</td>
                        <td>{l.description}</td>
                        <td className="num">{l.quantity}</td>
                        <td>{l.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Section>
          )}
        </div>
        <DocumentCard entity="delivery" documentId={doc?.id ?? null} file={file} labels={{ title: t.po.document, download: t.common.download, rendering: t.common.rendering, notRendered: t.common.notRendered, filename: t.po.filename }} />
      </div>
    </Page>
  );
}
