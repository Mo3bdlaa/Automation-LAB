import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { recentJobs } from "@/lib/jobs/queue";
import { sandboxProgress } from "@/lib/sandbox/lifecycle";
import { Button, Dl, Flash, Page, Pill } from "@/components/ui";
import { resetSandboxAction } from "./actions";

export default async function SandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const [progress, jobs] = await Promise.all([sandboxProgress(session.tenant), recentJobs(session.tenant.id, 15)]);
  const ts = t.sandbox;
  const busy = session.tenant.status === "provisioning";
  return (
    <Page title={ts.title}>
      {busy ? <meta httpEquiv="refresh" content="3" /> : null}
      <Flash status="info" message={sp.reset ? ts.resetQueued : null} />
      <p className="mb-4 max-w-3xl text-sm text-muted">{ts.intro}</p>
      <div className="al-card mb-4" id="sandbox-detail" data-testid="sandbox-detail" data-status={session.tenant.status}>
        <Dl
          entity="sandbox"
          code="me"
          rows={[
            { key: "status", label: ts.status, value: <Pill testId="sandbox-status-pill">{session.tenant.status}</Pill> },
            { key: "progress", label: "Progress", value: `${session.tenant.progress}% · ${session.tenant.statusMessage ?? ""}` },
            { key: "documents", label: "PDFs", value: `${progress.rendered}/${progress.documents}` },
            { key: "seed", label: ts.seed, value: <code>{session.tenant.seed}</code> },
            { key: "tenantId", label: ts.tenantId, value: <code>{session.tenant.id}</code> },
            { key: "resetCount", label: ts.resetCount, value: String(session.tenant.resetCount) },
            { key: "provisionedAt", label: ts.provisionedAt, value: session.tenant.provisionedAt?.toISOString() ?? t.common.none },
          ]}
        />
        <form action={resetSandboxAction} className="mt-4">
          <p className="mb-2 text-xs text-muted">{ts.resetConfirm}</p>
          <Button testId="sandbox-reset" variant="danger" disabled={busy}>
            {ts.reset}
          </Button>
        </form>
      </div>
      <h2 className="mb-2 font-semibold text-primary">{ts.jobs}</h2>
      <div className="overflow-x-auto">
        <table id="jobs-table" data-testid="jobs-table" className="al-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Created</th>
              <th>Finished</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} id={`jobs-row-${j.id}`} data-testid={`jobs-row-${j.id}`} data-status={j.status} data-kind={j.kind}>
                <td>{j.kind}</td>
                <td>
                  <Pill>{j.status}</Pill>
                </td>
                <td>{j.attempts}</td>
                <td>{j.createdAt.toISOString()}</td>
                <td>{j.finishedAt?.toISOString() ?? t.common.none}</td>
                <td className="max-w-md truncate text-xs text-error">{j.error?.split("\n")[0] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
