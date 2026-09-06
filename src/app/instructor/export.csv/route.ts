import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { apiSession } from "@/lib/auth/server";
import { isStaff } from "@/lib/identity";
import { problem } from "@/lib/api/http";

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Cohort export for the gradebook. Staff only. */
export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  if (!isStaff(s.principal)) return problem(403, "forbidden", "Instructors and teaching assistants only.");

  const tenants = await db.select().from(schema.tenants).where(eq(schema.tenants.kind, "student"));
  const users = await db.select().from(schema.users);
  const ids = tenants.map((t) => t.id);
  const extractions = ids.length ? await db.select().from(schema.extractions).where(inArray(schema.extractions.tenantId, ids)) : [];
  const invoiceCounts = ids.length
    ? await db.select({ tenantId: schema.invoices.tenantId, n: sql<number>`count(*)` }).from(schema.invoices).where(inArray(schema.invoices.tenantId, ids)).groupBy(schema.invoices.tenantId)
    : [];

  const header = ["userId", "displayName", "email", "sandboxStatus", "resets", "invoices", "extractions", "averageScore", "bestScore", "defectsCaught", "defectsMissed", "falsePositives", "lastActivity"];
  const lines = [header.join(",")];
  for (const tenant of tenants) {
    const user = users.find((u) => u.id === tenant.ownerUserId);
    const mine = extractions.filter((e) => e.tenantId === tenant.id);
    const scores = mine.filter((e) => e.score !== null).map((e) => Number(e.score));
    const last = mine.reduce<Date | null>((a, e) => (a && a > e.submittedAt ? a : e.submittedAt), null);
    lines.push(
      [
        tenant.ownerUserId ?? "",
        user?.displayName ?? tenant.slug,
        user?.email ?? "",
        tenant.status,
        tenant.resetCount,
        Number(invoiceCounts.find((i) => i.tenantId === tenant.id)?.n ?? 0),
        mine.length,
        scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4) : "",
        scores.length ? Math.max(...scores).toFixed(4) : "",
        mine.reduce((a, e) => a + (e.matchResult?.defects?.caught.length ?? 0), 0),
        mine.reduce((a, e) => a + (e.matchResult?.defects?.missed.length ?? 0), 0),
        mine.reduce((a, e) => a + (e.matchResult?.defects?.falsePositives.length ?? 0), 0),
        last ? last.toISOString() : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="automation-lab-cohort.csv"', "Cache-Control": "no-store" },
  });
}
