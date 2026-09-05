import Link from "next/link";
import { ilike, inArray, or } from "drizzle-orm";
import { invoices, payments, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { ListFilter, PAGE_SIZE, Page, Pager, TableWrap, Toolbar, parsePage } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = parsePage(sp.page);
  const where = q ? or(ilike(payments.number, `%${q}%`), ilike(payments.reference, `%${q}%`)) : undefined;
  const total = await session.tdb.count(payments, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(payments, { where, orderBy: [{ column: payments.paidDate, direction: "desc" }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const invs = rows.length ? await session.tdb.list(invoices, { where: inArray(invoices.id, rows.map((r) => r.invoiceId)) }) : [];
  const vendorIds = rows.map((r) => r.vendorId).filter(Boolean) as string[];
  const vs = vendorIds.length ? await session.tdb.list(vendors, { where: inArray(vendors.id, vendorIds) }) : [];
  const tc = t.cycle;
  return (
    <Page title={tc.payments}>
      <Toolbar
        title={
          <ListFilter entity="payments" submitLabel={t.common.filter}>
            <input id="payments-filter-q" data-testid="payments-filter-q" name="q" defaultValue={q} placeholder={t.common.search} className="al-input max-w-xs" />
          </ListFilter>
        }
      />
      <TableWrap>
        <table id="payments-table" data-testid="payments-table" className="al-table">
          <thead>
            <tr>
              <th>{tc.number}</th>
              <th>{tc.paidDate}</th>
              <th>{tc.vendor}</th>
              <th>{tc.invoice}</th>
              <th>{tc.method}</th>
              <th>{tc.reference}</th>
              <th className="num">{tc.amount}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const inv = invs.find((i) => i.id === p.invoiceId);
              const v = vs.find((x) => x.id === p.vendorId);
              return (
                <tr key={p.id} id={`payments-row-${p.number}`} data-testid={`payments-row-${p.number}`} data-number={p.number}>
                  <td id={`payments-cell-${p.number}-number`} data-testid={`payments-cell-${p.number}-number`}>
                    <Link href={`/payments/${encodeURIComponent(p.number)}`}>{p.number}</Link>
                  </td>
                  <td>{p.paidDate}</td>
                  <td>{v ? <bdi>{`${v.code} · ${v.name}`}</bdi> : t.common.none}</td>
                  <td>{inv ? <Link href={`/invoices/${encodeURIComponent(inv.internalNumber)}`}>{inv.internalNumber}</Link> : t.common.none}</td>
                  <td>{p.method.replace(/_/g, " ")}</td>
                  <td>{p.reference}</td>
                  <td className="num" id={`payments-cell-${p.number}-amount`} data-testid={`payments-cell-${p.number}-amount`}>
                    {fmtNumber(p.amount)} {p.currency}
                  </td>
                  <td>
                    <Link id={`payments-action-view-${p.number}`} data-testid={`payments-action-view-${p.number}`} href={`/payments/${encodeURIComponent(p.number)}`} className="underline">
                      {t.common.view}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Pager entity="payments" page={page} pageCount={pageCount} total={total} baseQuery={{ q }} labels={t.common} />
    </Page>
  );
}
