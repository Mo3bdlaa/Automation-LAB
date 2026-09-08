/**
 * Public accounts provider: people sign themselves up with an email, a password
 * and the name they want on a certificate. This is the provider the lab runs on
 * when the challenge is open to anyone.
 *
 * Passwords are scrypt hashes with a per-account salt, stored as
 * `scrypt$N$r$p$salt$hash`, so the parameters travel with the hash and can be
 * raised later without invalidating existing accounts. Comparison is constant
 * time. Nothing here is reversible, and a failed login never says which half
 * was wrong.
 *
 * Staff are not self-service: an email in STAFF_EMAILS gets the instructor role
 * on sign-up and on every resolve, so the list can change without a migration.
 */
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { Entitlement, IdentityProvider, Principal, Role } from "./types";

// promisify picks the three-argument overload, which drops the cost parameters.
const scrypt = promisify(scryptCb) as (password: string | Buffer, salt: string | Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Everyone who signs up gets access to the public challenge. */
function challengeEntitlement(): Entitlement {
  return { product: "automation-lab-challenge", labAccess: true, cohort: "public", role: "student", status: "active" };
}

function staffEmails(): Set<string> {
  return new Set(
    (process.env.STAFF_EMAILS ?? "")
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function rolesFor(email: string, stored: string[]): Role[] {
  const roles = new Set<Role>(stored.filter((r): r is Role => r === "student" || r === "ta" || r === "instructor"));
  if (staffEmails().has(email.toLowerCase())) roles.add("instructor");
  if (roles.size === 0) roles.add("student");
  return [...roles];
}

function toPrincipal(a: typeof schema.accounts.$inferSelect): Principal {
  const roles = rolesFor(a.email, a.roles);
  return {
    userId: a.userId,
    email: a.email,
    displayName: a.displayName,
    roles,
    entitlements: a.status === "active" ? [{ ...challengeEntitlement(), role: roles.includes("instructor") ? "instructor" : "student" }] : [],
  };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface RegistrationInput {
  email: string;
  password: string;
  displayName: string;
  alias?: string | null;
  location?: string | null;
}

export type RegistrationResult = { ok: true; principal: Principal } | { ok: false; field: string; message: string };

/** Rules a person can fix themselves, checked before anything is written. */
export function validateRegistration(input: RegistrationInput): { field: string; message: string } | null {
  const email = normaliseEmail(input.email);
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return { field: "email", message: "Enter an email address we can reach you at." };
  if (email.length > 160) return { field: "email", message: "That email address is too long." };
  if (input.password.length < MIN_PASSWORD_LENGTH) return { field: "password", message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (input.password.length > 200) return { field: "password", message: "That password is too long." };
  const name = input.displayName.trim();
  if (name.length < 2) return { field: "displayName", message: "Tell us the name you want on your certificate." };
  if (name.length > 80) return { field: "displayName", message: "That name is too long." };
  const alias = (input.alias ?? "").trim();
  if (alias && !/^[\p{L}\p{N} ._-]{2,32}$/u.test(alias)) return { field: "alias", message: "A leaderboard name is 2 to 32 letters, digits, spaces, dots, dashes or underscores." };
  return null;
}

export async function register(input: RegistrationInput): Promise<RegistrationResult> {
  const problem = validateRegistration(input);
  if (problem) return { ok: false, ...problem };
  const email = normaliseEmail(input.email);
  const [existing] = await db.select().from(schema.accounts).where(sql`lower(${schema.accounts.email}) = ${email}`);
  if (existing) return { ok: false, field: "email", message: "There is already an account with that email. Sign in instead." };
  const alias = (input.alias ?? "").trim();
  if (alias) {
    const [taken] = await db.select().from(schema.accounts).where(sql`lower(${schema.accounts.alias}) = ${alias.toLowerCase()}`);
    if (taken) return { ok: false, field: "alias", message: "That leaderboard name is taken. Pick another." };
  }
  const [row] = await db
    .insert(schema.accounts)
    .values({
      userId: `acct_${randomUUID()}`,
      email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName.trim(),
      alias: alias || null,
      location: (input.location ?? "").trim() || null,
      lastLoginAt: new Date(),
    })
    .returning();
  return { ok: true, principal: toPrincipal(row) };
}

/** The name shown publicly: the alias when there is one, the display name otherwise. */
export function publicName(a: { alias: string | null; displayName: string }): string {
  return a.alias?.trim() || a.displayName;
}

export async function accountFor(userId: string) {
  const [a] = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
  return a ?? null;
}

export async function updateAccount(userId: string, patch: { displayName?: string; alias?: string | null; location?: string | null }): Promise<{ field: string; message: string } | null> {
  const alias = patch.alias === undefined ? undefined : (patch.alias ?? "").trim() || null;
  if (alias) {
    if (!/^[\p{L}\p{N} ._-]{2,32}$/u.test(alias)) return { field: "alias", message: "A leaderboard name is 2 to 32 letters, digits, spaces, dots, dashes or underscores." };
    const [taken] = await db.select().from(schema.accounts).where(sql`lower(${schema.accounts.alias}) = ${alias.toLowerCase()} and ${schema.accounts.userId} <> ${userId}`);
    if (taken) return { field: "alias", message: "That leaderboard name is taken. Pick another." };
  }
  const name = patch.displayName?.trim();
  if (name !== undefined && (name.length < 2 || name.length > 80)) return { field: "displayName", message: "Tell us the name you want on your certificate." };
  await db
    .update(schema.accounts)
    .set({ ...(name !== undefined ? { displayName: name } : {}), ...(alias !== undefined ? { alias } : {}), ...(patch.location !== undefined ? { location: (patch.location ?? "").trim() || null } : {}) })
    .where(eq(schema.accounts.userId, userId));
  return null;
}

export function createAccountsProvider(): IdentityProvider {
  return {
    id: "accounts",
    loginFields: [
      { name: "email", label: "Email", type: "email" },
      { name: "password", label: "Password", type: "password" },
    ],
    async login(input) {
      const email = normaliseEmail(input.email ?? "");
      const [a] = await db.select().from(schema.accounts).where(sql`lower(${schema.accounts.email}) = ${email}`);
      // Hash anyway when the account is unknown, so a wrong email and a wrong
      // password take the same time and cannot be told apart.
      const stored = a?.passwordHash ?? (await hashPassword(randomBytes(24).toString("base64url")));
      const ok = await verifyPassword(input.password ?? "", stored);
      if (!a || !ok || a.status !== "active") return null;
      await db.update(schema.accounts).set({ lastLoginAt: new Date() }).where(eq(schema.accounts.userId, a.userId));
      return toPrincipal(a);
    },
    async resolve(userId) {
      const a = await accountFor(userId);
      return a ? toPrincipal(a) : null;
    },
  };
}
