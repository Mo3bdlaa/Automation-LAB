import { sql } from "drizzle-orm";
import { extractions } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { ok } from "@/lib/api/http";
import { sandboxProgress } from "@/lib/sandbox/lifecycle";
import { isStaff } from "@/lib/identity";

/** Who am I, what is my sandbox doing, and how am I scoring. */
export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const progress = await sandboxProgress(s.tenant);
  const graded = await s.tdb.list(extractions, { where: sql`${extractions.score} is not null`, orderBy: [{ column: extractions.submittedAt, direction: "desc" }], limit: 200 });
  const scores = graded.map((g) => Number(g.score));
  const caught = graded.reduce((a, g) => a + (g.matchResult?.defects?.caught.length ?? 0), 0);
  const missed = graded.reduce((a, g) => a + (g.matchResult?.defects?.missed.length ?? 0), 0);
  return ok({
    user: { id: s.principal.userId, email: s.principal.email, displayName: s.principal.displayName, roles: s.principal.roles, staff: isStaff(s.principal) },
    entitlements: s.principal.entitlements,
    sandbox: { tenantId: s.tenant.id, status: s.tenant.status, progress: s.tenant.progress, seed: s.tenant.seed, resetCount: s.tenant.resetCount, documents: progress.documents, rendered: progress.rendered },
    score: {
      extractions: graded.length,
      averageScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10000) / 10000 : null,
      bestScore: scores.length ? Math.max(...scores) : null,
      defectsCaught: caught,
      defectsMissed: missed,
    },
  });
}
