/**
 * Scoring a run.
 *
 * Five parameters, weighted per scenario, each a fraction in [0,1] before the
 * weight is applied. The rules are published on the scenario page, because a
 * leaderboard nobody can reason about is just a lottery:
 *
 *   accuracy    what you entered against what the document says
 *   decisions   what you did with each item against what the rules imply
 *   exceptions  the seeded problems: caught, missed, and invented
 *   coverage    how much of the queue you got through
 *   time        the run against a par time for the queue
 *
 * Everything is measured from what the run left behind - the extraction rows,
 * the final state of each record, the audit trail - inside the run's window.
 * Only the first submission for a document counts, so a bot cannot resubmit
 * against the grader until it converges.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  auditLog,
  challengeRuns,
  deliveryNoteLines,
  deliveryNotes,
  documents,
  extractions,
  grnLines,
  grns,
  invoices,
  purchaseOrderLines,
  purchaseOrders,
  quotes,
  rfqs,
  vendors,
  type ChallengeRun,
  type Invoice,
} from "@/db/schema";
import type { LabSession } from "@/lib/auth/server";
import { matchStoredInvoice } from "@/lib/services/invoices";
import { runVendorRules } from "@/lib/services/master-data";
import { PARAMETERS, type Parameter, type Scenario } from "./scenarios";
import { runParSeconds } from "./runs";

export interface ParameterResult {
  key: Parameter;
  label: string;
  /** 0..1 before weighting. */
  fraction: number;
  points: number;
  max: number;
  detail: string;
}

export interface RunResult {
  score: number;
  channel: "ui" | "api" | "mixed" | null;
  processed: number;
  parameters: ParameterResult[];
  notes: string[];
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Precision and recall folded into one number, the way the defect grade already
 * works: catching everything while crying wolf constantly is not a good result,
 * and neither is catching nothing quietly.
 */
export function f1(truePositives: number, falseNegatives: number, falsePositives: number): number {
  if (truePositives + falseNegatives + falsePositives === 0) return 1;
  const precision = truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives);
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

/** Full marks at or under par, then falling away in proportion to the overrun. */
export function timeFraction(durationMs: number, parSecondsTotal: number): number {
  const actual = Math.max(1, durationMs / 1000);
  return clamp01(actual <= parSecondsTotal ? 1 : parSecondsTotal / actual);
}

/**
 * How the work was driven, read from the audit trail of the run's window. Every
 * audited action records the channel it came in on, so a scenario with no
 * extractions to look at can still be placed on the right board.
 */
async function channelFromAudit(session: LabSession, run: ChallengeRun, completedAt: Date): Promise<"ui" | "api" | "mixed" | null> {
  const rows = await session.tdb.list(auditLog, { where: and(gte(auditLog.at, run.startedAt), lte(auditLog.at, completedAt))! });
  const sources = rows
    .map((r) => r.details?.channel)
    .filter((c): c is "ui" | "api" => c === "ui" || c === "api");
  return channelOf(sources);
}

/** Extractions submitted inside the run window, earliest first. */
async function extractionsInWindow(session: LabSession, run: ChallengeRun, completedAt: Date) {
  return session.tdb.list(extractions, {
    where: and(gte(extractions.submittedAt, run.startedAt), lte(extractions.submittedAt, completedAt))!,
    orderBy: [{ column: extractions.submittedAt, direction: "asc" }],
  });
}

function channelOf(sources: ("ui" | "api")[]): "ui" | "api" | "mixed" | null {
  if (sources.length === 0) return null;
  const unique = new Set(sources);
  return unique.size === 1 ? [...unique][0] : "mixed";
}

// ---------------------------------------------------------------------------
// Invoice processing
// ---------------------------------------------------------------------------

/** What a correct accounts payable clerk does with an invoice, by severity. */
export function expectedInvoiceOutcome(severities: string[]): { allowed: Invoice["status"][]; label: string } {
  if (severities.includes("critical")) return { allowed: ["exception", "rejected"], label: "hold as an exception" };
  if (severities.includes("error")) return { allowed: ["rejected"], label: "reject" };
  return { allowed: ["approved", "paid"], label: "approve and pay" };
}

async function scoreInvoiceProcessing(session: LabSession, run: ChallengeRun, scenario: Scenario, completedAt: Date): Promise<RunResult> {
  const targets = run.targets;
  const rows = targets.length ? await session.tdb.list(invoices, { where: inArray(invoices.internalNumber, targets) }) : [];
  const docs = rows.length ? await session.tdb.list(documents, { where: and(eq(documents.kind, "invoice"), inArray(documents.sourceId, rows.map((r) => r.id)))! }) : [];
  const submitted = await extractionsInWindow(session, run, completedAt);

  let accuracySum = 0;
  let decisionsRight = 0;
  let caught = 0;
  let missed = 0;
  let invented = 0;
  let processed = 0;
  const channels: ("ui" | "api")[] = [];
  const notes: string[] = [];

  for (const inv of rows) {
    const doc = docs.find((d) => d.sourceId === inv.id);
    // The first real extraction only: resubmissions cannot be used to probe the grader.
    const first = doc ? submitted.find((e) => e.documentId === doc.id && e.fields.number !== undefined) : undefined;
    if (first) {
      processed++;
      channels.push(first.source);
      accuracySum += Number(first.score ?? 0);
      const defects = first.matchResult?.defects;
      caught += defects?.caught.length ?? 0;
      missed += defects?.missed.length ?? 0;
      invented += defects?.falsePositives.length ?? 0;
    }

    // What the rules say about the invoice as the system holds it, which is the
    // reference for the decision regardless of what the participant submitted.
    const truth = await matchStoredInvoice(session, inv);
    const expected = expectedInvoiceOutcome(truth.violations.map((v) => v.severity));
    if (expected.allowed.includes(inv.status)) decisionsRight++;
    else if (first) notes.push(`${inv.internalNumber}: expected to ${expected.label}, ended ${inv.status}.`);
  }

  const accuracy = rows.length ? accuracySum / rows.length : 0;
  const decisions = rows.length ? decisionsRight / rows.length : 0;
  const exceptions = f1(caught, missed, invented);
  const coverage = targets.length ? processed / targets.length : 0;
  const time = timeFraction(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run));

