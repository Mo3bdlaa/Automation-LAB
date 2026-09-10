import Link from "next/link";
import { redirect } from "next/navigation";
import { i18n } from "@/i18n/server";
import { getPrincipal } from "@/lib/auth/server";
import { identityProvider, selfServiceSignUp } from "@/lib/identity";
import { Page } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { t } = await i18n();
  if (await getPrincipal()) redirect("/");
  const provider = identityProvider();
  if (provider.authorizeUrl) redirect(await provider.authorizeUrl("/"));
  return (
    <Page title={t.login.title}>
      <p className="mb-4 max-w-xl text-sm text-muted">{t.login.intro}</p>
      <LoginForm fields={provider.loginFields ?? []} labels={{ submit: t.login.submit, failed: t.login.failed, noAccess: t.login.noAccess, tooMany: t.login.tooMany }} />
      {selfServiceSignUp() ? (
        <p className="mt-4 text-sm" id="login-register-link" data-testid="login-register-link">
          {t.login.noAccount} <Link href="/register">{t.login.createOne}</Link>
        </p>
      ) : null}
      {provider.id === "local" ? (
        <p className="mt-4 text-xs text-muted" id="login-dev-hint" data-testid="login-dev-hint">
          {t.login.devHint}
        </p>
      ) : null}
    </Page>
  );
}
