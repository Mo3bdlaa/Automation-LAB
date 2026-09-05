/**
 * Local credentials provider. Development only. Users live in
 * config/local-users.json with plain-text passwords; that file is a fixture,
 * not a secret store, and the provider refuses to start in production.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { IdentityProvider, Principal, Role, Entitlement } from "./types";

interface LocalUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  roles: Role[];
  entitlements: Entitlement[];
}

function loadUsers(): LocalUser[] {
  const file = process.env.LOCAL_USERS_FILE ?? path.join(process.cwd(), "config", "local-users.json");
  return JSON.parse(readFileSync(file, "utf8")) as LocalUser[];
}

function toPrincipal(u: LocalUser): Principal {
  return { userId: u.id, email: u.email, displayName: u.displayName, roles: u.roles, entitlements: u.entitlements };
}

export function createLocalProvider(): IdentityProvider {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_IDENTITY_IN_PROD !== "1") {
    throw new Error("The local identity provider is for development only. Set IDENTITY_PROVIDER to a real provider.");
  }
  return {
    id: "local",
    loginFields: [
      { name: "email", label: "Email", type: "email" },
      { name: "password", label: "Password", type: "password" },
    ],
    async login(input) {
      const email = (input.email ?? "").trim().toLowerCase();
      const u = loadUsers().find((x) => x.email.toLowerCase() === email);
      if (!u || u.password !== input.password) return null;
      return toPrincipal(u);
    },
    async resolve(userId) {
      const u = loadUsers().find((x) => x.id === userId);
      return u ? toPrincipal(u) : null;
    },
  };
}
