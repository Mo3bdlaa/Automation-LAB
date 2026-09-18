import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { documentFiles, documents, vendorDocuments, vendors } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Dl, Facts, Flash, LinkButton, Page, Section, Status, TableWrap } from "@/components/ui";
import { formatIban } from "@/lib/generator/iban";

export default async function VendorDetailPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const { code } = await params;
  const sp = await searchParams;
  const v = await session.tdb.one(vendors, eq(vendors.code, decodeURIComponent(code)));
  if (!v) notFound();
  const readOnly = session.tdb.isReadOnlyRow(vendors, v);
  const tv = t.vendors;
  const vdocs = await session.tdb.list(vendorDocuments, { where: eq(vendorDocuments.vendorId, v.id) });
  const docRows = vdocs.length ? await session.tdb.list(documents, { where: inArray(documents.sourceId, vdocs.map((d) => d.id)) }) : [];
  const files = docRows.length ? await session.tdb.list(documentFiles, { where: inArray(documentFiles.documentId, docRows.map((d) => d.id)) }) : [];
  /*
   * Split on purpose.
   *
   * Twenty-three fields in one flat list means the tax number a scenario turns
   * on sits between the SWIFT code and the star rating, and every record in
   * the system reads as an undifferentiated wall. The first six identify the
   * company and answer the question somebody opened the page with; the rest
   * are the file.
   *
   * Every key still appears exactly once across the two, because a key's cell
   * id is a published selector and rendering one twice would put a duplicate
   * id on the page.
   */
  const identity = [
    { key: "code", label: tv.code, value: <span className="mono">{v.code}</span> },
    { key: "taxId", label: tv.taxId, value: <span className="mono">{v.taxId}</span> },
    { key: "crNumber", label: tv.crNumber, value: <span className="mono">{v.crNumber}</span> },
    { key: "category", label: tv.category, value: v.category },
    { key: "paymentTermsDays", label: tv.paymentTermsDays, value: `${v.paymentTermsDays} ${t.common.days}` },
    { key: "city", label: tv.city, value: v.city },
  ];
  const rows = [
    { key: "name", label: tv.name, value: v.name },
    { key: "legalForm", label: tv.legalForm, value: v.legalForm },
    { key: "crExpiry", label: tv.crExpiry, value: v.crExpiry },
    { key: "taxCertExpiry", label: tv.taxCertExpiry, value: v.taxCertExpiry },
    { key: "iban", label: tv.iban, value: formatIban(v.iban) },
    { key: "bankName", label: tv.bankName, value: v.bankName },
    { key: "swift", label: tv.swift, value: v.swift },
    { key: "currency", label: tv.currency, value: v.currency },
    { key: "contactName", label: tv.contactName, value: v.contactName },
    { key: "email", label: tv.email, value: v.email },
    { key: "phone", label: tv.phone, value: v.phone },
    { key: "addressLine", label: tv.addressLine, value: v.addressLine },
    { key: "country", label: tv.country, value: v.country },
    { key: "rating", label: tv.rating, value: String(v.rating) },
    { key: "blacklisted", label: tv.blacklisted, value: v.blacklisted ? t.common.yes : t.common.no },
  ];
  return (
    <Page
      title={v.name}
      subtitle={v.nameAr ? <span dir="rtl">{v.nameAr}</span> : undefined}
      status={<Status status={v.status} testId={`vendor-status-${v.code}`} />}
      actions={
        <>
          {!readOnly ? (
            <LinkButton testId="vendor-edit" href={`/vendors/${encodeURIComponent(v.code)}/edit`}>
              {t.common.edit}
            </LinkButton>
          ) : null}
          <LinkButton testId="vendor-back" href="/vendors" variant="secondary">
            {tv.title}
          </LinkButton>
        </>
      }
    >
      <Flash status="success" message={sp.saved ? t.common.saved : null} />
      {readOnly ? (
        <p id="vendor-readonly" data-testid="vendor-readonly" className="mb-3 text-sm text-muted">
          {t.common.readOnly}
        </p>
      ) : null}
      <Facts entity="vendor" code={v.code} facts={identity} />
      <Section title={t.common.allFields} testId="vendor-all-fields">
        <div className="al-card" id={`vendor-detail-${v.code}`} data-testid={`vendor-detail-${v.code}`} data-shared={readOnly ? "1" : "0"}>
          <Dl rows={rows} entity="vendor" code={v.code} />
        </div>
      </Section>
      <div className="mt-5">
        <Section title={t.cycle.complianceDocuments} testId="vendor-compliance-documents">
          <TableWrap>
            <table id="vendor-documents-table" data-testid="vendor-documents-table" className="al-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>{t.cycle.number}</th>
                  <th>{t.cycle.issueDate}</th>
                  <th>Expiry</th>
                  <th>Issuer</th>
                  <th>{t.po.document}</th>
                </tr>
              </thead>
              <tbody>
                {vdocs.map((d) => {
                  const doc = docRows.find((x) => x.sourceId === d.id);
                  const f = doc ? files.find((x) => x.documentId === doc.id) : null;
                  return (
                    <tr key={d.id} id={`vendor-documents-row-${d.kind}`} data-testid={`vendor-documents-row-${d.kind}`} data-kind={d.kind} data-document-id={doc?.id ?? ""} data-expired={d.expiryDate < "2026-09-01" ? "1" : "0"}>
                      <td>{d.kind.replace("vendor_", "").replace(/_/g, " ")}</td>
                      <td id={`vendor-documents-cell-${d.kind}-number`} data-testid={`vendor-documents-cell-${d.kind}-number`}>{d.number}</td>
                      <td>{d.issuedDate}</td>
                      <td id={`vendor-documents-cell-${d.kind}-expiry`} data-testid={`vendor-documents-cell-${d.kind}-expiry`}>{d.expiryDate}</td>
                      <td>{d.issuer}</td>
                      <td>
                        {doc ? (
                          <a id={`vendor-documents-download-${d.kind}`} data-testid={`vendor-documents-download-${d.kind}`} href={`/api/documents/${doc.id}/file`} download={f?.filename ?? true} className="underline">
                            {t.common.download}
                          </a>
                        ) : (
                          t.common.none
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Section>
      </div>
    </Page>
  );
}
