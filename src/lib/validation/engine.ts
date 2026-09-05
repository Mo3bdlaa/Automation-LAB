/**
 * Declarative validation engine. The same rules run on form save and on API
 * POST. Every violation carries a stable rule ID so a bot can branch on
 * `PO-INV-PRICE` instead of parsing prose.
 */

export type Severity = "warning" | "error" | "critical";

export interface Violation {
  ruleId: string;
  severity: Severity;
  message: string;
  /** Form field the violation points at, when there is one. */
  field?: string;
}

export interface Rule<Ctx> {
  id: string;
  severity: Severity;
  /** What the rule applies to, for the /rules page. */
  appliesTo: string;
  description: string;
  /** Tunable parameters, shown on the /rules page. */
  params?: Record<string, string | number | boolean>;
  check: (ctx: Ctx, params: Record<string, string | number | boolean>) => Omit<Violation, "ruleId" | "severity">[] | Omit<Violation, "ruleId" | "severity"> | null | undefined;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

const BLOCKING: Severity[] = ["error", "critical"];

export function runRules<Ctx>(rules: readonly Rule<Ctx>[], ctx: Ctx): ValidationResult {
  const violations: Violation[] = [];
  for (const rule of rules) {
    const res = rule.check(ctx, rule.params ?? {});
    if (!res) continue;
    for (const v of Array.isArray(res) ? res : [res]) {
      violations.push({ ruleId: rule.id, severity: rule.severity, ...v });
    }
  }
  violations.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return { ok: !violations.some((v) => BLOCKING.includes(v.severity)), violations };
}

export function severityRank(s: Severity): number {
  return s === "critical" ? 3 : s === "error" ? 2 : 1;
}

/** Describe rules for display and for the API. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function describeRules(rules: readonly Rule<any>[]) {
  return rules.map((r) => ({ id: r.id, severity: r.severity, appliesTo: r.appliesTo, description: r.description, params: r.params ?? {} }));
}
