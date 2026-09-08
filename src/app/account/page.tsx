import { redirect } from "next/navigation";
import { i18n } from "@/i18n/server";
import { requirePrincipal } from "@/lib/auth/server";
import { accountFor } from "@/lib/identity/accounts";
import { selfServiceSignUp } from "@/lib/identity";
import { Page, Section } from "@/components/ui";
import { AccountForm } from "./account-form";

export const dynamic = "force-dynamic";

/** What a participant can change about themselves: the name on the certificate,
 *  the name on the leaderboard, and where they are from. */
export default async function AccountPage() {
  const { t } = await i18n();
  const principal = await requirePrincipal();
  if (!selfServiceSignUp()) redirect("/");
  const account = await accountFor(principal.userId);
  if (!account) redirect("/login");
  return (
    <Page title={t.account.title} subtitle={t.account.intro}>
      <Section title={t.account.profile} testId="account-profile">
        <p className="mb-3 text-sm text-muted">
          {t.account.email}: <code id="account-email" data-testid="account-email">{account.email}</code>
        </p>
        <AccountForm
          labels={{
            displayName: t.register.displayName,
            displayNameHint: t.register.displayNameHint,
            alias: t.register.alias,
            aliasHint: t.register.aliasHint,
            location: t.register.location,
            locationHint: t.register.locationHint,
            save: t.account.save,
            saved: t.account.saved,
          }}
          initial={{ displayName: account.displayName, alias: account.alias ?? "", location: account.location ?? "" }}
        />
      </Section>
    </Page>
  );
}
