import Link from "next/link";
import { ilike, inArray } from "drizzle-orm";
import { grns, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { ListFilter, PAGE_SIZE, Page, Pager, Status, TableWrap, Toolbar, parsePage } from "@/components/ui";

export default async function GrnsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = parsePage(sp.page);
  const where = q ? ilike(grns.number, `%${q}%`) : undefined;
  const total = await session.tdb.count(grns, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(grns, { where, orderBy: [{ column: grns.receivedDate, direction: "desc" }, { column: grns.number, direction: "desc" }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const pos = rows.length ? await session.tdb.list(purchaseOrders, { where: inArray(purchaseOrders.id, rows.map((r) => r.purchaseOrderId)) }) : [];
  const vs = rows.length ? await session.tdb.list(vendors, { where: inArray(vendors.id, rows.map((r) => r.vendorId)) }) : [];
  const tc = t.cycle;
  return (
    <Page title={tc.grns}>
      <Toolbar
        title={
          <ListFilter entity="grns" submitLabel={t.common.filter}>
            <input id="grns-filter-q" data-testid="grns-filter-q" name="q" defaultValue={q} placeholder={t.common.search} className="al-input max-w-xs" />
          </ListFilter>
        }
      />
      <TableWrap>
        <table id="grns-table" data-testid="grns-table" className="al-table">
          <thead>
            <tr>
              <th>{tc.number}</th>
              <th>{tc.receivedDate}</th>
              <th>{tc.vendor}</th>
              <th>{tc.poNumber}</th>
              <th>{tc.status}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const po = pos.find((p) => p.id === g.purchaseOrderId);
              const v = vs.find((x) => x.id === g.vendorId);
              return (
                <tr key={g.id} id={`grns-row-${g.number}`} data-testid={`grns-row-${g.number}`} data-number={g.number} data-status={g.status}>
                  <td id={`grns-cell-${g.number}-number`} data-testid={`grns-cell-${g.number}-number`}>
                    <Link href={`/grns/${encodeURIComponent(g.number)}`}>{g.number}</Link>
                  </td>
                  <td>{g.receivedDate}</td>
                  <td>{v ? <bdi>{`${v.code} · ${v.name}`}</bdi> : t.common.none}</td>
                  <td>{po ? <Link href={`/purchase-orders/${encodeURIComponent(po.number)}`}>{po.number}</Link> : t.common.none}</td>
                  <td>
                    <Status status={g.status} />
                  </td>
                  <td>
                    <Link id={`grns-action-view-${g.number}`} data-testid={`grns-action-view-${g.number}`} href={`/grns/${encodeURIComponent(g.number)}`} className="underline">
                      {t.common.view}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Pager entity="grns" page={page} pageCount={pageCount} total={total} baseQuery={{ q }} labels={t.common} />
    </Page>
  );
}
