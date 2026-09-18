import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { deliveryNotes, invoices, items, purchaseOrders, rfqs, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { getPrincipal, requireLab } from "@/lib/auth/server";
import { sandboxProgress } from "@/lib/sandbox/lifecycle";
import { Landing } from "./landing";
import { Page, Section, Tile } from "@/components/ui";
import { COMPANY } from "@/lib/generator/vocab";
import { ALL_RULES } from "@/lib/validation/rules";

/**
 * A row of the queue: how many, what it is, and where it goes.
 *
 * `key` is the published selector, not a name chosen here. Every one of these
 * is printed in the process documents participants write their bots against,
 * quoted in the scenario catalogue as the handle for a step, and listed in
 * docs/selectors.md as a contract. Renaming one breaks every bot written
 * against it, silently, with a green build — which is what this comment is
 * for. The layout above them is ours to change; these are not.
 */
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
  const progress = await sandboxProgress(session.tenant);
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
  const posAwaitingInvoice = (
    await tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.historical, false), inArray(purchaseOrders.status, ["received", "partially_received"]))! })
  ).length;
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
    { key: "tile-invoices-exception", count: exceptionInvoices, title: td.exceptionsTitle, detail: td.exceptionsDetail, href: "/invoices?status=exception", tone: "error" },
    { key: "tile-invoices-pending", count: pendingInvoices, title: td.pendingTitle, detail: td.pendingDetail, href: "/invoices?status=pending_extraction", tone: "warning" },
    { key: "tile-deliveries-pending", count: awaitingGrn, title: td.deliveriesTitle, detail: td.deliveriesDetail, href: "/deliveries?status=delivered", tone: "warning" },
    { key: "tile-pos-awaiting-invoice", count: posAwaitingInvoice, title: td.posTitle, detail: td.posDetail, href: "/purchase-orders?status=received", tone: "info" },
    { key: "tile-vendors-pending", count: pendingVendors, title: td.vendorsTitle, detail: td.vendorsDetail, href: "/vendors?status=pending", tone: "info" },
    { key: "tile-rfqs-open", count: openRfqs, title: td.rfqsTitle, detail: td.rfqsDetail, href: "/rfqs?status=open", tone: "info" },
    { key: "tile-invoices-approved", count: approvedInvoices, title: td.approvedTitle, detail: td.approvedDetail, href: "/invoices?status=approved", tone: "info" },
  ] satisfies QueueRow[]).filter((r) => r.count > 0);

  return (
    <Page title={`${td.welcome}, ${session.principal.displayName}`} subtitle={`${td.company} ${locale === "ar" ? COMPANY.nameAr : COMPANY.name}`}>
      {provisioning ? <meta httpEquiv="refresh" content="3" /> : null}

      {/*
        Five scripts and the process documents tell a bot to wait until this
        reads ready before it starts. Provisioning is instant now that the
        document set is shared, so there is nothing to watch and it is a line
        rather than the card it used to be — but the contract is the data
        attributes, not the size, and those have not moved.
      */}
      <p
        className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted"
        id="sandbox-status"
        data-testid="sandbox-status"
        data-status={session.tenant.status}
        data-progress={session.tenant.progress}
        data-documents={progress.documents}
        data-rendered={progress.rendered}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: session.tenant.status === "ready" ? "var(--al-success)" : session.tenant.status === "failed" ? "var(--al-error)" : "var(--al-warning)" }} aria-hidden="true" />
        <span id="sandbox-status-message" data-testid="sandbox-status-message">
          {session.tenant.status === "ready" ? td.ready : session.tenant.status === "failed" ? `${td.failed}: ${session.tenant.statusMessage}` : `${td.provisioning} · ${session.tenant.progress}%`}
        </span>
        <span className="text-faint">·</span>
        <span>
          {td.seed}: <code id="sandbox-seed" data-testid="sandbox-seed">{session.tenant.seed}</code>
        </span>
      </p>

      <section className="al-card mb-5 p-0" id="dashboard-queues" data-testid="dashboard-queues">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <h2>{td.queueTitle}</h2>
          <span className="order-3 basis-full text-sm text-muted md:order-none md:flex-1 md:basis-auto">{td.queueLead}</span>
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
              id={row.key}
              data-testid={row.key}
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
          <Tile testId="tile-vendors" href="/vendors" title={t.nav.vendors} subtitle={td.tileVendors} count={vendorCount} />
          <Tile testId="tile-items" href="/items" title={t.nav.items} subtitle={td.tileItems} count={itemCount} />
          <Tile testId="tile-purchase-orders" href="/purchase-orders" title={t.nav.purchaseOrders} subtitle={td.tilePurchaseOrders} count={poCount} />
          <Tile testId="tile-rules" href="/rules" title={t.nav.rules} subtitle={td.tileRules} count={ALL_RULES.length} />
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
