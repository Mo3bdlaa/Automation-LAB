import { z } from "zod";
import { apiSession } from "@/lib/auth/server";
import { created, ok, readJson } from "@/lib/api/http";
import { createApiToken, listApiTokens } from "@/lib/api/tokens";

const Body = z.object({ name: z.string().min(1).max(80).default("token") });

export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const tokens = await listApiTokens(s.principal.userId);
  return ok({ tokens: tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null, revokedAt: t.revokedAt?.toISOString() ?? null })) });
}

/** The plaintext token is returned once and never again. */
export async function POST(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const parsed = await readJson(req, Body);
  if ("response" in parsed) return parsed.response;
  const { token, plaintext } = await createApiToken(s.principal.userId, parsed.data.name);
  return created({ token: { id: token.id, name: token.name, prefix: token.prefix, createdAt: token.createdAt.toISOString() }, plaintext, note: "Store this value now: it cannot be shown again." });
}
