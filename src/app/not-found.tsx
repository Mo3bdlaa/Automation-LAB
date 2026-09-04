import { i18n } from "@/i18n/server";
import { Page } from "@/components/ui";

export default async function NotFound() {
  const { t } = await i18n();
  return (
    <Page title={t.errors.notFound}>
      <p id="not-found" data-testid="not-found">404</p>
    </Page>
  );
}
