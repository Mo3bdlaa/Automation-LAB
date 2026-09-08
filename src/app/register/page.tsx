import { redirect } from "next/navigation";
import { i18n } from "@/i18n/server";
import { getPrincipal } from "@/lib/auth/server";
import { selfServiceSignUp } from "@/lib/identity";
import { Page } from "@/components/ui";
import { RegisterForm } from "./register-form";

/** Self-service sign-up. Only exists when the accounts provider is in use. */
export default async function RegisterPage() {
  const { t } = await i18n();
  if (await getPrincipal()) redirect("/");
  if (!selfServiceSignUp()) redirect("/login");
  return (
    <Page title={t.register.title}>
      <p className="mb-4 max-w-xl text-sm text-muted">{t.register.intro}</p>
      <RegisterForm labels={t.register} />
    </Page>
  );
}