  return assemble(scenario, run, processed, channelOf(channels), notes, {
    accuracy: { fraction: accuracy, detail: `Mean field accuracy over ${rows.length} invoices.` },
    decisions: { fraction: decisions, detail: `${decisionsRight} of ${rows.length} invoices ended in the right state.` },
    exceptions: { fraction: exceptions, detail: `${caught} caught, ${missed} missed, ${invented} raised that were not there.` },
    coverage: { fraction: coverage, detail: `${processed} of ${targets.length} invoices extracted.` },
    time: { fraction: time, detail: timeDetail(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run)) },
  });
}

// ---------------------------------------------------------------------------
// Vendor onboarding
// ---------------------------------------------------------------------------

async function scoreVendorOnboarding(session: LabSession, run: ChallengeRun, scenario: Scenario, completedAt: Date): Promise<RunResult> {
  const targets = run.targets;
  const rows = targets.length ? await session.tdb.list(vendors, { where: inArray(vendors.code, targets) }) : [];
  const docs = rows.length ? await session.tdb.list(documents, { where: and(eq(documents.kind, "vendor_licence"), inArray(documents.vendorId, rows.map((r) => r.id)))! }) : [];
  const submitted = await extractionsInWindow(session, run, completedAt);

  let accuracySum = 0;
  let decisionsRight = 0;
  let processed = 0;
  let refusedCorrectly = 0;
  let refusedWrongly = 0;
  let acceptedWrongly = 0;
  const channels: ("ui" | "api")[] = [];
  const notes: string[] = [];

  for (const v of rows) {
    const doc = docs.find((d) => d.vendorId === v.id);
    const first = doc ? submitted.find((e) => e.documentId === doc.id) : undefined;
    if (first) {
      processed++;
      channels.push(first.source);
      accuracySum += Number(first.score ?? 0);
    }
    // An application should be refused when the supplier's own record breaks a
    // vendor rule at error level or worse.
    const violations: { ruleId: string; severity: string }[] = await runVendorRules(session, v);
    const shouldRefuse = violations.some((x) => x.severity === "error" || x.severity === "critical");
    const refused = v.status === "blocked";
    const accepted = v.status === "active";
    if (shouldRefuse && refused) {
      decisionsRight++;
      refusedCorrectly++;
    } else if (!shouldRefuse && accepted) {
      decisionsRight++;
    } else if (shouldRefuse && accepted) {
      acceptedWrongly++;
      notes.push(`${v.code}: accepted although ${violations.map((x) => x.ruleId).join(", ")} applies.`);
    } else if (!shouldRefuse && refused) {
      refusedWrongly++;
      notes.push(`${v.code}: refused although nothing is wrong with it.`);
    } else if (v.status === "pending") {
      notes.push(`${v.code}: left pending, no decision recorded.`);
    }
  }

  const accuracy = rows.length ? accuracySum / rows.length : 0;
  const decisions = rows.length ? decisionsRight / rows.length : 0;
  const exceptions = f1(refusedCorrectly, acceptedWrongly, refusedWrongly);
  const coverage = targets.length ? rows.filter((v) => v.status !== "pending").length / targets.length : 0;
  const time = timeFraction(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run));

  return assemble(scenario, run, processed, channelOf(channels) ?? (await channelFromAudit(session, run, completedAt)), notes, {
    accuracy: { fraction: accuracy, detail: `Mean field accuracy over ${rows.length} commercial registrations.` },
    decisions: { fraction: decisions, detail: `${decisionsRight} of ${rows.length} applications decided correctly.` },
    exceptions: { fraction: exceptions, detail: `${refusedCorrectly} bad applications refused, ${acceptedWrongly} let through, ${refusedWrongly} good ones refused.` },
    coverage: { fraction: coverage, detail: `${rows.filter((v) => v.status !== "pending").length} of ${targets.length} applications decided.` },
    time: { fraction: time, detail: timeDetail(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run)) },
  });
}

