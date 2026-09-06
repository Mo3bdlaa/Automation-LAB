import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { documentFiles, documents, extractions, invoiceLines, invoices, payments, purchaseOrders, seededDefects, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { isStaff } from "@/lib/identity";
import { Button, DocumentCard, Facts, Flash, LinkButton, Page, Section, Status, TableWrap, ValidationErrors } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";
import type { Violation } from "@/lib/validation/engine";
import { decideInvoiceAction, rematchAction } from "../actions";
import { ExtractionForm } from "../extraction-form";
import { extractionToInvoice } from "@/lib/services/extraction";

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ internalNumber: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { internalNumber: raw } = await params;
  const sp = await searchParams;
  const internalNumber = decodeURIComponent(raw);
  const inv = await session.tdb.one(invoices, eq(invoices.internalNumber, internalNumber));
  if (!inv) notFound();
  const tc = t.cycle;
  const [vendor, po, lines, doc] = await Promise.all([
    inv.vendorId ? session.tdb.one(vendors, eq(vendors.id, inv.vendorId)) : null,
    inv.purchaseOrderId ? session.tdb.one(purchaseOrders, eq(purchaseOrders.id, inv.purchaseOrderId)) : null,
    session.tdb.list(invoiceLines, { where: eq(invoiceLines.invoiceId, inv.id), orderBy: [{ column: invoiceLines.lineNo }] }),
    session.tdb.one(documents, and(eq(documents.kind, "invoice"), eq(documents.sourceId, inv.id))!),
  ]);
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!) : null;
  const lastExtraction = doc ? (await session.tdb.list(extractions, { where: eq(extractions.documentId, doc.id), orderBy: [{ column: extractions.submittedAt, direction: "desc" }], limit: 1 }))[0] ?? null : null;
  const payment = await session.tdb.one(payments, eq(payments.invoiceId, inv.id));
  const staff = isStaff(session.principal);
  const defects = staff && doc ? await session.tdb.list(seededDefects, { where: eq(seededDefects.documentId, doc.id) }) : [];
  const hidden = inv.status === "pending_extraction" && !staff;
  const violations: Violation[] = (lastExtraction?.matchResult?.violations as Violation[] | undefined) ?? [];
  // Students never see the printed truth: header and lines come from their last extraction. Staff see the document as stored.
  const studentFields = !staff && lastExtraction && lastExtraction.fields.number !== undefined ? lastExtraction.fields : null;
  const shown = studentFields ? extractionToInvoice(inv, studentFields) : null;
  const view = shown
    ? { ...shown.asStored, lines: shown.lines.map((l) => ({ id: `x${l.lineNo}`, lineNo: l.lineNo, description: studentFields![`line${l.lineNo}Description`] ?? l.itemCode ?? "", quantity: String(l.quantity), uom: l.uom, unitPrice: String(l.unitPrice), taxRate: String(l.taxRate), taxAmount: String(l.taxAmount), lineTotal: String(l.lineTotal) })) }
    : { ...inv, lines };
  const truthLabel = staff ? " (as stored)" : " (as extracted)";
  const flash = sp.extracted ? tc.extracted : sp.approved ? tc.approved : sp.rejected ? tc.rejected : sp.paid ? tc.paid : sp.rematched ? "Match re-run." : null;
  const canDecide = ["matched", "exception", "extracted"].includes(inv.status);

  return (
    <Page
      title={inv.internalNumber}
      status={<Status status={inv.status} testId={`invoice-status-${inv.internalNumber}`} />}
      subtitle={hidden ? tc.noExtraction : `${view.printedVendorName} · ${tc.number} ${view.number}${truthLabel}`}
      actions={
        <>
          {lastExtraction && lastExtraction.fields.number !== undefined ? (
            <LinkButton testId="invoice-validate" href={`/invoices/${encodeURIComponent(inv.internalNumber)}/validate`} variant="secondary">
              {tc.openValidationStation}
            </LinkButton>
          ) : null}
          {!hidden ? (
            <form action={rematchAction}>
              <input type="hidden" name="internalNumber" value={inv.internalNumber} />
              <Button testId="invoice-rematch" variant="secondary">
                {tc.rematch}
              </Button>
            </form>
          ) : null}
          {canDecide ? (
            <form action={decideInvoiceAction} className="flex gap-2">
              <input type="hidden" name="internalNumber" value={inv.internalNumber} />
              <Button testId="invoice-approve" variant="accept" name="decision" value="approve">
                {tc.approve}
              </Button>
              <Button testId="invoice-reject" variant="danger" name="decision" value="reject">
                {tc.reject}
              </Button>
            </form>
          ) : null}
          {inv.status === "approved" ? (
            <form action={decideInvoiceAction}>
              <input type="hidden" name="internalNumber" value={inv.internalNumber} />
              <Button testId="invoice-pay" name="decision" value="pay">
                {tc.pay}
              </Button>
            </form>
          ) : null}
          <LinkButton testId="invoice-back" href="/invoices" variant="secondary">
            {tc.invoices}
          </LinkButton>
        </>
      }
    >
      <Flash status="success" message={flash} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hidden ? (
            <div className="al-card" id={`invoice-detail-${inv.internalNumber}`} data-testid={`invoice-detail-${inv.internalNumber}`} data-status={inv.status} data-hidden="1">
              <p className="text-sm text-muted">{tc.extractionIntro}</p>
            </div>
          ) : (
            <>
              <Facts
                entity="invoice"
                code={inv.internalNumber}
                facts={[
                  { key: "number", label: tc.number, value: view.number },
                  { key: "vendor", label: tc.printedVendorName, value: staff && vendor ? <Link href={`/vendors/${encodeURIComponent(vendor.code)}`}>{`${vendor.code} · ${vendor.name}`}</Link> : view.printedVendorName || t.common.none },
                  { key: "printedVendorTaxId", label: tc.printedVendorTaxId, value: view.printedVendorTaxId || t.common.none },
                  { key: "poNumber", label: tc.printedPoNumber, value: staff && po ? <Link href={`/purchase-orders/${encodeURIComponent(po.number)}`}>{po.number}</Link> : view.printedPoNumber ?? t.common.none },
                  { key: "invoiceDate", label: tc.invoiceDate, value: view.invoiceDate },
                  { key: "dueDate", label: tc.dueDate, value: view.dueDate },
                  { key: "receivedDate", label: tc.receivedDate, value: inv.receivedDate },
                  { key: "currency", label: t.po.currency, value: view.currency || t.common.none },
                  { key: "printedIban", label: tc.printedIban, value: view.printedIban || t.common.none },
                  { key: "printedBankName", label: tc.printedBankName, value: view.printedBankName || t.common.none },
                  { key: "subtotal", label: t.po.subtotal, value: fmtNumber(view.subtotal) },
                  { key: "taxTotal", label: t.po.taxTotal, value: fmtNumber(view.taxTotal) },
                  { key: "grandTotal", label: t.po.grandTotal, value: <strong>{fmtNumber(view.grandTotal)}</strong> },
                  ...(payment ? [{ key: "payment", label: tc.payment, value: <Link href={`/payments/${encodeURIComponent(payment.number)}`}>{payment.number}</Link> }] : []),
                ]}
              />
              <Section title={tc.matchResult} testId="invoice-match">
                <ValidationErrors violations={violations} emptyText={lastExtraction ? t.common.noValidationErrors : "Not matched yet."} title={tc.matchResult} />
              </Section>
              <Section title={tc.lines + truthLabel}>
                <TableWrap>
                  <table id="invoice-lines-table" data-testid="invoice-lines-table" className="al-table" data-source={staff ? "stored" : "extracted"}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t.po.description}</th>
                        <th className="num">{t.po.quantity}</th>
                        <th>{t.po.uom}</th>
                        <th className="num">{t.po.unitPrice}</th>
                        <th className="num">VAT %</th>
                        <th className="num">{t.po.taxTotal}</th>
                        <th className="num">{t.po.lineTotal}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.lines.map((l) => (
                        <tr key={l.id} id={`invoice-line-row-${l.lineNo}`} data-testid={`invoice-line-row-${l.lineNo}`}>
                          <td>{l.lineNo}</td>
                          <td id={`invoice-line-cell-${l.lineNo}-description`} data-testid={`invoice-line-cell-${l.lineNo}-description`}>{l.description}</td>
                          <td className="num" id={`invoice-line-cell-${l.lineNo}-quantity`} data-testid={`invoice-line-cell-${l.lineNo}-quantity`}>{fmtNumber(l.quantity, "en-US", Number(l.quantity) % 1 === 0 ? 0 : 3)}</td>
                          <td id={`invoice-line-cell-${l.lineNo}-uom`} data-testid={`invoice-line-cell-${l.lineNo}-uom`}>{l.uom}</td>
                          <td className="num" id={`invoice-line-cell-${l.lineNo}-unitPrice`} data-testid={`invoice-line-cell-${l.lineNo}-unitPrice`}>{fmtNumber(l.unitPrice)}</td>
                          <td className="num" id={`invoice-line-cell-${l.lineNo}-taxRate`} data-testid={`invoice-line-cell-${l.lineNo}-taxRate`}>{(Number(l.taxRate) * 100).toFixed(1)}</td>
                          <td className="num" id={`invoice-line-cell-${l.lineNo}-taxAmount`} data-testid={`invoice-line-cell-${l.lineNo}-taxAmount`}>{fmtNumber(l.taxAmount)}</td>
                          <td className="num" id={`invoice-line-cell-${l.lineNo}-lineTotal`} data-testid={`invoice-line-cell-${l.lineNo}-lineTotal`}>{fmtNumber(l.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </Section>
            </>
          )}
          {["pending_extraction", "extracted", "matched", "exception"].includes(inv.status) ? (
            <Section title={tc.extraction} testId="invoice-extraction">
              <p className="mb-2 text-sm text-muted">{tc.extractionIntro}</p>
              <ExtractionForm t={t} internalNumber={inv.internalNumber} previous={lastExtraction && lastExtraction.fields.number !== undefined ? lastExtraction.fields : null} />
            </Section>
          ) : null}
        </div>
        <div>
          <DocumentCard entity="invoice" documentId={doc?.id ?? null} file={file} labels={{ title: t.po.document, download: t.common.download, rendering: t.common.rendering, notRendered: t.common.notRendered, filename: t.po.filename }} />
          {staff && defects.length ? (
            <div className="al-card mt-4" id="invoice-defects" data-testid="invoice-defects">
              <h2 className="mb-2">{tc.seededDefects}</h2>
              <ul className="text-sm">
                {defects.map((d) => (
                  <li key={d.id} data-testid={`defect-${d.defectType}`} className="border-b border-border py-1">
                    <code>{d.defectType}</code> <Status status={d.severity} />
                    <div className="text-xs text-muted">{JSON.stringify(d.details)}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

