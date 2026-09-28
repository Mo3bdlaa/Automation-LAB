import { eq } from "drizzle-orm";
import { items, purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page } from "@/components/ui";
import { CORPUS_TODAY, addDays } from "@/lib/generator/dates";
import { InvoiceForm, type InvoiceEntryDefaults } from "../invoice-form";

/**
 * Accounts payable invoice entry.
 *
 * `?po=` prefills everything the order already knows — vendor, currency, the
 * lines with their quantities and prices — because the exercise worth setting
 * is "change one figure and see which rule catches it", not "type an invoice
 * from scratch".
 */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const poNumber = (Array.isArray(sp.po) ? sp.po[0] : sp.po)?.toUpperCase() ?? "";

  const vs = await session.tdb.list(vendors, { where: eq(vendors.status, "active"), orderBy: [{ column: vendors.code }] });
  const po = poNumber ? await session.tdb.one(purchaseOrders, eq(purchaseOrders.number, poNumber)) : null;
  const vendor = po ? await session.tdb.one(vendors, eq(vendors.id, po.vendorId)) : null;
  const poLines = po ? await session.tdb.list(purchaseOrderLines, { where: eq(purchaseOrderLines.purchaseOrderId, po.id), orderBy: [{ column: purchaseOrderLines.lineNo }] }) : [];
  const itemRows = poLines.length ? await session.tdb.list(items, { where: eq(items.active, true) }) : [];

  const defaults: InvoiceEntryDefaults = {
    poNumber: po?.number ?? poNumber,
    vendorCode: vendor?.code ?? "",
    currency: po?.currency ?? vendor?.currency ?? "SAR",
    invoiceDate: CORPUS_TODAY,
    dueDate: addDays(CORPUS_TODAY, vendor?.paymentTermsDays ?? 30),
    printedVendorName: vendor?.name ?? "",
    printedVendorTaxId: vendor?.taxId ?? "",
    printedIban: vendor?.iban ?? "",
    printedBankName: vendor?.bankName ?? "",
    lines: poLines.map((l) => ({
      itemCode: itemRows.find((i) => i.id === l.itemId)?.code ?? "",
      description: l.description,
      quantity: String(Number(l.quantity)),
      uom: l.uom,
      unitPrice: String(Number(l.unitPrice)),
      discountPct: String(Number(l.discountPct)),
      taxCode: l.taxCode,
    })),
  };

  return (
    <Page title={t.cycle.recordInvoice} subtitle={po ? `${t.po.number} ${po.number}` : undefined}>
      <InvoiceForm t={t} vendors={vs.map((v) => ({ value: v.code, label: `${v.code} · ${v.name}` }))} defaults={defaults} />
    </Page>
  );
}