// ---------------------------------------------------------------------------
// Goods receipt
// ---------------------------------------------------------------------------

const OVER_RECEIPT_TOLERANCE = 0.02;

async function scoreGoodsReceipt(session: LabSession, run: ChallengeRun, scenario: Scenario, completedAt: Date): Promise<RunResult> {
  const targets = run.targets;
  const notes = targets.length ? await session.tdb.list(deliveryNotes, { where: inArray(deliveryNotes.number, targets) }) : [];
  const noteLines = notes.length ? await session.tdb.list(deliveryNoteLines, { where: inArray(deliveryNoteLines.deliveryNoteId, notes.map((n) => n.id)) }) : [];
  const posted = notes.length ? await session.tdb.list(grns, { where: inArray(grns.deliveryNoteId, notes.map((n) => n.id)) }) : [];
  const postedLines = posted.length ? await session.tdb.list(grnLines, { where: inArray(grnLines.grnId, posted.map((g) => g.id)) }) : [];
  const poLines = notes.length ? await session.tdb.list(purchaseOrderLines, { where: inArray(purchaseOrderLines.purchaseOrderId, [...new Set(notes.map((n) => n.purchaseOrderId))]) }) : [];
  // A refusal is a decision, not an omission: it is recorded in the audit trail
  // by both the screens and the API.
  const refusals = new Set(
    (await session.tdb.list(auditLog, { where: and(eq(auditLog.action, "delivery.refuse"), gte(auditLog.at, run.startedAt), lte(auditLog.at, completedAt))! }))
      .map((r) => r.entityId)
      .filter((x): x is string => Boolean(x)),
  );

  let linesRight = 0;
  let linesTotal = 0;
  let decisionsRight = 0;
  let overCaught = 0;
  let overMissed = 0;
  let overInvented = 0;
  let processed = 0;
  const messages: string[] = [];

  for (const note of notes) {
    const lines = noteLines.filter((l) => l.deliveryNoteId === note.id);
    const receipt = posted.find((g) => g.deliveryNoteId === note.id && g.status === "posted");
    // A note is an over-delivery when any line exceeds its ordered quantity
    // plus tolerance; those must not be received as they stand.
    const overDelivery = lines.some((l) => {
      const po = poLines.find((p) => p.id === l.purchaseOrderLineId);
      return po ? Number(l.quantity) > Number(po.quantity) * (1 + OVER_RECEIPT_TOLERANCE) : false;
    });
    const refused = refusals.has(note.number);
    if (receipt || refused) processed++;

    // Only the deliveries that should have been received count towards
    // accuracy: refusing an over-delivery is the right answer, and marking it
    // wrong here would contradict the decision it is credited for below.
    if (!overDelivery) {
      for (const l of lines) {
        linesTotal++;
        const got = postedLines.find((g) => g.grnId === receipt?.id && g.purchaseOrderLineId === l.purchaseOrderLineId);
        if (got && Math.abs(Number(got.quantityReceived) - Number(l.quantity)) < 0.001) linesRight++;
      }
    }

    if (overDelivery) {
      if (receipt) {
        overMissed++;
        messages.push(`${note.number}: received in full although it exceeds the ordered quantity.`);
      } else {
        overCaught++;
        decisionsRight++;
        if (!refused) messages.push(`${note.number}: correctly not received, but no exception was recorded against it.`);
      }
    } else if (receipt) {
      decisionsRight++;
    } else {
      overInvented++;
      messages.push(`${note.number}: ${refused ? "refused" : "left untouched"} although the delivery is within tolerance.`);
    }
  }

  const accuracy = linesTotal ? linesRight / linesTotal : 0;
  const decisions = notes.length ? decisionsRight / notes.length : 0;
  const exceptions = f1(overCaught, overMissed, overInvented);
  const coverage = targets.length ? processed / targets.length : 0;
  const time = timeFraction(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run));

  return assemble(scenario, run, processed, await channelFromAudit(session, run, completedAt), messages, {
    accuracy: { fraction: accuracy, detail: `${linesRight} of ${linesTotal} lines received at the right quantity.` },
    decisions: { fraction: decisions, detail: `${decisionsRight} of ${notes.length} deliveries handled correctly.` },
    exceptions: { fraction: exceptions, detail: `${overCaught} over-deliveries stopped, ${overMissed} received anyway.` },
    coverage: { fraction: coverage, detail: `${processed} of ${targets.length} deliveries received or refused.` },
    time: { fraction: time, detail: timeDetail(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run)) },
  });
}

