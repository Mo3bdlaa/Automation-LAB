import { and, eq, inArray } from "drizzle-orm";
import { deliveryNotes, invoices, items, purchaseOrders, rfqs, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { getPrincipal, requireLab } from "@/lib/auth/server";
import { Landing } from "./landing";
import { activeRun } from "@/lib/challenge/runs";
import { RunBanner } from "./challenges/run-banner";
import { sandboxProgress } from "@/lib/sandbox/lifecycle";
import { Page, Section, Tile } from "@/components/ui";
import { COMPANY } from "@/lib/generator/vocab";

export default async function DashboardPage() {
  const { t, locale } = await i18n();
  // Signed out, this is the front door of a public challenge rather than a
  // locked application: show what is on offer instead of a login wall.
  if (!(await getPrincipal())) return <Landing t={t} />;
  const session = await requireLab();
  const open = await activeRun(session);
  const progress = await sandboxProgress(session.tenant);
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
  const posAwaitingInvoice = (await tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.historical, false), inArray(purchaseOrders.status, ["received", "partially_received"]))! })).length;
  const td = t.dashboard;
  return (
    <Page title={td.title} subtitle={`${td.welcome}, ${session.principal.displayName} · ${td.company} ${locale === "ar" ? COMPANY.nameAr : COMPANY.name}`}>
      {provisioning ? <meta httpEquiv="refresh" content="3" /> : null}
      {open ? <RunBanner t={t} run={{ id: open.id, scenario: open.scenario, mode: open.mode, startedAt: open.startedAt.toISOString(), targets: open.targets.length }} /> : null}
      <section className="al-card mb-5" id="sandbox-status" data-testid="sandbox-status" data-status={session.tenant.status} data-progress={session.tenant.progress} data-documents={progress.documents} data-rendered={progress.rendered}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>{td.sandboxStatus}</h2>
            {provisioning ? (
              <p className="text-sm" id="sandbox-status-message" data-testid="sandbox-status-message">
                {td.provisioning} · {session.tenant.statusMessage} · {session.tenant.progress}%
              </p>
            ) : session.tenant.status === "failed" ? (
              <p className="text-sm text-error" id="sandbox-status-message" data-testid="sandbox-status-message">
                {td.failed}: {session.tenant.statusMessage}
              </p>
            ) : (
              <p className="text-sm text-success" id="sandbox-status-message" data-testid="sandbox-status-message">
                {td.ready}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-muted">
            <div id="sandbox-render-progress" data-testid="sandbox-render-progress">
              PDFs {progress.rendered}/{progress.documents}
            </div>
            <div>
              {td.seed}: <code id="sandbox-seed" data-testid="sandbox-seed">{session.tenant.seed}</code>
            </div>
          </div>
        </div>
        {provisioning || progress.rendered < progress.documents ? (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-border">
            <div className="h-1.5 bg-primary" style={{ width: `${provisioning ? session.tenant.progress : Math.round((100 * progress.rendered) / Math.max(1, progress.documents))}%` }} />
          </div>
        ) : null}
      </section>

      <Section title="Work queues" testId="dashboard-queues">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile testId="tile-invoices-pending" href="/invoices?status=pending_extraction" title="Invoices" subtitle="Pending extraction" count={pendingInvoices} />
          <Tile testId="tile-invoices-exception" href="/invoices?status=exception" title="Invoices" subtitle="Match exceptions" count={exceptionInvoices} />
          <Tile testId="tile-invoices-approved" href="/invoices?status=approved" title="Invoices" subtitle="Approved, awaiting payment" count={approvedInvoices} />
          <Tile testId="tile-pos-awaiting-invoice" href="/purchase-orders?status=received" title="Purchase orders" subtitle="Received, awaiting invoice" count={posAwaitingInvoice} />
          <Tile testId="tile-deliveries-pending" href="/deliveries?status=delivered" title="Deliveries" subtitle="Awaiting goods receipt" count={awaitingGrn} />
          <Tile testId="tile-rfqs-open" href="/rfqs?status=open" title="RFQs" subtitle="Open for award" count={openRfqs} />
          <Tile testId="tile-vendors-pending" href="/vendors?status=pending" title="Vendor applications" subtitle="Pending approval" count={pendingVendors} />
          <Tile testId="tile-rules" href="/rules" title="Validation rules" subtitle="Rule IDs your bot can branch on" />
        </div>
      </Section>

      <Section title={td.counts} testId="dashboard-counts">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile testId="tile-vendors" href="/vendors" title={t.nav.vendors} subtitle="Shared corpus + your sandbox" count={vendorCount} />
          <Tile testId="tile-items" href="/items" title={t.nav.items} subtitle="Catalogue" count={itemCount} />
          <Tile testId="tile-purchase-orders" href="/purchase-orders" title={t.nav.purchaseOrders} subtitle="Your working set" count={poCount} />
          <Tile testId="tile-api-sandbox" href="/api/sandbox" title="API" subtitle="GET /api/sandbox · /api/rules · /api/documents/{id}/file" />
        </div>
      </Section>
    </Page>
  );
}
