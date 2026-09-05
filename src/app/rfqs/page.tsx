import Link from "next/link";
import { and, eq, ilike } from "drizzle-orm";
import { rfqs } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { ListFilter, PAGE_SIZE, Page, Pager, Status, TableWrap, Toolbar, parsePage } from "@/components/ui";

const STATUSES = ["open", "quoted", "awarded", "cancelled"] as const;

export default async function RfqsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const page = parsePage(sp.page);
  const conds = [];
  if (q) conds.push(ilike(rfqs.number, `%${q}%`));
  if (status) conds.push(eq(rfqs.status, status as (typeof STATUSES)[number]));
  const where = conds.length ? and(...conds) : undefined;
  const total = await session.tdb.count(rfqs, where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(rfqs, { where, orderBy: [{ column: rfqs.issueDate, direction: "desc" }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const tc = t.cycle;
  return (
    <Page title={tc.rfqs}>
      <Toolbar
        title={
          <ListFilter entity="rfqs" submitLabel={t.common.filter}>
            <input id="rfqs-filter-q" data-testid="rfqs-filter-q" name="q" defaultValue={q} placeholder={t.common.search} className="al-input max-w-xs" />
            <select id="rfqs-filter-status" data-testid="rfqs-filter-status" name="status" defaultValue={status} className="al-input max-w-[12rem]">
              <option value="">{tc.status}: —</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </ListFilter>
        }
      />
      <TableWrap>
        <table id="rfqs-table" data-testid="rfqs-table" className="al-table">
          <thead>
            <tr>
              <th>{tc.number}</th>
              <th>{tc.issueDate}</th>
              <th>{tc.dueDate}</th>
              <th>{tc.status}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} id={`rfqs-row-${r.number}`} data-testid={`rfqs-row-${r.number}`} data-number={r.number} data-status={r.status}>
                <td id={`rfqs-cell-${r.number}-number`} data-testid={`rfqs-cell-${r.number}-number`}>
                  <Link href={`/rfqs/${encodeURIComponent(r.number)}`}>{r.number}</Link>
                </td>
                <td id={`rfqs-cell-${r.number}-issueDate`} data-testid={`rfqs-cell-${r.number}-issueDate`}>{r.issueDate}</td>
                <td id={`rfqs-cell-${r.number}-dueDate`} data-testid={`rfqs-cell-${r.number}-dueDate`}>{r.dueDate}</td>
                <td id={`rfqs-cell-${r.number}-status`} data-testid={`rfqs-cell-${r.number}-status`}>
                  <Status status={r.status} />
                </td>
                <td>
                  <Link id={`rfqs-action-view-${r.number}`} data-testid={`rfqs-action-view-${r.number}`} href={`/rfqs/${encodeURIComponent(r.number)}`} className="underline">
                    {t.common.view}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pager entity="rfqs" page={page} pageCount={pageCount} total={total} baseQuery={{ q, status }} labels={t.common} />
    </Page>
  );
}
