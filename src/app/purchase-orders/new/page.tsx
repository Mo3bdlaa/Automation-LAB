import { eq } from "drizzle-orm";
import { costCenters, deliveryLocations, employees, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page } from "@/components/ui";
import { CORPUS_TODAY } from "@/lib/generator/dates";
import { PoForm } from "../po-form";

export default async function PoNewPage() {
  const { t } = await i18n();
  const session = await requireLab();
  const [vs, emps, ccs, dls] = await Promise.all([
    session.tdb.list(vendors, { where: eq(vendors.status, "active"), orderBy: [{ column: vendors.code }] }),
    session.tdb.list(employees, { orderBy: [{ column: employees.code }] }),
    session.tdb.list(costCenters, { orderBy: [{ column: costCenters.code }] }),
    session.tdb.list(deliveryLocations, { orderBy: [{ column: deliveryLocations.code }] }),
  ]);
  const emp = (role: string) => emps.filter((e) => e.role === role).map((e) => ({ value: e.code, label: `${e.code} · ${e.name}${e.approvalLimit ? ` (≤ ${Number(e.approvalLimit).toLocaleString("en-US")})` : ""}` }));
  return (
    <Page title={t.po.newPo}>
      <PoForm
        t={t}
        options={{
          vendors: vs.map((v) => ({ value: v.code, label: `${v.code} · ${v.name}` })),
          buyers: emp("buyer"),
          requesters: emp("requester"),
          approvers: emp("approver"),
          costCenters: ccs.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })),
          deliveryLocations: dls.map((d) => ({ value: d.code, label: `${d.code} · ${d.name}` })),
          today: CORPUS_TODAY,
        }}
      />
    </Page>
  );
}
