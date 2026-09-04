/**
 * Identity boundary. mohammedshaker.com owns identity; the lab is a relying
 * party. The application only ever consumes a `Principal`. Which provider
 * produces it (local credentials, WorkOS/Clerk/Auth0, LTI 1.3) is decided
 * in ./index.ts and nowhere else.
 */

export const ROLES = ["student", "ta", "instructor"] as const;
export type Role = (typeof ROLES)[number];

export interface Entitlement {
  /** Course product code, e.g. "rpa-fundamentals-2026-q1". */
  product: string;
  labAccess: boolean;
  cohort: string;
  role: Role;
  status: "active" | "expired" | "revoked";
  startsAt?: string;
  endsAt?: string;
}

export interface Principal {
  userId: string;
  email: string;
  displayName: string;
  roles: Role[];
  entitlements: Entitlement[];
}

export interface LoginField {
  name: string;
  label: string;
  type: "text" | "email" | "password";
}

export interface IdentityProvider {
  readonly id: string;
  /** Fields the login page should render. Absent for redirect-based providers. */
  readonly loginFields?: LoginField[];
  /** Redirect-based providers return the URL to send the browser to. */
  authorizeUrl?(returnTo: string): Promise<string>;
  /** Credentials or callback payload → principal, or null if rejected. */
  login(input: Record<string, string>): Promise<Principal | null>;
  /** Re-resolve a principal from its id so entitlement changes take effect on the next request. */
  resolve(userId: string): Promise<Principal | null>;
}

export function hasLabAccess(p: Principal): boolean {
  return p.roles.includes("instructor") || p.roles.includes("ta") || p.entitlements.some((e) => e.labAccess && e.status === "active");
}

export function isStaff(p: Principal): boolean {
  return p.roles.includes("instructor") || p.roles.includes("ta");
}