// ---------------------------------------------------------------------------
// Sourcing: award the quotation
// ---------------------------------------------------------------------------

async function scoreSourcingAward(session: LabSession, run: ChallengeRun, scenario: Scenario, completedAt: Date): Promise<RunResult> {
  const targets = run.targets;
  const rows = targets.length ? await session.tdb.list(rfqs, { where: inArray(rfqs.number, targets) }) : [];
  const allQuotes = rows.length ? await session.tdb.list(quotes, { where: inArray(quotes.rfqId, rows.map((r) => r.id)) }) : [];
  const pos = rows.length ? await session.tdb.list(purchaseOrders, { where: inArray(purchaseOrders.id, rows.map((r) => r.purchaseOrderId).filter(Boolean) as string[]) }) : [];

  let awardedRight = 0;
  let approved = 0;
  let decided = 0;
  let correctlyHeld = 0;
  let wronglyAwarded = 0;
  let wronglyHeld = 0;
  const messages: string[] = [];

  for (const rfq of rows) {
    const mine = allQuotes.filter((q) => q.rfqId === rfq.id);
    // A quotation that expired before the request closed cannot be awarded.
    const eligible = mine.filter((q) => q.validUntil >= rfq.dueDate && q.status !== "expired");
    const best = [...eligible].sort((a, b) => Number(a.grandTotal) - Number(b.grandTotal))[0] ?? null;
    const awarded = mine.find((q) => q.status === "awarded") ?? null;

    if (awarded) decided++;
    if (!best) {
      if (awarded) {
        wronglyAwarded++;
        messages.push(`${rfq.number}: awarded ${awarded.number}, but every quotation had expired.`);
      } else {
        correctlyHeld++;
        awardedRight++;
        decided++;
      }
      continue;
    }
    if (!awarded) {
      wronglyHeld++;
      messages.push(`${rfq.number}: left open although ${best.number} was eligible.`);
      continue;
    }
    if (awarded.id === best.id) {
      awardedRight++;
      const po = pos.find((p) => p.id === rfq.purchaseOrderId);
      if (po && ["approved", "sent", "received", "partially_received"].includes(po.status)) approved++;
    } else {
      wronglyAwarded++;
      messages.push(`${rfq.number}: awarded ${awarded.number} at ${awarded.grandTotal}, but ${best.number} at ${best.grandTotal} was cheaper and eligible.`);
    }
  }

  const accuracy = rows.length ? approved / rows.length : 0;
  const decisions = rows.length ? awardedRight / rows.length : 0;
  const exceptions = f1(correctlyHeld, wronglyAwarded, wronglyHeld);
  const coverage = targets.length ? decided / targets.length : 0;
  const time = timeFraction(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run));

  return assemble(scenario, run, decided, await channelFromAudit(session, run, completedAt), messages, {
    accuracy: { fraction: accuracy, detail: `${approved} of ${rows.length} awards followed through to an approved purchase order.` },
    decisions: { fraction: decisions, detail: `${awardedRight} of ${rows.length} requests awarded to the right quotation.` },
    exceptions: { fraction: exceptions, detail: `${correctlyHeld} requests correctly left unawarded, ${wronglyAwarded} awarded to an ineligible quotation.` },
    coverage: { fraction: coverage, detail: `${decided} of ${targets.length} requests decided.` },
    time: { fraction: time, detail: timeDetail(completedAt.getTime() - run.startedAt.getTime(), runParSeconds(scenario, run)) },
  });
}

