import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { recentJobs } from "@/lib/jobs/queue";
import { sandboxProgress } from "@/lib/sandbox/lifecycle";
import { Button, Dl, Flash, Page, Pill } from "@/components/ui";
import { createTokenAction, regenerateBotPasswordAction, resetSandboxAction, revokeTokenAction } from "./actions";
import { botCredentialFor } from "@/lib/identity/accounts";
import { personUserId } from "@/lib/identity/types";
import { listApiTokens } from "@/lib/api/tokens";
import { LinkButton, Input, Section, TableWrap } from "@/components/ui";

export default async function SandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await i18n();
  const session = await requireLab();
  const sp = await searchParams;
  const [progress, jobs, tokens, bot] = await Promise.all([
    sandboxProgress(session.tenant),
    recentJobs(session.tenant.id, 15),
    listApiTokens(session.principal.userId),
    botCredentialFor(personUserId(session.principal)),
  ]);
  const newToken = typeof sp.token === "string" ? sp.token : null;
  const newBotPassword = typeof sp.bot === "string" ? sp.bot : null;
  const tt = t.tokens;
  const tb = t.botCredential;
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
      <Section title={tb.title} testId="bot-credential">
        <p className="mb-2 max-w-3xl text-sm text-muted">{tb.intro}</p>
        {bot ? (
          <>
            <p className="text-sm">
              <span className="text-muted">{tb.email}: </span>
              <code id="bot-email" data-testid="bot-email">{bot.email}</code>
            </p>
            {newBotPassword ? (
              <div id="new-bot-password" data-testid="new-bot-password" className="flash my-3" data-status="success">
                <div className="mb-1 font-semibold">{tb.plaintextWarning}</div>
                <code id="new-bot-password-value" data-testid="new-bot-password-value" className="break-all">
                  {newBotPassword}
                </code>
              </div>
            ) : null}
            <form action={regenerateBotPasswordAction} className="mt-3">
              <Button testId="bot-password-regenerate" variant="secondary">
                {newBotPassword ? tb.regenerate : tb.reveal}
              </Button>
            </form>
          </>
        ) : (
          <form action={regenerateBotPasswordAction}>
            <Button testId="bot-password-regenerate">{tb.create}</Button>
          </form>
        )}
      </Section>

      <Section
        title={tt.title}
        testId="api-tokens"
        actions={
          <LinkButton testId="api-docs-link" href="/api/docs" variant="secondary">
            {tt.docs}
          </LinkButton>
        }
      >
        <p className="mb-2 max-w-3xl text-sm text-muted">{tt.intro}</p>
        {newToken ? (
          <div id="new-token" data-testid="new-token" className="flash mb-3" data-status="success">
            <div className="mb-1 font-semibold">{tt.plaintextWarning}</div>
            <code id="new-token-value" data-testid="new-token-value" className="break-all">
              {newToken}
            </code>
          </div>
        ) : null}
        <form action={createTokenAction} className="mb-3 flex flex-wrap items-end gap-2">
          <div className="w-64">
            <label htmlFor="token-name" className="al-label">
              {tt.name}
            </label>
            <Input testId="token-name" name="name" placeholder="UiPath performer" />
          </div>
          <Button testId="token-create">{tt.create}</Button>
        </form>
        <TableWrap>
          <table id="tokens-table" data-testid="tokens-table" className="al-table">
            <thead>
              <tr>
                <th>{tt.name}</th>
                <th>{tt.prefix}</th>
                <th>{tt.created}</th>
                <th>{tt.lastUsed}</th>
                <th>{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((tok) => (
                <tr key={tok.id} id={`tokens-row-${tok.id}`} data-testid={`tokens-row-${tok.id}`} data-revoked={tok.revokedAt ? "1" : "0"}>
                  <td>{tok.name}</td>
                  <td>
                    <code>al_{tok.prefix}…</code>
                  </td>
                  <td>{tok.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{tok.lastUsedAt ? tok.lastUsedAt.toISOString().slice(0, 16).replace("T", " ") : t.common.none}</td>
                  <td>
                    {tok.revokedAt ? (
                      <span className="text-muted">{tt.revoked}</span>
                    ) : (
                      <form action={revokeTokenAction}>
                        <input type="hidden" name="id" value={tok.id} />
                        <Button testId={`token-revoke-${tok.id}`} variant="danger">
                          {tt.revoke}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted" data-testid="tokens-empty">
                    {tt.none}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableWrap>
      </Section>

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
