import Link from "next/link";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { deliveryNotes, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { ListFilter, PAGE_SIZE, Page, Pager, Status, TableWrap, Toolbar, parsePage } from "@/components/ui";

const STATUSES = ["in_transit", "delivered", "received"] as const;

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const page = parsePage(sp.page);
  const conds = [];
  if (q) conds.push(or(ilike(deliveryNotes.number, `%${q}%`), ilike(deliveryNotes.carrier, `%${q}%`)));
  if (status) conds.push(eq(deliveryNotes.status, status as (typeof STATUSES)[number]));
  const where = conds.length ? and(...conds) : undefined;
  const total = await session.tdb.count(deliveryNotes, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(deliveryNotes, { where, orderBy: [{ column: deliveryNotes.deliveryDate, direction: "desc" }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const pos = rows.length ? await session.tdb.list(purchaseOrders, { where: inArray(purchaseOrders.id, rows.map((r) => r.purchaseOrderId)) }) : [];
  const vs = rows.length ? await session.tdb.list(vendors, { where: inArray(vendors.id, rows.map((r) => r.vendorId)) }) : [];
  const tc = t.cycle;
  return (
    <Page title={tc.deliveries} subtitle="Warehouse inbox · post a goods receipt against a delivered note">
      <Toolbar
        title={
          <ListFilter entity="deliveries" submitLabel={t.common.filter}>
            <input id="deliveries-filter-q" data-testid="deliveries-filter-q" name="q" defaultValue={q} placeholder={t.common.search} className="al-input max-w-xs" />
            <select id="deliveries-filter-status" data-testid="deliveries-filter-status" name="status" defaultValue={status} className="al-input max-w-[12rem]">
              <option value="">{tc.status}: —</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </ListFilter>
        }
      />
      <TableWrap>
        <table id="deliveries-table" data-testid="deliveries-table" className="al-table">
          <thead>
            <tr>
              <th>{tc.number}</th>
              <th>{tc.deliveryDate}</th>
              <th>{tc.vendor}</th>
              <th>{tc.poNumber}</th>
              <th>{tc.carrier}</th>
              <th>{tc.status}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((dn) => {
              const po = pos.find((p) => p.id === dn.purchaseOrderId);
              const v = vs.find((x) => x.id === dn.vendorId);
              return (
                <tr key={dn.id} id={`deliveries-row-${dn.id}`} data-testid={`deliveries-row-${dn.id}`} data-number={dn.number} data-status={dn.status}>
                  <td id={`deliveries-cell-${dn.id}-number`} data-testid={`deliveries-cell-${dn.id}-number`}>
                    <Link href={`/deliveries/${dn.id}`}>{dn.number}</Link>
                  </td>
                  <td>{dn.deliveryDate}</td>
                  <td>{v ? <bdi>{`${v.code} · ${v.name}`}</bdi> : t.common.none}</td>
                  <td>{po ? <Link href={`/purchase-orders/${encodeURIComponent(po.number)}`}>{po.number}</Link> : t.common.none}</td>
                  <td>{dn.carrier ?? t.common.none}</td>
                  <td>
                    <Status status={dn.status} />
                  </td>
                  <td>
                    <Link id={`deliveries-action-view-${dn.id}`} data-testid={`deliveries-action-view-${dn.id}`} href={`/deliveries/${dn.id}`} className="underline">
                      {t.common.view}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Pager entity="deliveries" page={page} pageCount={pageCount} total={total} baseQuery={{ q, status }} labels={t.common} />
    </Page>
  );
}