// ---------------------------------------------------------------------------

function timeDetail(durationMs: number, parSecondsTotal: number): string {
  const mins = (n: number) => `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`;
  return `${mins(durationMs / 1000)} against a par of ${mins(parSecondsTotal)}.`;
}

function assemble(
  scenario: Scenario,
  run: ChallengeRun,
  processed: number,
  channel: "ui" | "api" | "mixed" | null,
  notes: string[],
  parts: Record<Parameter, { fraction: number; detail: string }>,
): RunResult {
  const parameters: ParameterResult[] = PARAMETERS.map((key) => {
    const max = scenario.weights[key];
    const fraction = clamp01(parts[key].fraction);
    return { key, label: key, fraction, points: Math.round(fraction * max * 100) / 100, max, detail: parts[key].detail };
  });
  const score = Math.round(parameters.reduce((a, p) => a + p.points, 0) * 100) / 100;
  return { score, channel, processed, parameters, notes: notes.slice(0, 20) };
}

/** Grades a run without closing it, so a result page can be re-rendered. */
export async function scoreRun(session: LabSession, run: ChallengeRun, scenario: Scenario, at = new Date()): Promise<RunResult> {
  const completedAt = run.completedAt ?? at;
  switch (scenario.slug) {
    case "invoice-processing":
      return scoreInvoiceProcessing(session, run, scenario, completedAt);
    case "vendor-onboarding":
      return scoreVendorOnboarding(session, run, scenario, completedAt);
    case "goods-receipt":
      return scoreGoodsReceipt(session, run, scenario, completedAt);
    case "sourcing-award":
      return scoreSourcingAward(session, run, scenario, completedAt);
    default:
      throw new Error(`No scorer for scenario ${scenario.slug}`);
  }
}

/** Closes a run and stores its result. Idempotent: a closed run keeps its score. */
export async function closeRun(session: LabSession, run: ChallengeRun, scenario: Scenario): Promise<{ run: ChallengeRun; result: RunResult }> {
  if (run.status !== "running") {
    return { run, result: await scoreRun(session, run, scenario) };
  }
  const completedAt = new Date();
  const result = await scoreRun(session, { ...run, completedAt }, scenario, completedAt);
  const [updated] = await session.tdb.update(
    challengeRuns,
    {
      status: "completed",
      completedAt,
      durationMs: completedAt.getTime() - run.startedAt.getTime(),
      processedCount: result.processed,
      score: result.score.toFixed(2),
      channel: result.channel ?? "ui",
      breakdown: { parameters: result.parameters.map((p) => ({ key: p.key, label: p.label, points: p.points, max: p.max, detail: p.detail })), notes: result.notes },
    },
    eq(challengeRuns.id, run.id),
  );
  return { run: updated, result };
}
