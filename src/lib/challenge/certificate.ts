/**
 * Certificates.
 *
 * A scored run at or above the scenario's pass mark earns one. The certificate
 * carries a code, and the code is the point: anyone can check it at /verify,
 * so the claim is checkable rather than a picture someone could edit. It is
 * worded as this lab's challenge - it certifies that a person completed a
 * scenario at a score, and nothing more.
 *
 * The PDF goes through the same Chromium renderer as every other document, and
 * is generated on request rather than stored: the run row is the record.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { challengeRuns, type ChallengeRun } from "@/db/schema";
import { audit, type LabSession } from "@/lib/auth/server";
import type { Scenario } from "./scenarios";

/** Human-transcribable: no vowels, no look-alike characters. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newCertificateCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function isCertificateCode(code: string): boolean {
  return /^[23456789A-HJ-NP-Z]{5}-[23456789A-HJ-NP-Z]{5}$/.test(code);
}

/** Issues a certificate if the run earned one. Idempotent. */
export async function issueCertificate(session: LabSession, run: ChallengeRun, scenario: Scenario): Promise<ChallengeRun> {
  if (run.certificateCode) return run;
  if (run.mode !== "scored" || run.status !== "completed") return run;
  const score = Number(run.score ?? 0);
  if (score < scenario.passMark) return run;
  const [updated] = await session.tdb.update(
    challengeRuns,
    { certificateCode: newCertificateCode(), certificateIssuedAt: new Date() },
    eq(challengeRuns.id, run.id),
  );
  await audit(session, "certificate.issue", "challenge_run", run.id, { scenario: run.scenario, score });
  return updated;
}

export interface CertificateFacts {
  code: string;
  name: string;
  scenarioTitle: string;
  scenarioSlug: string;
  score: number;
  passMark: number;
  level: number;
  channel: string | null;
  durationMs: number | null;
  issuedAt: Date;
  itemsProcessed: number;
  itemsInScope: number;
  /** Short digest of the run id, so two certificates can never collide visually. */
  reference: string;
  /**
   * The build of the master set this was earned against. Printed because the
   * documents can be regenerated between events: without it a certificate says
   * what was scored but not what was scored on.
   */
  datasetVersion: number;
}

/**
 * Looks a certificate up by code, across every tenant. Public on purpose: a
 * certificate nobody else can check is not worth issuing. It exposes only what
 * is printed on the certificate itself.
 */
export async function certificateByCode(code: string): Promise<CertificateFacts | null> {
  if (!isCertificateCode(code)) return null;
  const { db, schema } = await import("@/db/client");
  const { scenarioBySlug } = await import("./scenarios");
  const [run] = await db
    .select()
    .from(schema.challengeRuns)
    .where(and(eq(schema.challengeRuns.certificateCode, code), eq(schema.challengeRuns.status, "completed")));
  if (!run || !run.certificateIssuedAt) return null;
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, run.userId));
  const [user] = account ? [] : await db.select().from(schema.users).where(eq(schema.users.id, run.userId));
  const scenario = scenarioBySlug(run.scenario);
  return {
    code,
    name: account?.displayName ?? user?.displayName ?? "A participant",
    scenarioTitle: scenario?.title ?? run.scenario,
    scenarioSlug: run.scenario,
    score: Number(run.score ?? 0),
    passMark: scenario?.passMark ?? 60,
    level: run.level,
    channel: run.channel,
    durationMs: run.durationMs,
    issuedAt: run.certificateIssuedAt,
    itemsProcessed: run.processedCount,
    itemsInScope: run.targets.length,
    reference: createHash("sha256").update(run.id).digest("hex").slice(0, 8).toUpperCase(),
    datasetVersion: run.datasetVersion,
  };
}
