import { createAccountsProvider } from "./accounts";
import { createLocalProvider } from "./local";
import type { IdentityProvider } from "./types";

export * from "./types";

/** True when people can sign themselves up, which the login page needs to know. */
export function selfServiceSignUp(): boolean {
  return identityProvider().id === "accounts";
}

let provider: IdentityProvider | null = null;

/**
 * The one place a provider is chosen. Adding WorkOS/Clerk/Auth0 or LTI 1.3
 * means adding a case here and a module beside ./local.ts. Nothing else changes.
 */
export function identityProvider(): IdentityProvider {
  if (provider) return provider;
  // The public challenge runs on self-service accounts; `local` stays for
  // development, where a fixture file is more convenient than a sign-up form.
  const which = process.env.IDENTITY_PROVIDER ?? (process.env.NODE_ENV === "production" ? "accounts" : "local");
  switch (which) {
    case "accounts":
      provider = createAccountsProvider();
      return provider;
    case "local":
      provider = createLocalProvider();
      return provider;
    default:
      throw new Error(`Unknown IDENTITY_PROVIDER "${which}". Implemented: accounts, local.`);
  }
}
