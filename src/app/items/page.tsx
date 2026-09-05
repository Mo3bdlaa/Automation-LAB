import Link from "next/link";
import { ilike, or, sql } from "drizzle-orm";
import { items } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { LinkButton, ListFilter, PAGE_SIZE, Page, Pager, TableWrap, Toolbar, parsePage } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = parsePage(sp.page);
  const where = q ? or(ilike(items.name, `%${q}%`), ilike(items.code, `%${q}%`), sql`${items.nameAr} ilike ${"%" + q + "%"}`) : undefined;
  const total = await session.tdb.count(items, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(items, { where, orderBy: [{ column: items.code }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const ti = t.items;
  return (
    <Page
      title={ti.title}
      actions={
        <LinkButton testId="items-new" href="/items/new">
          {ti.newItem}
        </LinkButton>
      }
    >
      <Toolbar
        title={
          <ListFilter entity="items" submitLabel={t.common.filter}>
            <input id="items-filter-q" data-testid="items-filter-q" name="q" defaultValue={q} placeholder={t.common.search} className="al-input max-w-xs" />
          </ListFilter>
        }
      />
      <TableWrap>
        <table id="items-table" data-testid="items-table" className="al-table">
          <thead>
            <tr>
              <th>{ti.code}</th>
              <th>{ti.name}</th>
              <th>{ti.category}</th>
              <th>{ti.uom}</th>
              <th>{ti.taxCode}</th>
              <th className="num">{ti.unitPrice}</th>
              <th>{ti.active}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} id={`items-row-${i.code}`} data-testid={`items-row-${i.code}`} data-code={i.code} data-shared={session.tdb.isReadOnlyRow(i) ? "1" : "0"}>
                <td id={`items-cell-${i.code}-code`} data-testid={`items-cell-${i.code}-code`}>
                  <Link href={`/items/${encodeURIComponent(i.code)}`}>{i.code}</Link>
                </td>
                <td id={`items-cell-${i.code}-name`} data-testid={`items-cell-${i.code}-name`}>
                  <bdi>{i.name}</bdi>
                  {i.nameAr ? (
                    <div dir="rtl" className="text-xs text-muted">
                      {i.nameAr}
                    </div>
                  ) : null}
                </td>
                <td id={`items-cell-${i.code}-category`} data-testid={`items-cell-${i.code}-category`}>{i.category}</td>
                <td id={`items-cell-${i.code}-uom`} data-testid={`items-cell-${i.code}-uom`}>{i.uom}</td>
                <td id={`items-cell-${i.code}-taxCode`} data-testid={`items-cell-${i.code}-taxCode`}>{i.taxCode}</td>
                <td className="num" id={`items-cell-${i.code}-unitPrice`} data-testid={`items-cell-${i.code}-unitPrice`}>
                  {fmtNumber(i.unitPrice)} {i.currency}
                </td>
                <td id={`items-cell-${i.code}-active`} data-testid={`items-cell-${i.code}-active`}>{i.active ? t.common.yes : t.common.no}</td>
                <td>
                  <Link id={`items-action-view-${i.code}`} data-testid={`items-action-view-${i.code}`} href={`/items/${encodeURIComponent(i.code)}`} className="me-2 underline">
                    {t.common.view}
                  </Link>
                  {!session.tdb.isReadOnlyRow(i) ? (
                    <Link id={`items-action-edit-${i.code}`} data-testid={`items-action-edit-${i.code}`} href={`/items/${encodeURIComponent(i.code)}/edit`} className="underline">
                      {t.common.edit}
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pager entity="items" page={page} pageCount={pageCount} total={total} baseQuery={{ q }} labels={t.common} />
    </Page>
  );
}
