/**
 * Play every scenario perfectly and check that a perfect play scores 100.
 *
 * This exists because the grader has been wrong before, in a way no ordinary
 * test caught: the first goods receipt scorer paid decision points for refusing
 * an over-delivery and took accuracy and coverage points away for the same act,
 * so the correct play scored badly on purpose. A scorer can be internally
 * consistent, pass its unit tests, and still disagree with itself about what
 * good work looks like. The only way to find that is to play the scenario
 * properly and look at the number.
 *
 * A perfect play is constructed from the ground truth rather than by reading
 * the PDFs, because the point here is to test the grader, not the OCR: submit
 * exactly what the document says, make the right decision, catch every seeded
 * defect, and the score should be 100.
 *
 *   pnpm scorer:proof
 *   pnpm scorer:proof --scenario=invoice-processing
 */
import { and, eq, inArray } from "drizzle-orm";
import { pool, schema } from "../src/db/client";
import { forTenant } from "../src/db/tenant";
import type { LabSession } from "../src/lib/auth/server";
import { ensureTenantForPrincipal, tenantContext } from "../src/lib/sandbox/lifecycle";
import { register } from "../src/lib/identity/accounts";
import { INVOICE_HEADER_MAP, INVOICE_LINE_MAP } from "../src/lib/grading/score";
import { SCENARIOS, scenarioBySlug, type Scenario } from "../src/lib/challenge/scenarios";
import { startRun } from "../src/lib/challenge/runs";
import { closeRun } from "../src/lib/challenge/score";
import { matchStoredInvoice, submitExtraction, decideInvoice } from "../src/lib/services/invoices";
import { extractionToInvoice } from "../src/lib/services/extraction";
import { submitDocumentExtraction } from "../src/lib/services/document-extraction";
import { decideVendorApplication } from "../src/lib/services/vendor-applications";
import { awardQuote } from "../src/lib/services/rfqs";
import { approvePurchaseOrder } from "../src/lib/services/purchase-orders";
import { postGoodsReceipt } from "../src/lib/services/grns";

const only = process.argv.find((a) => a.startsWith("--scenario="))?.split("=")[1];

/** A throwaway participant, so one scenario's work cannot colour another's. */
async function freshSession(tag: string): Promise<LabSession> {
  const result = await register({
    email: `scorer-proof-${tag}-${Date.now()}@example.com`,
    password: "a-good-long-password",
    displayName: `Scorer Proof ${tag}`,
  });
  if (!result.ok) throw new Error(`could not create an account: ${result.message}`);
  const tenant = await ensureTenantForPrincipal(result.principal);
  if (!tenant) throw new Error("no tenant");
  return { principal: result.principal, tenant, tdb: forTenant(await tenantContext(tenant)), channel: "api" };
}

/** The ground truth for a document, as a flat field map. */
async function truthFor(session: LabSession, documentId: string): Promise<Record<string, string>> {
  const rows = await session.tdb.list(schema.groundTruth, { where: eq(schema.groundTruth.documentId, documentId) });
  return Object.fromEntries(rows.map((r) => [r.field, r.value]));
}

// ---------------------------------------------------------------------------
// A perfect play, per scenario
// ---------------------------------------------------------------------------

async function playInvoiceProcessing(session: LabSession, targets: string[]) {
  const rows = await session.tdb.list(schema.invoices, { where: inArray(schema.invoices.internalNumber, targets) });
  for (const inv of rows) {
    const doc = await session.tdb.one(
      schema.documents,
      and(eq(schema.documents.kind, "invoice"), eq(schema.documents.sourceId, inv.id))!,
    );
    if (!doc) throw new Error(`${inv.internalNumber} has no document`);
    const truthMap = await truthFor(session, doc.id);

    // The grader keys a submission by form field, not by ground-truth path, so a
    // perfect read has to be expressed the way a participant would send it.
    // Note what is deliberately absent: line`n`PoLine. It is not printed on the
    // invoice, so no honest reader has it, and the three-way match has to align
    // lines by item code the way it would for a real submission.
    const fields: Record<string, string> = {};
    for (const [formKey, truthKey] of Object.entries(INVOICE_HEADER_MAP)) {
      if (truthMap[truthKey] !== undefined) fields[formKey] = truthMap[truthKey];
    }
    for (let n = 1; n <= 8; n++) {
      for (const [suffix, leaf] of Object.entries(INVOICE_LINE_MAP)) {
        const v = truthMap[`lines[${n - 1}].${leaf}`];
        if (v !== undefined) fields[`line${n}${suffix}`] = v;
      }
    }

    // Exactly what the API route does with a submission.
    const { asStored, lines: matchLines } = extractionToInvoice(inv, fields);
    await submitExtraction(session, inv, fields, asStored, matchLines, "api");

    // Decide on what the rules say about the invoice, which is the reference
    // the grader checks the decision against.
    const truth = await matchStoredInvoice(session, inv);
    const worst = truth.violations.some((v) => v.severity === "critical")
      ? "critical"
      : truth.violations.some((v) => v.severity === "error")
        ? "error"
        : "clean";
    const fresh = await session.tdb.one(schema.invoices, eq(schema.invoices.id, inv.id));
    if (!fresh) continue;
    if (worst !== "clean") await decideInvoice(session, fresh, "reject");
    else {
      const approved = await decideInvoice(session, fresh, "approve");
      if (approved.ok) {
        const paid = await session.tdb.one(schema.invoices, eq(schema.invoices.id, inv.id));
        if (paid) await decideInvoice(session, paid, "pay");
      }
    }
  }
}

