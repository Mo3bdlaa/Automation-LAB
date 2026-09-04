import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page } from "@/components/ui";
import { VendorForm } from "../../vendor-form";

export default async function VendorEditPage({ params }: { params: Promise<{ code: string }> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { code } = await params;
  const v = await session.tdb.one(vendors, eq(vendors.code, decodeURIComponent(code)));
  if (!v) notFound();
  if (session.tdb.isReadOnlyRow(v)) redirect(`/vendors/${encodeURIComponent(v.code)}`);
  return (
    <Page title={`${t.vendors.editVendor} · ${v.code}`}>
      <VendorForm t={t} mode="edit" vendor={v} />
    </Page>
  );
}
