import Link from "next/link";
import { ilike, or, sql } from "drizzle-orm";
import { vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { LinkButton, PAGE_SIZE, Page, Pager, Pill, parsePage } from "@/components/ui";

export default async function VendorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = parsePage(sp.page);
  const where = q ? or(ilike(vendors.name, `%${q}%`), ilike(vendors.code, `%${q}%`), ilike(vendors.taxId, `%${q}%`), sql`${vendors.nameAr} ilike ${"%" + q + "%"}`) : undefined;
  const total = await session.tdb.count(vendors, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(vendors, { where, orderBy: [{ column: vendors.code }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const tv = t.vendors;
  return (
    <Page
      title={tv.title}
      actions={
        <LinkButton testId="vendors-new" href="/vendors/new">
          {tv.newVendor}
        </LinkButton>
      }
    >
      <form id="vendors-filter" data-testid="vendors-filter" method="get" className="mb-3 flex gap-2">
        <input id="vendors-filter-q" data-testid="vendors-filter-q" name="q" defaultValue={q} placeholder={t.common.search} className="al-input max-w-sm" />
        <button id="vendors-filter-submit" data-testid="vendors-filter-submit" type="submit" className="al-btn secondary">
          {t.common.filter}
        </button>
      </form>
      <div className="overflow-x-auto">
        <table id="vendors-table" data-testid="vendors-table" className="al-table">
          <thead>
            <tr>
              <th>{tv.code}</th>
              <th>{tv.name}</th>
              <th>{tv.category}</th>
              <th>{tv.taxId}</th>
              <th>{tv.city}</th>
              <th>{tv.currency}</th>
              <th>{tv.status}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} id={`vendors-row-${v.code}`} data-testid={`vendors-row-${v.code}`} data-code={v.code} data-shared={session.tdb.isReadOnlyRow(v) ? "1" : "0"}>
                <td id={`vendors-cell-${v.code}-code`} data-testid={`vendors-cell-${v.code}-code`}>
                  <Link href={`/vendors/${encodeURIComponent(v.code)}`}>{v.code}</Link>
                </td>
                <td id={`vendors-cell-${v.code}-name`} data-testid={`vendors-cell-${v.code}-name`}>
                  <bdi>{v.name}</bdi>
                  {v.nameAr ? (
                    <div dir="rtl" className="text-xs text-muted">
                      {v.nameAr}
                    </div>
                  ) : null}
                </td>
                <td id={`vendors-cell-${v.code}-category`} data-testid={`vendors-cell-${v.code}-category`}>{v.category}</td>
                <td id={`vendors-cell-${v.code}-taxId`} data-testid={`vendors-cell-${v.code}-taxId`}>{v.taxId}</td>
                <td id={`vendors-cell-${v.code}-city`} data-testid={`vendors-cell-${v.code}-city`}>{v.city}</td>
                <td id={`vendors-cell-${v.code}-currency`} data-testid={`vendors-cell-${v.code}-currency`}>{v.currency}</td>
                <td id={`vendors-cell-${v.code}-status`} data-testid={`vendors-cell-${v.code}-status`}>
                  <Pill>{v.status}</Pill>
                </td>
                <td>
                  <Link id={`vendors-action-view-${v.code}`} data-testid={`vendors-action-view-${v.code}`} href={`/vendors/${encodeURIComponent(v.code)}`} className="me-2 underline">
                    {t.common.view}
                  </Link>
                  {!session.tdb.isReadOnlyRow(v) ? (
                    <Link id={`vendors-action-edit-${v.code}`} data-testid={`vendors-action-edit-${v.code}`} href={`/vendors/${encodeURIComponent(v.code)}/edit`} className="underline">
                      {t.common.edit}
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager entity="vendors" page={page} pageCount={pageCount} total={total} baseQuery={{ q }} labels={t.common} />
    </Page>
  );
}