async function playVendorOnboarding(session: LabSession, targets: string[]) {
  const rows = await session.tdb.list(schema.vendors, { where: inArray(schema.vendors.code, targets) });
  for (const v of rows) {
    const doc = await session.tdb.one(
      schema.documents,
      and(eq(schema.documents.kind, "vendor_licence"), eq(schema.documents.vendorId, v.id))!,
    );
    if (doc) await submitDocumentExtraction(session, doc, await truthFor(session, doc.id), "api", {});
    // A defective application is refused; a sound one is approved.
    const defects = doc
      ? await session.tdb.list(schema.seededDefects, { where: eq(schema.seededDefects.documentId, doc.id) })
      : [];
    await decideVendorApplication(session, v.code, defects.length ? "reject" : "approve");
  }
}

async function playGoodsReceipt(session: LabSession, targets: string[]) {
  const notes = await session.tdb.list(schema.deliveryNotes, { where: inArray(schema.deliveryNotes.number, targets) });
  for (const dn of notes) {
    const lines = await session.tdb.list(schema.deliveryNoteLines, { where: eq(schema.deliveryNoteLines.deliveryNoteId, dn.id) });
    await postGoodsReceipt(session, dn.id, {
      lines: lines.map((l) => ({ lineNo: l.lineNo, quantityReceived: Number(l.quantity) })),
    });
  }
}

async function playSourcingAward(session: LabSession, targets: string[]) {
  const rfqs = await session.tdb.list(schema.rfqs, { where: inArray(schema.rfqs.number, targets) });
  for (const rfq of rfqs) {
    const quotes = await session.tdb.list(schema.quotes, { where: eq(schema.quotes.rfqId, rfq.id) });
    // The cheapest quotation that had not expired by the time the request
    // closed. Where every quotation expired, the right move is to award none —
    // leaving it open is the correct decision, not an omission.
    const eligible = quotes.filter((q) => q.validUntil >= rfq.dueDate && q.status !== "expired");
    const winner = [...eligible].sort((a, b) => Number(a.grandTotal) - Number(b.grandTotal))[0];
    if (!winner) continue;
    const award = await awardQuote(session, rfq.number, winner.id);
    if (award.ok) await approvePurchaseOrder(session, award.purchaseOrderNumber);
  }
}

const PLAYERS: Record<string, (s: LabSession, targets: string[]) => Promise<void>> = {
  "invoice-processing": playInvoiceProcessing,
  "vendor-onboarding": playVendorOnboarding,
  "goods-receipt": playGoodsReceipt,
  "sourcing-award": playSourcingAward,
};

async function proveOne(scenario: Scenario): Promise<boolean> {
  const session = await freshSession(scenario.slug.slice(0, 12));
  const started = await startRun(session, scenario, { mode: "scored" });
  if (!started.ok) {
    console.log(`\n${scenario.slug}: could not start a run — ${started.code}: ${started.message}`);
    return false;
  }
  const run = started.run!;
  await PLAYERS[scenario.slug](session, run.targets);
  const { result } = await closeRun(session, run, scenario);

  const perfect = result.score >= 99.95;
  console.log(`\n${scenario.slug}: ${result.score.toFixed(1)} / 100 ${perfect ? "✓" : "— NOT PERFECT"}`);
  for (const p of result.parameters) {
    const full = p.points >= p.max - 0.005;
    console.log(`  ${full ? " " : "!"} ${p.key.padEnd(11)} ${p.points.toFixed(1).padStart(5)} / ${p.max}   ${p.detail}`);
  }
  for (const n of result.notes ?? []) console.log(`    · ${n}`);
  return perfect;
}

async function main() {
  const wanted = only ? [scenarioBySlug(only)].filter(Boolean) : SCENARIOS;
  if (!wanted.length) throw new Error(`No scenario "${only}".`);
  console.log(`Playing ${wanted.length} scenario${wanted.length === 1 ? "" : "s"} perfectly, expecting 100 each.`);

  const failed: string[] = [];
  for (const scenario of wanted as Scenario[]) {
    try {
      if (!(await proveOne(scenario))) failed.push(scenario.slug);
    } catch (e) {
      console.log(`\n${scenario.slug}: threw — ${e instanceof Error ? e.message : e}`);
      failed.push(scenario.slug);
    }
  }

  console.log(
    failed.length
      ? `\n${failed.length} of ${wanted.length} scenarios do not reward a perfect play: ${failed.join(", ")}`
      : `\nAll ${wanted.length} scenarios reward a perfect play with 100.`,
  );
  await pool.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
