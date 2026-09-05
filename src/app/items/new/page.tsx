import { eq } from "drizzle-orm";
import { items } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page } from "@/components/ui";
import { ItemForm } from "../item-form";

export default async function ItemNewPage() {
  const { t } = await i18n();
  const session = await requireLab();
  const [last] = await session.tdb.list(items, { where: eq(items.tenantId, session.tenant.id), orderBy: [{ column: items.code, direction: "desc" }], limit: 1 });
  const lastNum = last && /^ITM-(\d{6})$/.test(last.code) ? Number(last.code.slice(4)) : 900000;
  const suggested = `ITM-${String(Math.max(lastNum, 900000) + 1).padStart(6, "0")}`;
  return (
    <Page title={t.items.newItem}>
      <ItemForm t={t} mode="create" item={null} suggestedCode={suggested} />
    </Page>
  );
}
