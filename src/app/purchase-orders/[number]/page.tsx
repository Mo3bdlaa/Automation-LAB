import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { costCenters, deliveryLocations, documentFiles, documents, employees, items, purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Button, Dl, Flash, LinkButton, Page, Pill } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";
import { approvePurchaseOrderAction } from "../actions";

export default async function PoDetailPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { number: raw } = await params;
  const sp = await searchParams;
  const number = decodeURIComponent(raw);
  const po = await session.tdb.one(purchaseOrders, eq(purchaseOrders.number, number));
  if (!po) notFound();
  const [vendor, lines, doc] = await Promise.all([
    session.tdb.one(vendors, eq(vendors.id, po.vendorId)),
    session.tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] }),
    session.tdb.one(documents, and(eq(documents.kind, "purchase_order"), eq(documents.sourceId, po.id))!),
  ]);
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!) : null;
  const empIds = [po.buyerId, po.requesterId, po.approverId].filter(Boolean) as string[];
  const emps = empIds.length ? await session.tdb.list(employees, { where: inArray(employees.id, empIds) }) : [];
  const emp = (id: string | null) => emps.find((e) => e.id === id);
  const cc = po.costCenterId ? await session.tdb.one(costCenters, eq(costCenters.id, po.costCenterId)) : null;
  const dl = po.deliveryLocationId ? await session.tdb.one(deliveryLocations, eq(deliveryLocations.id, po.deliveryLocationId)) : null;
  const itemIds = lines.map((l) => l.itemId).filter(Boolean) as string[];
  const its = itemIds.length ? await session.tdb.list(items, { where: inArray(items.id, itemIds) }) : [];
  const item = (id: string | null) => its.find((i) => i.id === id);
  const readOnly = session.tdb.isReadOnlyRow(po);
  const tp = t.po;

  return (
    <Page
      title={`${po.number}`}
      actions={
        <>
          {!readOnly && po.status === "draft" ? (
            <form action={approvePurchaseOrderAction}>
              <input type="hidden" name="number" value={po.number} />
              <Button testId="po-approve">Approve</Button>
            </form>
          ) : null}
          <LinkButton testId="po-back" href="/purchase-orders" variant="secondary">
            {tp.title}
          </LinkButton>
        </>
      }
    >
      <Flash status="success" message={sp.created ? t.common.created : sp.approved ? "Approved. PDF is being rendered." : null} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="al-card lg:col-span-2" id={`po-detail-${po.number}`} data-testid={`po-detail-${po.number}`} data-status={po.status} data-historical={po.historical ? "1" : "0"}>
          <Dl
            entity="po"
            code={po.number}
            rows={[
              { key: "number", label: tp.number, value: po.number },
              { key: "status", label: tp.status, value: <Pill testId={`po-status-${po.number}`}>{po.status.replace(/_/g, " ")}</Pill> },
              { key: "vendor", label: tp.vendor, value: vendor ? <a href={`/vendors/${encodeURIComponent(vendor.code)}`}>{`${vendor.code} · ${vendor.name}`}</a> : t.common.none },
              { key: "currency", label: tp.currency, value: po.currency },
              { key: "orderDate", label: tp.orderDate, value: po.orderDate },
              { key: "expectedDeliveryDate", label: tp.expectedDeliveryDate, value: po.expectedDeliveryDate },
              { key: "buyer", label: tp.buyer, value: emp(po.buyerId)?.name ?? t.common.none },
              { key: "requester", label: tp.requester, value: emp(po.requesterId)?.name ?? t.common.none },
              { key: "approver", label: tp.approver, value: emp(po.approverId)?.name ?? t.common.none },
              { key: "costCenter", label: tp.costCenter, value: cc ? `${cc.code} · ${cc.name}` : t.common.none },
              { key: "deliveryLocation", label: tp.deliveryLocation, value: dl ? `${dl.code} · ${dl.name}` : t.common.none },
              { key: "paymentTerms", label: tp.paymentTerms, value: po.paymentTermsDays === 0 ? "Due on receipt" : `Net ${po.paymentTermsDays}` },
              { key: "notes", label: tp.notes, value: po.notes ?? t.common.none },
            ]}
          />
        </div>
        <div className="al-card" id="po-document" data-testid="po-document" data-document-id={doc?.id ?? ""} data-rendered={file ? "1" : "0"}>
          <h2 className="mb-2 font-semibold text-primary">{tp.document}</h2>
          {!doc ? (
            <p className="text-sm text-muted" id="po-document-none" data-testid="po-document-none">
              {t.common.notRendered}
            </p>
          ) : file ? (
            <>
              <p className="mb-2 text-sm" id="po-document-filename" data-testid="po-document-filename">
                {tp.filename}: <code>{file.filename}</code> · {file.pages}p · {Math.round(file.sizeBytes / 1024)} KB
              </p>
              <a id="po-download" data-testid="po-download" href={`/api/documents/${doc.id}/file`} className="al-btn" download={file.filename}>
                {t.common.download}
              </a>
            </>
          ) : (
            <p className="text-sm text-muted" id="po-document-rendering" data-testid="po-document-rendering">
              {t.common.rendering}
            </p>
          )}
        </div>
      </div>

      <h2 className="mb-2 mt-5 text-lg font-semibold text-primary">{tp.lines}</h2>
      <div className="overflow-x-auto">
        <table id="po-lines-table" data-testid="po-lines-table" className="al-table">
          <thead>
            <tr>
              <th>{tp.line}</th>
              <th>{tp.item}</th>
              <th>{tp.description}</th>
              <th className="num">{tp.quantity}</th>
              <th>{tp.uom}</th>
              <th className="num">{tp.unitPrice}</th>
              <th className="num">{tp.discount}</th>
              <th>{tp.taxCode}</th>
              <th className="num">{tp.taxTotal}</th>
              <th className="num">{tp.lineTotal}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} id={`po-line-row-${l.lineNo}`} data-testid={`po-line-row-${l.lineNo}`}>
                <td>{l.lineNo}</td>
                <td id={`po-line-cell-${l.lineNo}-itemCode`} data-testid={`po-line-cell-${l.lineNo}-itemCode`}>{item(l.itemId)?.code ?? t.common.none}</td>
                <td id={`po-line-cell-${l.lineNo}-description`} data-testid={`po-line-cell-${l.lineNo}-description`}>{l.description}</td>
                <td className="num" id={`po-line-cell-${l.lineNo}-quantity`} data-testid={`po-line-cell-${l.lineNo}-quantity`}>
                  {fmtNumber(l.quantity, "en-US", Number(l.quantity) % 1 === 0 ? 0 : 3)}
                </td>
                <td id={`po-line-cell-${l.lineNo}-uom`} data-testid={`po-line-cell-${l.lineNo}-uom`}>{l.uom}</td>
                <td className="num" id={`po-line-cell-${l.lineNo}-unitPrice`} data-testid={`po-line-cell-${l.lineNo}-unitPrice`}>
                  {fmtNumber(l.unitPrice)}
                </td>
                <td className="num" id={`po-line-cell-${l.lineNo}-discountPct`} data-testid={`po-line-cell-${l.lineNo}-discountPct`}>
                  {fmtNumber(l.discountPct, "en-US", 1)}
                </td>
                <td id={`po-line-cell-${l.lineNo}-taxCode`} data-testid={`po-line-cell-${l.lineNo}-taxCode`}>{l.taxCode}</td>
                <td className="num" id={`po-line-cell-${l.lineNo}-taxAmount`} data-testid={`po-line-cell-${l.lineNo}-taxAmount`}>
                  {fmtNumber(l.taxAmount)}
                </td>
                <td className="num" id={`po-line-cell-${l.lineNo}-lineTotal`} data-testid={`po-line-cell-${l.lineNo}-lineTotal`}>
                  {fmtNumber(l.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} className="num">
                {tp.subtotal}
              </td>
              <td colSpan={2} className="num" id={`po-cell-${po.number}-subtotal`} data-testid={`po-cell-${po.number}-subtotal`}>
                {fmtNumber(po.subtotal)}
              </td>
            </tr>
            <tr>
              <td colSpan={8} className="num">
                {tp.taxTotal}
              </td>
              <td colSpan={2} className="num" id={`po-cell-${po.number}-taxTotal`} data-testid={`po-cell-${po.number}-taxTotal`}>
                {fmtNumber(po.taxTotal)}
              </td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={8} className="num">
                {tp.grandTotal} ({po.currency})
              </td>
              <td colSpan={2} className="num" id={`po-cell-${po.number}-grandTotal`} data-testid={`po-cell-${po.number}-grandTotal`}>
                {fmtNumber(po.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Page>
  );
}
