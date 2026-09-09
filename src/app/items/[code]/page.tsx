import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { items } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Dl, Flash, LinkButton, Page } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";

export default async function ItemDetailPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { code } = await params;
  const sp = await searchParams;
  const i = await session.tdb.one(items, eq(items.code, decodeURIComponent(code)));
  if (!i) notFound();
  const readOnly = session.tdb.isReadOnlyRow(items, i);
  const ti = t.items;
  return (
    <Page
      title={`${i.code} · ${i.name}`}
      actions={
        <>
          {!readOnly ? (
            <LinkButton testId="item-edit" href={`/items/${encodeURIComponent(i.code)}/edit`}>
              {t.common.edit}
            </LinkButton>
          ) : null}
          <LinkButton testId="item-back" href="/items" variant="secondary">
            {ti.title}
          </LinkButton>
        </>
      }
    >
      <Flash status="success" message={sp.saved ? t.common.saved : null} />
      {readOnly ? (
        <p id="item-readonly" data-testid="item-readonly" className="mb-3 text-sm text-muted">
          {t.common.readOnly}
        </p>
      ) : null}
      <div className="al-card" id={`item-detail-${i.code}`} data-testid={`item-detail-${i.code}`} data-shared={readOnly ? "1" : "0"}>
        <Dl
          entity="item"
          code={i.code}
          rows={[
            { key: "code", label: ti.code, value: i.code },
            { key: "name", label: ti.name, value: i.name },
            { key: "nameAr", label: ti.nameAr, value: <span dir="rtl">{i.nameAr ?? t.common.none}</span> },
            { key: "category", label: ti.category, value: i.category },
            { key: "uom", label: ti.uom, value: i.uom },
            { key: "taxCode", label: ti.taxCode, value: i.taxCode },
            { key: "unitPrice", label: ti.unitPrice, value: `${fmtNumber(i.unitPrice, "en-US", 4)} ${i.currency}` },
            { key: "active", label: ti.active, value: i.active ? t.common.yes : t.common.no },
          ]}
        />
      </div>
    </Page>
  );
}
