import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { deliveryNotes, grns, invoices, items, purchaseOrders, rfqs, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * One box that finds a record by its number.
 *
 * Not full-text search, and it does not pretend to be: every list screen
 * already filters, and what nobody could do was type a number they were
 * holding and land on the record. That is what this does — it resolves a
 * reference and redirects, so the address bar ends up on the record itself
 * rather than on a results page nobody wanted.
 *
 * The prefix is enough to know where to look, which keeps this to one query
 * rather than nine.
 */
const RESOLVERS: { match: RegExp; find: (q: string, tdb: Awaited<ReturnType<typeof requireLab>>["tdb"]) => Promise<string | null> }[] = [
  {
    match: /^INV-/i,
    find: async (q, tdb) => ((await tdb.one(invoices, eq(invoices.internalNumber, q))) ? `/invoices/${encodeURIComponent(q)}` : null),
  },
  {
    match: /^PO-/i,
    find: async (q, tdb) => ((await tdb.one(purchaseOrders, eq(purchaseOrders.number, q))) ? `/purchase-orders/${encodeURIComponent(q)}` : null),
  },
  {
    match: /^RFQ-/i,
    find: async (q, tdb) => ((await tdb.one(rfqs, eq(rfqs.number, q))) ? `/rfqs/${encodeURIComponent(q)}` : null),
  },
  {
    match: /^(DN|GRN)-/i,
    find: async (q, tdb) => {
      if (await tdb.one(deliveryNotes, eq(deliveryNotes.number, q))) return `/deliveries/${encodeURIComponent(q)}`;
      return (await tdb.one(grns, eq(grns.number, q))) ? `/grns/${encodeURIComponent(q)}` : null;
    },
  },
  {
    match: /^V-/i,
    find: async (q, tdb) => ((await tdb.one(vendors, eq(vendors.code, q))) ? `/vendors/${encodeURIComponent(q)}` : null),
  },
  {
    // Anything else is tried as an item code, which is the one reference with
    // no prefix of its own.
    match: /./,
    find: async (q, tdb) => ((await tdb.one(items, eq(items.code, q))) ? `/items/${encodeURIComponent(q)}` : null),
  },
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const raw = ((await searchParams).q ?? "").trim();
  const q = raw.toUpperCase();

  if (q) {
    for (const r of RESOLVERS) {
      if (!r.match.test(q)) continue;
      const href = await r.find(q, session.tdb);
      if (href) redirect(href);
    }
  }

  return (
    <Page title={t.common.search} titleId="search-title" subtitle={raw ? `“${raw}”` : undefined}>
      <div className="al-card" id="search-empty" data-testid="search-empty" data-query={raw}>
        <p className="text-sm">
          {raw ? t.search.nothing : t.search.prompt}
        </p>
        <p className="mt-2 text-sm text-muted">{t.search.hint}</p>
      </div>
    </Page>
  );
}
