/**
 * Deciding a supplier application. Onboarding is the one process where the
 * decision is the deliverable: the record already exists as `pending`, and the
 * work is judging whether it should become a supplier at all.
 */
import { eq } from "drizzle-orm";
import { vendors, type Vendor } from "@/db/schema";
import { audit, type LabSession } from "@/lib/auth/server";
import { runVendorRules } from "./master-data";
import type { Violation } from "@/lib/validation/engine";

export type ApplicationDecision = "approve" | "reject";

export type DecisionResult =
  | { ok: true; vendor: Vendor; violations: Violation[] }
  | { ok: false; error: "not_found" | "read_only" | "invalid_state"; message: string };

export async function decideVendorApplication(session: LabSession, code: string, decision: ApplicationDecision, reason?: string): Promise<DecisionResult> {
  const v = await session.tdb.one(vendors, eq(vendors.code, code.toUpperCase()));
  if (!v) return { ok: false, error: "not_found", message: `Vendor ${code} not found.` };
  if (session.tdb.isReadOnlyRow(v)) return { ok: false, error: "read_only", message: "Shared corpus suppliers cannot be decided." };
  if (v.status !== "pending" && v.status !== (decision === "approve" ? "active" : "blocked")) {
    return { ok: false, error: "invalid_state", message: `Vendor ${v.code} is ${v.status}; only a pending application can be decided.` };
  }
  // The violations are reported back so a decision can be justified, and so a
  // participant who approves a bad application can see afterwards what they missed.
  const violations = await runVendorRules(session, v);
  const [updated] = await session.tdb.update(
    vendors,
    { status: decision === "approve" ? "active" : "blocked", updatedAt: new Date() },
    eq(vendors.id, v.id),
  );
  await audit(session, `vendor.${decision}`, "vendor", v.code, { reason: reason ?? null, violations: violations.map((x) => x.ruleId) });
  return { ok: true, vendor: updated, violations };
}
