import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { documentFiles, documents, employees, purchaseOrders, quotes, rfqLines, rfqs, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Button, DocumentCard, Facts, Flash, LinkButton, Page, Section, Status, TableWrap } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";
import { awardQuoteAction } from "../actions";

export default async function RfqDetailPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { number: raw } = await params;
  const sp = await searchParams;
  const number = decodeURIComponent(raw);
  const rfq = await session.tdb.one(rfqs, eq(rfqs.number, number));
  if (!rfq) notFound();
  const tc = t.cycle;
  const [lines, qs, doc, po] = await Promise.all([
    session.tdb.list(rfqLines, { where: eq(rfqLines.rfqId, rfq.id), orderBy: [{ column: rfqLines.lineNo }] }),
    session.tdb.list(quotes, { where: eq(quotes.rfqId, rfq.id), orderBy: [{ column: quotes.grandTotal }] }),
    session.tdb.one(documents, and(eq(documents.kind, "rfq"), eq(documents.sourceId, rfq.id))!),
    rfq.purchaseOrderId ? session.tdb.one(purchaseOrders, eq(purchaseOrders.id, rfq.purchaseOrderId)) : null,
  ]);
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!) : null;
  const vs = qs.length ? await session.tdb.list(vendors, { where: inArray(vendors.id, qs.map((q) => q.vendorId)) }) : [];
  const qDocs = qs.length ? await session.tdb.list(documents, { where: and(eq(documents.kind, "quote"), inArray(documents.sourceId, qs.map((q) => q.id)))! }) : [];
  const qFiles = qDocs.length ? await session.tdb.list(documentFiles, { where: inArray(documentFiles.documentId, qDocs.map((d) => d.id)) }) : [];
  const emps = await session.tdb.list(employees, { where: inArray(employees.id, [rfq.buyerId, rfq.requesterId].filter(Boolean) as string[]) });
  const canAward = !session.tdb.isReadOnlyRow(rfq) && rfq.status !== "awarded" && rfq.status !== "cancelled";
  return (
    <Page
      title={rfq.number}
      status={<Status status={rfq.status} testId={`rfq-status-${rfq.number}`} />}
      actions={
        <LinkButton testId="rfq-back" href="/rfqs" variant="secondary">
          {tc.rfqs}
        </LinkButton>
      }
    >
      <Flash status="success" message={sp.awarded ? tc.awarded : null} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Facts
            entity="rfq"
            code={rfq.number}
            facts={[
              { key: "issueDate", label: tc.issueDate, value: rfq.issueDate },
              { key: "dueDate", label: tc.dueDate, value: rfq.dueDate },
              { key: "buyer", label: t.po.buyer, value: emps.find((e) => e.id === rfq.buyerId)?.name ?? t.common.none },
              { key: "requester", label: t.po.requester, value: emps.find((e) => e.id === rfq.requesterId)?.name ?? t.common.none },
              { key: "purchaseOrder", label: t.po.number, value: po ? <Link href={`/purchase-orders/${encodeURIComponent(po.number)}`}>{po.number}</Link> : t.common.none },
            ]}
          />
          <Section title={tc.lines}>
            <TableWrap>
              <table id="rfq-lines-table" data-testid="rfq-lines-table" className="al-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t.po.description}</th>
                    <th className="num">{t.po.quantity}</th>
                    <th>{t.po.uom}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} id={`rfq-line-row-${l.lineNo}`} data-testid={`rfq-line-row-${l.lineNo}`}>
                      <td>{l.lineNo}</td>
                      <td>{l.description}</td>
                      <td className="num">{fmtNumber(l.quantity, "en-US", 0)}</td>
                      <td>{l.uom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Section>
          <Section title={tc.quotes} testId="rfq-quotes">
            <TableWrap>
              <table id="quotes-table" data-testid="quotes-table" className="al-table">
                <thead>
                  <tr>
                    <th>{tc.vendor}</th>
                    <th>{tc.number}</th>
                    <th>{tc.quoteDate}</th>
                    <th>{tc.validUntil}</th>
                    <th className="num">{tc.leadTimeDays}</th>
                    <th className="num">{t.po.grandTotal}</th>
                    <th>{tc.status}</th>
                    <th>{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {qs.map((q) => {
                    const v = vs.find((x) => x.id === q.vendorId);
                    const d = qDocs.find((x) => x.sourceId === q.id);
                    const f = d ? qFiles.find((x) => x.documentId === d.id) : null;
                    return (
                      <tr key={q.id} id={`quotes-row-${q.id}`} data-testid={`quotes-row-${q.id}`} data-vendor={v?.code ?? ""} data-status={q.status} data-document-id={d?.id ?? ""}>
                        <td>{v ? <Link href={`/vendors/${encodeURIComponent(v.code)}`}>{`${v.code} · ${v.name}`}</Link> : t.common.none}</td>
                        <td id={`quotes-cell-${q.id}-number`} data-testid={`quotes-cell-${q.id}-number`}>{q.number}</td>
                        <td>{q.quoteDate}</td>
                        <td>{q.validUntil}</td>
                        <td className="num">{q.leadTimeDays}</td>
                        <td className="num" id={`quotes-cell-${q.id}-grandTotal`} data-testid={`quotes-cell-${q.id}-grandTotal`}>
                          {fmtNumber(q.grandTotal)} {q.currency}
                        </td>
                        <td>
                          <Status status={q.status} />
                        </td>
                        <td className="flex gap-2">
                          {d && f ? (
                            <a id={`quotes-action-download-${q.id}`} data-testid={`quotes-action-download-${q.id}`} href={`/api/documents/${d.id}/file`} download={f.filename} className="underline">
                              PDF
                            </a>
                          ) : (
                            <span className="text-muted">{t.common.rendering}</span>
                          )}
                          {canAward ? (
                            <form action={awardQuoteAction}>
                              <input type="hidden" name="rfqNumber" value={rfq.number} />
                              <input type="hidden" name="quoteId" value={q.id} />
                              <Button testId={`quotes-action-award-${q.id}`} variant="secondary">
                                {tc.award}
                              </Button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </Section>
        </div>
        <DocumentCard entity="rfq" documentId={doc?.id ?? null} file={file} labels={{ title: t.po.document, download: t.common.download, rendering: t.common.rendering, notRendered: t.common.notRendered, filename: t.po.filename }} />
      </div>
    </Page>
  );
}
