import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { deliveryNotes, invoices, items, purchaseOrders, rfqs, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { getPrincipal, requireLab } from "@/lib/auth/server";
import { Landing } from "./landing";
import { Page, Section, Tile } from "@/components/ui";
import { COMPANY } from "@/lib/generator/vocab";

/** A row of the queue: how many, what it is, and where it goes. */
interface QueueRow {
  key: string;
  count: number;
  title: string;
  detail: string;
  href: string;
  tone: "error" | "warning" | "info";
}

export default async function DashboardPage() {
  const { t, locale } = await i18n();
  // Signed out, this is the front door of a public site rather than a locked
  // application: show what is on offer instead of a login wall.
  if (!(await getPrincipal())) return <Landing t={t} />;

  const session = await requireLab();
  const provisioning = session.tenant.status === "provisioning";
  const tdb = session.tdb;
  const [vendorCount, pendingVendors, itemCount, poCount, openRfqs, pendingInvoices, exceptionInvoices, approvedInvoices, awaitingGrn] = await Promise.all([
    tdb.count(vendors),
    tdb.count(vendors, eq(vendors.status, "pending")),
    tdb.count(items),
    tdb.count(purchaseOrders, eq(purchaseOrders.historical, false)),
    tdb.count(rfqs, inArray(rfqs.status, ["open", "quoted"])),
    tdb.count(invoices, eq(invoices.status, "pending_extraction")),
    tdb.count(invoices, eq(invoices.status, "exception")),
    tdb.count(invoices, eq(invoices.status, "approved")),
    tdb.count(deliveryNotes, and(eq(deliveryNotes.status, "delivered"))!),
  ]);
  const td = t.dashboard;

  /*
   * The queue, worst first.
   *
   * This replaced a grid of eight equal tiles, which told you what existed but
   * not what to do — and on a screen whose entire purpose is a day's work,
   * that is the wrong question answered. The order is by how much else each
   * one holds up: a held invoice blocks a payment that is already due, an
   * unread one has not started costing anything yet.
   */
  const queue: QueueRow[] = ([
    { key: "exceptions", count: exceptionInvoices, title: td.exceptionsTitle, detail: td.exceptionsDetail, href: "/invoices?status=exception", tone: "error" },
    { key: "pending", count: pendingInvoices, title: td.pendingTitle, detail: td.pendingDetail, href: "/invoices?status=pending_extraction", tone: "warning" },
    { key: "deliveries", count: awaitingGrn, title: td.deliveriesTitle, detail: td.deliveriesDetail, href: "/deliveries?status=delivered", tone: "warning" },
    { key: "vendors", count: pendingVendors, title: td.vendorsTitle, detail: td.vendorsDetail, href: "/vendors?status=pending", tone: "info" },
    { key: "rfqs", count: openRfqs, title: td.rfqsTitle, detail: td.rfqsDetail, href: "/rfqs?status=open", tone: "info" },
    { key: "approved", count: approvedInvoices, title: td.approvedTitle, detail: td.approvedDetail, href: "/invoices?status=approved", tone: "info" },
  ] satisfies QueueRow[]).filter((r) => r.count > 0);

  return (
    <Page title={`${td.welcome}, ${session.principal.displayName}`} subtitle={`${td.company} ${locale === "ar" ? COMPANY.nameAr : COMPANY.name}`}>
      {provisioning ? <meta httpEquiv="refresh" content="3" /> : null}

      <section className="al-card mb-5 p-0" id="dashboard-queues" data-testid="dashboard-queues">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <h2>{td.queueTitle}</h2>
          <span className="flex-1 text-sm text-muted">{td.queueLead}</span>
          <Link href="/invoices" className="text-[13px] font-medium">
            {td.queueOpen}
          </Link>
        </div>

        {queue.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted" id="queue-empty" data-testid="queue-empty">
            {td.queueEmpty}
          </p>
        ) : (
          queue.map((row) => (
            <Link
              key={row.key}
              id={`queue-${row.key}`}
              data-testid={`queue-${row.key}`}
              data-count={row.count}
              href={row.href}
              className="flex items-center gap-4 border-b border-border px-5 py-3 text-ink no-underline last:border-b-0 hover:bg-surface-2"
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: TONE[row.tone] }} aria-hidden="true" />
              <span className="mono w-11 text-end text-[1.1875rem] font-medium">{row.count}</span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{row.title}</span>
                <span className="text-[12.5px] text-muted">{row.detail}</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--al-faint)" strokeWidth="1.8" aria-hidden="true" className="rtl:-scale-x-100">
                <path d="m6 3 5 5-5 5" />
              </svg>
            </Link>
          ))
        )}
      </section>

      <Section title={td.counts} testId="dashboard-counts">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile testId="tile-vendors" href="/vendors" title={t.nav.vendors} subtitle={`${pendingVendors} ${t.vendors.status}`} count={vendorCount} />
          <Tile testId="tile-items" href="/items" title={t.nav.items} subtitle={t.items.title} count={itemCount} />
          <Tile testId="tile-purchase-orders" href="/purchase-orders" title={t.nav.purchaseOrders} subtitle={t.nav.purchaseOrders} count={poCount} />
          <Tile testId="tile-rules" href="/rules" title={t.nav.rules} subtitle={t.rules.intro} />
        </div>
      </Section>
    </Page>
  );
}

const TONE = {
  error: "var(--al-error)",
  warning: "var(--al-warning)",
  info: "var(--al-primary)",
} as const;
