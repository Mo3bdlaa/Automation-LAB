import { redirect } from "next/navigation";
import { i18n } from "@/i18n/server";
import { getPrincipal } from "@/lib/auth/server";
import { selfServiceSignUp } from "@/lib/identity";
import { AuthPanel } from "@/components/shell/auth-panel";
import { RegisterForm } from "./register-form";

/** Self-service sign-up. Only exists when the accounts provider is in use. */
export default async function RegisterPage() {
  const { t } = await i18n();
  if (await getPrincipal()) redirect("/");
  if (!selfServiceSignUp()) redirect("/login");
  return (
    <AuthPanel t={t} title={t.register.title} lead={t.register.intro}>
      <RegisterForm labels={t.register} />
    </AuthPanel>
  );
}
