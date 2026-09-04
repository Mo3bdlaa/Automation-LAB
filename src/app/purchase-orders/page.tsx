import Link from "next/link";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { PO_STATUSES, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { LinkButton, PAGE_SIZE, Page, Pager, Pill, parsePage } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && (PO_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const scope = sp.scope === "all" ? "all" : "mine"; // default: the student's working set, not the 900-row history
  const page = parsePage(sp.page);

  const conds = [];
  if (q) conds.push(or(ilike(purchaseOrders.number, `%${q}%`)));
  if (status) conds.push(eq(purchaseOrders.status, status as (typeof PO_STATUSES)[number]));
  if (scope === "mine") conds.push(eq(purchaseOrders.historical, false));
  const where = conds.length ? and(...conds) : undefined;

  const total = await session.tdb.count(purchaseOrders, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(purchaseOrders, { where, orderBy: [{ column: purchaseOrders.orderDate, direction: "desc" }, { column: purchaseOrders.number, direction: "desc" }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const vendorIds = [...new Set(rows.map((r) => r.vendorId))];
  const vs = vendorIds.length ? await session.tdb.list(vendors, { where: inArray(vendors.id, vendorIds) }) : [];
  const vendorById = new Map(vs.map((v) => [v.id, v]));
  const tp = t.po;
  return (
    <Page
      title={tp.title}
      actions={
        <LinkButton testId="purchase-orders-new" href="/purchase-orders/new">
          {tp.newPo}
        </LinkButton>
      }
    >
      <form id="purchase-orders-filter" data-testid="purchase-orders-filter" method="get" className="mb-3 flex flex-wrap gap-2">
        <input id="purchase-orders-filter-q" data-testid="purchase-orders-filter-q" name="q" defaultValue={q} placeholder={tp.number} className="al-input max-w-xs" />
        <select id="purchase-orders-filter-status" data-testid="purchase-orders-filter-status" name="status" defaultValue={status} className="al-input max-w-[12rem]">
          <option value="">{tp.status}: —</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select id="purchase-orders-filter-scope" data-testid="purchase-orders-filter-scope" name="scope" defaultValue={scope} className="al-input max-w-[12rem]">
          <option value="mine">Working set</option>
          <option value="all">Including history</option>
        </select>
        <button id="purchase-orders-filter-submit" data-testid="purchase-orders-filter-submit" type="submit" className="al-btn secondary">
          {t.common.filter}
        </button>
      </form>
      <div className="overflow-x-auto">
        <table id="purchase-orders-table" data-testid="purchase-orders-table" className="al-table">
          <thead>
            <tr>
              <th>{tp.number}</th>
              <th>{tp.orderDate}</th>
              <th>{tp.vendor}</th>
              <th>{tp.status}</th>
              <th>{tp.currency}</th>
              <th className="num">{tp.grandTotal}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((po) => {
              const v = vendorById.get(po.vendorId);
              return (
                <tr key={po.id} id={`purchase-orders-row-${po.number}`} data-testid={`purchase-orders-row-${po.number}`} data-number={po.number} data-status={po.status} data-historical={po.historical ? "1" : "0"}>
                  <td id={`purchase-orders-cell-${po.number}-number`} data-testid={`purchase-orders-cell-${po.number}-number`}>
                    <Link href={`/purchase-orders/${encodeURIComponent(po.number)}`}>{po.number}</Link>
                  </td>
                  <td id={`purchase-orders-cell-${po.number}-orderDate`} data-testid={`purchase-orders-cell-${po.number}-orderDate`}>{po.orderDate}</td>
                  <td id={`purchase-orders-cell-${po.number}-vendor`} data-testid={`purchase-orders-cell-${po.number}-vendor`}>{v ? <bdi>{`${v.code} · ${v.name}`}</bdi> : t.common.none}</td>
                  <td id={`purchase-orders-cell-${po.number}-status`} data-testid={`purchase-orders-cell-${po.number}-status`}>
                    <Pill>{po.status.replace(/_/g, " ")}</Pill>
                  </td>
                  <td id={`purchase-orders-cell-${po.number}-currency`} data-testid={`purchase-orders-cell-${po.number}-currency`}>{po.currency}</td>
                  <td className="num" id={`purchase-orders-cell-${po.number}-grandTotal`} data-testid={`purchase-orders-cell-${po.number}-grandTotal`}>
                    {fmtNumber(po.grandTotal)}
                  </td>
                  <td>
                    <Link id={`purchase-orders-action-view-${po.number}`} data-testid={`purchase-orders-action-view-${po.number}`} href={`/purchase-orders/${encodeURIComponent(po.number)}`} className="underline">
                      {t.common.view}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager entity="purchase-orders" page={page} pageCount={pageCount} total={total} baseQuery={{ q, status, scope }} labels={t.common} />
    </Page>
  );
}
