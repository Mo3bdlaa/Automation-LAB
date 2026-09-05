import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { documentFiles, documents, invoices, payments, receipts, vendors } from "@/db/schema";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { DocumentCard, Facts, LinkButton, Page } from "@/components/ui";
import { fmtNumber } from "@/lib/generator/money";
import { formatIban } from "@/lib/generator/iban";

export default async function PaymentDetailPage({ params }: { params: Promise<{ number: string }> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { number: raw } = await params;
  const number = decodeURIComponent(raw);
  const p = await session.tdb.one(payments, eq(payments.number, number));
  if (!p) notFound();
  const tc = t.cycle;
  const [inv, vendor, rc] = await Promise.all([
    session.tdb.one(invoices, eq(invoices.id, p.invoiceId)),
    p.vendorId ? session.tdb.one(vendors, eq(vendors.id, p.vendorId)) : null,
    session.tdb.one(receipts, eq(receipts.paymentId, p.id)),
  ]);
  const doc = rc ? await session.tdb.one(documents, and(eq(documents.kind, "receipt"), eq(documents.sourceId, rc.id))!) : null;
  const file = doc ? await session.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!) : null;
  return (
    <Page
      title={p.number}
      actions={
        <LinkButton testId="payment-back" href="/payments" variant="secondary">
          {tc.payments}
        </LinkButton>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Facts
            entity="payment"
            code={p.number}
            facts={[
              { key: "invoice", label: tc.invoice, value: inv ? <Link href={`/invoices/${encodeURIComponent(inv.internalNumber)}`}>{`${inv.internalNumber} · ${inv.number}`}</Link> : t.common.none },
              { key: "vendor", label: tc.vendor, value: vendor ? <Link href={`/vendors/${encodeURIComponent(vendor.code)}`}>{`${vendor.code} · ${vendor.name}`}</Link> : t.common.none },
              { key: "paidDate", label: tc.paidDate, value: p.paidDate },
              { key: "amount", label: tc.amount, value: <strong>{`${fmtNumber(p.amount)} ${p.currency}`}</strong> },
              { key: "method", label: tc.method, value: p.method.replace(/_/g, " ") },
              { key: "reference", label: tc.reference, value: p.reference },
              { key: "ibanPaidTo", label: tc.ibanPaidTo, value: formatIban(p.ibanPaidTo) },
              { key: "receipt", label: tc.receipt, value: rc ? `${rc.number} · ${rc.receiptDate}` : t.common.none },
            ]}
          />
        </div>
        <DocumentCard entity="receipt" documentId={doc?.id ?? null} file={file} labels={{ title: tc.receipt, download: t.common.download, rendering: t.common.rendering, notRendered: t.common.notRendered, filename: t.po.filename }} />
      </div>
    </Page>
  );
}
