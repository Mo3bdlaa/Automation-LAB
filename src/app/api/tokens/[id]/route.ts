import { apiSession } from "@/lib/auth/server";
import { notFound, ok } from "@/lib/api/http";
import { revokeApiToken } from "@/lib/api/tokens";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const revoked = await revokeApiToken(s.principal.userId, id);
  return revoked ? ok({ revoked: true, id }) : notFound("Token");
}
