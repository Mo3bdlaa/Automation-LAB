/**
 * Personal API tokens for bots. The plaintext is shown once at creation; only
 * its SHA-256 hash is stored, so a leaked database cannot be used to call the
 * API. Tokens are scoped to the user, and therefore to that user's sandbox.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { ApiToken } from "@/db/schema";

export const TOKEN_PREFIX = "al";

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** `al_<8-char id>_<43-char secret>`. The middle part is stored for display. */
export function generateToken(): { plaintext: string; prefix: string; tokenHash: string } {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}_${prefix}_${secret}`;
  return { plaintext, prefix, tokenHash: hashToken(plaintext) };
}

export async function createApiToken(userId: string, name: string) {
  const { plaintext, prefix, tokenHash } = generateToken();
  const [row] = await db.insert(schema.apiTokens).values({ userId, name: name.slice(0, 80) || "token", prefix, tokenHash }).returning();
  return { token: row, plaintext };
}

export async function listApiTokens(userId: string): Promise<ApiToken[]> {
  return db.select().from(schema.apiTokens).where(eq(schema.apiTokens.userId, userId)).orderBy(desc(schema.apiTokens.createdAt));
}

export async function revokeApiToken(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(schema.apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId), isNull(schema.apiTokens.revokedAt)))
    .returning({ id: schema.apiTokens.id });
  return rows.length > 0;
}

/** Resolves an `Authorization: Bearer` value to a user id, or null. */
export async function userIdForToken(plaintext: string): Promise<string | null> {
  if (!plaintext.startsWith(`${TOKEN_PREFIX}_`)) return null;
  const hash = hashToken(plaintext);
  const [row] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, hash));
  if (!row || row.revokedAt) return null;
  // Constant-time compare on the stored hash as well, so a timing signal cannot confirm a guess.
  const a = Buffer.from(row.tokenHash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  await db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.id));
  return row.userId;
}
