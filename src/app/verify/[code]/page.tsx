import { notFound } from "next/navigation";
import { i18n } from "@/i18n/server";
import { LinkButton, Page } from "@/components/ui";
import { formatDuration } from "@/components/challenge";
import { certificateByCode } from "@/lib/challenge/certificate";
import { CERTIFICATE_ISSUER_NOTE } from "@/lib/challenge/certificate-template";

export const dynamic = "force-dynamic";

/**
 * Public verification. Someone handed a certificate should be able to check it
 * without an account, and see exactly what it claims - no more than that.
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { t } = await i18n();
  const tc = t.challenge;
  const { code } = await params;
  const facts = await certificateByCode(decodeURIComponent(code).toUpperCase());
  if (!facts) notFound();

  return (
    <Page
      title={tc.certificate}
      subtitle={facts.code}
      actions={
        <LinkButton testId="verify-download" href={`/verify/${facts.code}/certificate.pdf`} download={`automation-lab-certificate-${facts.code}.pdf`}>
          {tc.downloadCertificate}
        </LinkButton>
      }
    >
      <section className="al-card" id="verify-certificate" data-testid="verify-certificate" data-code={facts.code} data-valid="1" data-score={facts.score}>
        <p className="mb-4 text-lg">
          <strong id="verify-name" data-testid="verify-name">
            {facts.name}
          </strong>{" "}
          completed <strong id="verify-scenario" data-testid="verify-scenario">{facts.scenarioTitle}</strong> with a score of{" "}
          <strong id="verify-score" data-testid="verify-score">
            {facts.score.toFixed(1)} / 100
          </strong>{" "}
          on {facts.issuedAt.toISOString().slice(0, 10)}.
        </p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <div>
            <dt className="text-muted">{tc.passMark}</dt>
            <dd>{facts.passMark} / 100</dd>
          </div>
          <div>
            <dt className="text-muted">{tc.items}</dt>
            <dd>
              {facts.itemsProcessed} / {facts.itemsInScope}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{tc.level}</dt>
            <dd>{facts.level}</dd>
          </div>
          <div>
            <dt className="text-muted">{tc.duration}</dt>
            <dd>{formatDuration(facts.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-muted">{tc.dataset}</dt>
            <dd id="verify-dataset" data-testid="verify-dataset" data-version={facts.datasetVersion}>
              {facts.datasetVersion}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted" id="verify-note" data-testid="verify-note">
          {CERTIFICATE_ISSUER_NOTE}
        </p>
      </section>
    </Page>
  );
}
