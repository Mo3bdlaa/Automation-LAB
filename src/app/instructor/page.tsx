import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { isStaff } from "@/lib/identity";
import { Button, LinkButton, Page, Section, Status, TableWrap, Toolbar } from "@/components/ui";
import { LEVELS, LEVEL_SPECS } from "@/lib/documents/levels";
import { defaultLevel } from "@/lib/lab-settings";
import { setDefaultLevelAction } from "./actions";

export const dynamic = "force-dynamic";

interface Row {
  userId: string;
  displayName: string;
  email: string;
  tenantId: string;
  status: string;
  resetCount: number;
  documents: number;
  rendered: number;
  extractions: number;
  averageScore: number | null;
  bestScore: number | null;
  /** Average score per difficulty level, so the ladder shows in the numbers. */
  byLevel: Record<number, { extractions: number; averageScore: number }>;
  caught: number;
  missed: number;
  falsePositives: number;
  invoicesProcessed: number;
  lastActivity: string | null;
}

/**
 * Cohort view for instructors and TAs. It reads across every student tenant, so
 * it uses the raw client rather than a tenant-scoped one, and is gated on role.
 */
export default async function InstructorPage() {
  const { t } = await i18n();
  const session = await requireLab();
  if (!isStaff(session.principal)) redirect("/");
  const ti = t.instructor;

  const tenants = await db.select().from(schema.tenants).where(eq(schema.tenants.kind, "student"));
  const users = await db.select().from(schema.users);
  const ids = tenants.map((x) => x.id);

  const docCounts = ids.length
    ? await db.select({ tenantId: schema.documents.tenantId, n: sql<number>`count(*)` }).from(schema.documents).where(inArray(schema.documents.tenantId, ids)).groupBy(schema.documents.tenantId)
    : [];
  const fileCounts = ids.length
    // Level 1 only, so a student downloading degraded scans does not read as
    // more documents rendered than the sandbox holds.
    ? await db.select({ tenantId: schema.documentFiles.tenantId, n: sql<number>`count(*)` }).from(schema.documentFiles).where(and(inArray(schema.documentFiles.tenantId, ids), eq(schema.documentFiles.level, 1))).groupBy(schema.documentFiles.tenantId)
    : [];
  const invoiceCounts = ids.length
    ? await db
        .select({ tenantId: schema.invoices.tenantId, n: sql<number>`count(*)` })
        .from(schema.invoices)
        .where(and(inArray(schema.invoices.tenantId, ids), inArray(schema.invoices.status, ["matched", "exception", "approved", "rejected", "paid"])))
        .groupBy(schema.invoices.tenantId)
    : [];
  const allExtractions = ids.length ? await db.select().from(schema.extractions).where(inArray(schema.extractions.tenantId, ids)) : [];
  const cohortLevel = await defaultLevel();

  const rows: Row[] = tenants
    .map((tenant) => {
      const user = users.find((u) => u.id === tenant.ownerUserId);
      const mine = allExtractions.filter((e) => e.tenantId === tenant.id);
      const graded = mine.filter((e) => e.score !== null);
      const scores = graded.map((e) => Number(e.score));
      const last = mine.reduce<Date | null>((a, e) => (a && a > e.submittedAt ? a : e.submittedAt), null);
      return {
        userId: tenant.ownerUserId ?? "",
        displayName: user?.displayName ?? tenant.slug,
        email: user?.email ?? "",
        tenantId: tenant.id,
        status: tenant.status,
        resetCount: tenant.resetCount,
        documents: Number(docCounts.find((d) => d.tenantId === tenant.id)?.n ?? 0),
        rendered: Number(fileCounts.find((d) => d.tenantId === tenant.id)?.n ?? 0),
        extractions: mine.length,
        averageScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000 : null,
        bestScore: scores.length ? Math.max(...scores) : null,
        byLevel: Object.fromEntries(
          LEVELS.map((l) => {
            const at = graded.filter((e) => e.level === l).map((e) => Number(e.score));
            return [l, { extractions: at.length, averageScore: at.length ? at.reduce((a, b) => a + b, 0) / at.length : 0 }];
          }).filter(([, v]) => (v as { extractions: number }).extractions > 0),
        ),
        caught: mine.reduce((a, e) => a + (e.matchResult?.defects?.caught.length ?? 0), 0),
        missed: mine.reduce((a, e) => a + (e.matchResult?.defects?.missed.length ?? 0), 0),
        falsePositives: mine.reduce((a, e) => a + (e.matchResult?.defects?.falsePositives.length ?? 0), 0),
        invoicesProcessed: Number(invoiceCounts.find((d) => d.tenantId === tenant.id)?.n ?? 0),
        lastActivity: last ? last.toISOString().slice(0, 16).replace("T", " ") : null,
      };
    })
    .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || a.displayName.localeCompare(b.displayName));

  const cohortScores = rows.map((r) => r.averageScore).filter((s): s is number => s !== null);
  const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

  return (
    <Page
      title={ti.title}
      subtitle={ti.intro}
      actions={
        <LinkButton testId="instructor-export" href="/instructor/export.csv" variant="secondary">
          {ti.exportCsv}
        </LinkButton>
      }
    >
      <Section title={ti.cohortSummary} testId="instructor-summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["students", String(rows.length)],
            ["averageScore", cohortScores.length ? pct(cohortScores.reduce((a, b) => a + b, 0) / cohortScores.length) : "—"],
            ["extractions", String(rows.reduce((a, r) => a + r.extractions, 0))],
            ["defectsCaught", `${rows.reduce((a, r) => a + r.caught, 0)} / ${rows.reduce((a, r) => a + r.caught + r.missed, 0)}`],
          ].map(([key, value]) => (
            <div key={key} className="al-card" id={`instructor-stat-${key}`} data-testid={`instructor-stat-${key}`} data-value={value}>
              <div className="text-xs uppercase tracking-wide text-muted">{key === "students" ? ti.student : key === "averageScore" ? ti.averageScore : key === "extractions" ? ti.extractions : ti.defectsCaught}</div>
              <div className="mt-1 text-2xl font-light text-primary">{value}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={ti.difficulty} testId="instructor-difficulty">
        <p className="mb-2 text-sm text-muted">{ti.difficultyIntro}</p>
        <form action={setDefaultLevelAction} id="difficulty-form" data-testid="difficulty-form" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="difficulty-level" className="al-label">
              {ti.difficulty}
            </label>
            <select id="difficulty-level" data-testid="difficulty-level" name="level" defaultValue={String(cohortLevel)} className="al-input">
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  L{l} — {LEVEL_SPECS[l].label}
                </option>
              ))}
            </select>
          </div>
          <Button testId="difficulty-submit">{ti.setDifficulty}</Button>
          <span id="difficulty-current" data-testid="difficulty-current" data-level={cohortLevel} className="text-sm text-muted">
            {LEVEL_SPECS[cohortLevel].description}
          </span>
        </form>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          {LEVELS.map((l) => {
            const at = rows.flatMap((r) => (r.byLevel[l] ? [r.byLevel[l]] : []));
            const n = at.reduce((a, b) => a + b.extractions, 0);
            const avg = n ? at.reduce((a, b) => a + b.averageScore * b.extractions, 0) / n : null;
            return (
              <div key={l} className="al-card" id={`instructor-level-${l}`} data-testid={`instructor-level-${l}`} data-extractions={n} data-score={avg ?? ""}>
                <div className="text-xs uppercase tracking-wide text-muted">
                  L{l} {LEVEL_SPECS[l].label}
                </div>
                <div className="mt-1 text-xl font-light text-primary">{pct(avg)}</div>
                <div className="text-xs text-muted">{n} {ti.extractions.toLowerCase()}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Toolbar title={ti.title} />
      <TableWrap>
        <table id="instructor-table" data-testid="instructor-table" className="al-table">
          <thead>
            <tr>
              <th>{ti.student}</th>
              <th>{ti.sandbox}</th>
              <th className="num">{ti.documents}</th>
              <th className="num">{ti.invoicesProcessed}</th>
              <th className="num">{ti.extractions}</th>
              <th className="num">{ti.averageScore}</th>
              <th className="num">{ti.bestScore}</th>
              <th className="num">{ti.defectsCaught}</th>
              <th className="num">{ti.defectsMissed}</th>
              <th className="num">{ti.falsePositives}</th>
              <th>{ti.lastActivity}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenantId} id={`instructor-row-${r.userId}`} data-testid={`instructor-row-${r.userId}`} data-user-id={r.userId} data-score={r.averageScore ?? ""}>
                <td>
                  <div>{r.displayName}</div>
                  <div className="text-xs text-muted">{r.email}</div>
                </td>
                <td>
                  <Status status={r.status} />
                  <div className="text-xs text-muted">
                    {r.rendered}/{r.documents} PDFs · {r.resetCount} resets
                  </div>
                </td>
                <td className="num">{r.documents}</td>
                <td className="num">{r.invoicesProcessed}</td>
                <td className="num">{r.extractions}</td>
                <td className="num" data-testid={`instructor-cell-${r.userId}-averageScore`}>
                  {pct(r.averageScore)}
                </td>
                <td className="num">{pct(r.bestScore)}</td>
                <td className="num">{r.caught}</td>
                <td className="num">{r.missed}</td>
                <td className="num">{r.falsePositives}</td>
                <td>{r.lastActivity ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-muted" data-testid="instructor-empty">
                  {ti.noStudents}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-3 text-xs text-muted">
        <Link href="/api/docs">{t.tokens.docs}</Link>
      </p>
    </Page>
  );
}
