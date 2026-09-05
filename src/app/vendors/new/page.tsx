import { eq } from "drizzle-orm";
import { vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page } from "@/components/ui";
import { VendorForm } from "../vendor-form";

export default async function VendorNewPage() {
  const { t } = await i18n();
  const session = await requireLab();
  // Student-created vendors are numbered from V-10001 so they never collide with the shared corpus.
  const [last] = await session.tdb.list(vendors, { where: eq(vendors.tenantId, session.tenant.id), orderBy: [{ column: vendors.code, direction: "desc" }], limit: 1 });
  const lastNum = last && /^V-(\d{5})$/.test(last.code) ? Number(last.code.slice(2)) : 10000;
  const suggested = `V-${String(Math.max(lastNum, 10000) + 1).padStart(5, "0")}`;
  return (
    <Page title={t.vendors.newVendor}>
      <VendorForm t={t} mode="create" vendor={null} suggestedCode={suggested} />
    </Page>
  );
}
