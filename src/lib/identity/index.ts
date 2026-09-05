import { createLocalProvider } from "./local";
import type { IdentityProvider } from "./types";

export * from "./types";

let provider: IdentityProvider | null = null;

/**
 * The one place a provider is chosen. Adding WorkOS/Clerk/Auth0 or LTI 1.3
 * means adding a case here and a module beside ./local.ts. Nothing else changes.
 */
export function identityProvider(): IdentityProvider {
  if (provider) return provider;
  const which = process.env.IDENTITY_PROVIDER ?? "local";
  switch (which) {
    case "local":
      provider = createLocalProvider();
      return provider;
    default:
      throw new Error(`Unknown IDENTITY_PROVIDER "${which}". Implemented: local.`);
  }
}
