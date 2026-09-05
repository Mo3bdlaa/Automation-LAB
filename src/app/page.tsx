import Link from "next/link";
import { eq } from "drizzle-orm";
import { items, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { sandboxProgress } from "@/lib/sandbox/lifecycle";
import { Page } from "@/components/ui";
import { COMPANY } from "@/lib/generator/vocab";

export default async function DashboardPage() {
  const { t, locale } = await i18n();
  const session = await requireLab();
  const progress = await sandboxProgress(session.tenant);
  const provisioning = session.tenant.status === "provisioning";
  const [vendorCount, itemCount, poCount] = await Promise.all([
    session.tdb.count(vendors),
    session.tdb.count(items),
    session.tdb.count(purchaseOrders, eq(purchaseOrders.historical, false)),
  ]);
  const td = t.dashboard;
  return (
    <Page title={td.title}>
      {provisioning ? <meta httpEquiv="refresh" content="3" /> : null}
      <p className="mb-4 text-sm text-muted">
        {td.welcome}, <span id="dashboard-user" data-testid="dashboard-user">{session.principal.displayName}</span>. {td.company} <strong>{locale === "ar" ? COMPANY.nameAr : COMPANY.name}</strong>.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="al-card" id="sandbox-status" data-testid="sandbox-status" data-status={session.tenant.status} data-progress={session.tenant.progress} data-documents={progress.documents} data-rendered={progress.rendered}>
          <h2 className="mb-2 font-semibold text-primary">{td.sandboxStatus}</h2>
          {provisioning ? (
            <>
              <p className="text-sm">{td.provisioning}</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-border">
                <div className="h-2 bg-primary" style={{ width: `${session.tenant.progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted" id="sandbox-status-message" data-testid="sandbox-status-message">
                {session.tenant.statusMessage} · {session.tenant.progress}%
              </p>
            </>
          ) : session.tenant.status === "failed" ? (
            <p className="text-sm text-error" id="sandbox-status-message" data-testid="sandbox-status-message">
              {td.failed}: {session.tenant.statusMessage}
            </p>
          ) : (
            <>
              <p className="text-sm text-success" id="sandbox-status-message" data-testid="sandbox-status-message">
                {td.ready}
              </p>
              <p className="mt-1 text-xs text-muted" id="sandbox-render-progress" data-testid="sandbox-render-progress">
                PDFs: {progress.rendered}/{progress.documents}
              </p>
            </>
          )}
          <p className="mt-2 text-xs text-muted">
            {td.seed}: <code id="sandbox-seed" data-testid="sandbox-seed">{session.tenant.seed}</code>
          </p>
        </section>
        <section className="al-card" id="dashboard-counts" data-testid="dashboard-counts">
          <h2 className="mb-2 font-semibold text-primary">{td.counts}</h2>
          <dl className="text-sm">
            <div className="flex justify-between border-b border-border py-1">
              <dt>{t.nav.vendors}</dt>
              <dd id="count-vendors" data-testid="count-vendors">{vendorCount}</dd>
            </div>
            <div className="flex justify-between border-b border-border py-1">
              <dt>{t.nav.items}</dt>
              <dd id="count-items" data-testid="count-items">{itemCount}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt>{t.nav.purchaseOrders}</dt>
              <dd id="count-purchase-orders" data-testid="count-purchase-orders">{poCount}</dd>
            </div>
          </dl>
        </section>
        <section className="al-card" id="dashboard-links" data-testid="dashboard-links">
          <h2 className="mb-2 font-semibold text-primary">{td.quickLinks}</h2>
          <ul className="space-y-1 text-sm">
            <li>
              <Link id="link-vendors" data-testid="link-vendors" href="/vendors" className="underline">
                {t.nav.vendors}
              </Link>
            </li>
            <li>
              <Link id="link-items" data-testid="link-items" href="/items" className="underline">
                {t.nav.items}
              </Link>
            </li>
            <li>
              <Link id="link-purchase-orders" data-testid="link-purchase-orders" href="/purchase-orders" className="underline">
                {t.nav.purchaseOrders}
              </Link>
            </li>
            <li>
              <Link id="link-rules" data-testid="link-rules" href="/rules" className="underline">
                {t.nav.rules}
              </Link>
            </li>
            <li>
              <a id="link-api-sandbox" data-testid="link-api-sandbox" href="/api/sandbox" className="underline">
                GET /api/sandbox
              </a>
            </li>
          </ul>
        </section>
      </div>
    </Page>
  );
}
