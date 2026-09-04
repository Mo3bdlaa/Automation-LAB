import { i18n } from "@/i18n/server";
import { Page } from "@/components/ui";

export default async function NoAccessPage() {
  const { t } = await i18n();
  return (
    <Page title={t.errors.forbidden}>
      <p id="no-access" data-testid="no-access" className="text-sm text-muted">
        {t.login.noAccess}
      </p>
    </Page>
  );
}
