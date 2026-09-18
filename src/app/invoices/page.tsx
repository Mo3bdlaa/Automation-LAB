import Link from "next/link";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { INVOICE_STATUSES, invoices, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { LinkButton, ListFilter, PAGE_SIZE, Page, Pager, Status, StatusTabs, TableWrap, Toolbar, parsePage } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && (INVOICE_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const page = parsePage(sp.page);
  const conds = [];
  if (q) conds.push(or(ilike(invoices.number, `%${q}%`), ilike(invoices.internalNumber, `%${q}%`), ilike(invoices.printedVendorName, `%${q}%`), ilike(invoices.printedPoNumber, `%${q}%`)));
  if (status) conds.push(eq(invoices.status, status as (typeof INVOICE_STATUSES)[number]));
  const where = conds.length ? and(...conds) : undefined;
  const total = await session.tdb.count(invoices, where);
  // The tabs' counts ignore the status filter but honour the search, so
  // switching queue keeps whatever you were looking for.
  const searchOnly = q ? conds[0] : undefined;
  const TAB_STATUSES = ["pending_extraction", "exception", "approved", "paid"] as const;
  const [tabCounts, totalForSearch] = await Promise.all([
    Promise.all(TAB_STATUSES.map((st) => session.tdb.count(invoices, searchOnly ? and(searchOnly, eq(invoices.status, st)) : eq(invoices.status, st)))),
    session.tdb.count(invoices, searchOnly),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await session.tdb.list(invoices, { where, orderBy: [{ column: invoices.receivedDate, direction: "desc" }, { column: invoices.internalNumber, direction: "desc" }], limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE });
  const vendorIds = [...new Set(rows.map((r) => r.vendorId).filter(Boolean))] as string[];
  const vs = vendorIds.length ? await session.tdb.list(vendors, { where: inArray(vendors.id, vendorIds) }) : [];
  const vendorById = new Map(vs.map((v) => [v.id, v]));
  const tc = t.cycle;
  const hidden = (inv: (typeof rows)[number]) => inv.status === "pending_extraction";
  return (
    <Page title={tc.invoices} subtitle={t.invoicesPage.subtitle}>
      <StatusTabs
        entity="invoices"
        current={status}
        allLabel={t.common.all}
        allCount={totalForSearch}
        tabs={TAB_STATUSES.map((st, i) => ({ value: st, label: t.invoiceStatus[st], count: tabCounts[i] }))}
      />
      <Toolbar
        title={
          <ListFilter entity="invoices" submitLabel={t.common.filter}>
            <input id="invoices-filter-q" data-testid="invoices-filter-q" name="q" defaultValue={q} placeholder={t.common.search} className="al-input max-w-xs" />
            <select id="invoices-filter-status" data-testid="invoices-filter-status" name="status" defaultValue={status} className="al-input max-w-[13rem]">
              <option value="">{tc.status}: —</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </ListFilter>
        }
      >
        <LinkButton testId="invoices-download-pending" href="/api/queues/invoices-pending/download" variant="secondary" download="invoices-pending.zip">
          {tc.queueAll}
        </LinkButton>
      </Toolbar>
      <TableWrap>
        <table id="invoices-table" data-testid="invoices-table" className="al-table">
          <thead>
            <tr>
              <th>{tc.internalNumber}</th>
              <th>{tc.receivedDate}</th>
              <th>{tc.vendor}</th>
              <th>{tc.number}</th>
              <th>{tc.poNumber}</th>
              <th>{tc.status}</th>
              <th className="num">{t.po.grandTotal}</th>
              <th>{t.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => {
              const v = inv.vendorId ? vendorById.get(inv.vendorId) : null;
              const h = hidden(inv);
              return (
                <tr key={inv.id} id={`invoices-row-${inv.internalNumber}`} data-testid={`invoices-row-${inv.internalNumber}`} data-number={inv.internalNumber} data-status={inv.status}>
                  <td id={`invoices-cell-${inv.internalNumber}-internalNumber`} data-testid={`invoices-cell-${inv.internalNumber}-internalNumber`}>
                    <Link href={`/invoices/${encodeURIComponent(inv.internalNumber)}`}>{inv.internalNumber}</Link>
                  </td>
                  <td id={`invoices-cell-${inv.internalNumber}-receivedDate`} data-testid={`invoices-cell-${inv.internalNumber}-receivedDate`}>{inv.receivedDate}</td>
                  <td id={`invoices-cell-${inv.internalNumber}-vendor`} data-testid={`invoices-cell-${inv.internalNumber}-vendor`}>{h ? <span className="text-muted">{tc.hidden}</span> : v ? <bdi>{`${v.code} · ${v.name}`}</bdi> : <bdi>{inv.printedVendorName}</bdi>}</td>
                  <td id={`invoices-cell-${inv.internalNumber}-number`} data-testid={`invoices-cell-${inv.internalNumber}-number`}>{h ? <span className="text-muted">—</span> : inv.number}</td>
                  <td id={`invoices-cell-${inv.internalNumber}-poNumber`} data-testid={`invoices-cell-${inv.internalNumber}-poNumber`}>{h ? <span className="text-muted">—</span> : inv.printedPoNumber ?? t.common.none}</td>
                  <td id={`invoices-cell-${inv.internalNumber}-status`} data-testid={`invoices-cell-${inv.internalNumber}-status`}>
                    <Status status={inv.status} label={t.invoiceStatus[inv.status]} />
                  </td>
                  <td className="num" id={`invoices-cell-${inv.internalNumber}-grandTotal`} data-testid={`invoices-cell-${inv.internalNumber}-grandTotal`}>
                    {h ? "—" : `${fmtNumber(inv.grandTotal)} ${inv.currency}`}
                  </td>
                  <td>
                    <Link id={`invoices-action-view-${inv.internalNumber}`} data-testid={`invoices-action-view-${inv.internalNumber}`} href={`/invoices/${encodeURIComponent(inv.internalNumber)}`} className="underline">
                      {t.common.view}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <Pager entity="invoices" page={page} pageCount={pageCount} total={total} baseQuery={{ q, status }} labels={t.common} />
    </Page>
  );
}
