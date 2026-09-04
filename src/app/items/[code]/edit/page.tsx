import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { items } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page } from "@/components/ui";
import { ItemForm } from "../../item-form";

export default async function ItemEditPage({ params }: { params: Promise<{ code: string }> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { code } = await params;
  const i = await session.tdb.one(items, eq(items.code, decodeURIComponent(code)));
  if (!i) notFound();
  if (session.tdb.isReadOnlyRow(i)) redirect(`/items/${encodeURIComponent(i.code)}`);
  return (
    <Page title={`${t.items.editItem} · ${i.code}`}>
      <ItemForm t={t} mode="edit" item={i} />
    </Page>
  );
}
