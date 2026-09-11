/**
 * Extraction and defect grading.
 *
 * A submission is scored against the ground truth the generator stored when it
 * created the document, so grading needs no human key. Header fields weigh more
 * than line fields because getting the invoice total wrong matters more than
 * mis-typing one description.
 */
import { compareBest, compareField, type Comparison } from "./normalise";

export const HEADER_WEIGHT = 2;
export const LINE_WEIGHT = 1;

/** Extraction form field name to ground-truth path, for the invoice taxonomy. */
export const INVOICE_HEADER_MAP: Record<string, string> = {
  number: "number",
  invoiceDate: "invoiceDate",
  dueDate: "dueDate",
  poNumber: "poNumber",
  currency: "currency",
  vendorName: "vendor.name",
  vendorTaxId: "vendor.taxId",
  iban: "vendor.iban",
  bankName: "vendor.bankName",
  subtotal: "subtotal",
  taxTotal: "taxTotal",
  grandTotal: "grandTotal",
};

/** Line form suffix to the ground-truth leaf. `PoLine` is not graded: it is a lab convenience, not printed. */
export const INVOICE_LINE_MAP: Record<string, string> = {
  ItemCode: "itemCode",
  Description: "description",
  Quantity: "quantity",
  Uom: "uom",
  UnitPrice: "unitPrice",
  TaxRate: "taxRate",
  TaxAmount: "taxAmount",
  LineTotal: "lineTotal",
};

export interface FieldResult extends Comparison {
  field: string;
  expected: string;
  actual: string;
  weight: number;
}

export interface ExtractionScore {
  /** Weighted accuracy in [0,1]. */
  score: number;
  matched: number;
  total: number;
  /** Lines the student submitted that match no ground-truth line. */
  extraLines: number;
  /** Ground-truth lines the student did not submit. */
  missingLines: number;
  fields: Record<string, FieldResult>;
}

interface SubmittedLine {
  index: number;
  values: Record<string, string>;
}

function groundTruthLines(truth: Map<string, string>): { index: number; values: Record<string, string> }[] {
  const byIndex = new Map<number, Record<string, string>>();
  for (const [k, v] of truth) {
    const m = k.match(/^lines\[(\d+)\]\.(\w+)$/);
    if (!m) continue;
    const i = Number(m[1]);
    if (!byIndex.has(i)) byIndex.set(i, {});
    byIndex.get(i)![m[2]] = v;
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([index, values]) => ({ index, values }));
}

function submittedLines(fields: Record<string, string>, maxLines: number): SubmittedLine[] {
  const out: SubmittedLine[] = [];
  for (let n = 1; n <= maxLines; n++) {
    const values: Record<string, string> = {};
    let any = false;
    for (const suffix of Object.keys(INVOICE_LINE_MAP)) {
      const v = (fields[`line${n}${suffix}`] ?? "").trim();
      values[suffix] = v;
      if (v) any = true;
    }
    if (any) out.push({ index: n - 1, values });
  }
  return out;
}

/**
 * Pairs submitted lines with ground-truth lines. Item code is the strongest
 * signal; otherwise the best combined similarity of description and quantity
 * wins, so a student who lists the lines out of order is not punished twice.
 */
function alignLines(truth: { index: number; values: Record<string, string> }[], submitted: SubmittedLine[]) {
  const pairs: { truthIdx: number | null; sub: SubmittedLine | null }[] = [];
  const usedSub = new Set<number>();
  for (const t of truth) {
    let best: { sub: SubmittedLine; score: number } | null = null;
    for (const s of submitted) {
      if (usedSub.has(s.index)) continue;
      let score = 0;
      if (t.values.itemCode && s.values.ItemCode && compareField("lines[0].itemCode", t.values.itemCode, s.values.ItemCode).match) score += 3;
      if (t.values.description && s.values.Description) score += compareField("lines[0].description", t.values.description, s.values.Description).similarity;
      if (t.values.quantity && s.values.Quantity && compareField("lines[0].quantity", t.values.quantity, s.values.Quantity).match) score += 1;
      if (s.index === t.index) score += 0.25;
      if (!best || score > best.score) best = { sub: s, score };
    }
    if (best && best.score > 0.5) {
      usedSub.add(best.sub.index);
      pairs.push({ truthIdx: t.index, sub: best.sub });
    } else {
      pairs.push({ truthIdx: t.index, sub: null });
    }
  }
  for (const s of submitted) if (!usedSub.has(s.index)) pairs.push({ truthIdx: null, sub: s });
  return pairs;
}

/**
 * Scores one invoice extraction. `truth` is the ground-truth map for the
 * document; `fields` is what the student or bot submitted.
 */
export function scoreInvoiceExtraction(
  truth: Map<string, string>,
  fields: Record<string, string>,
  opts: { maxLines?: number; alternates?: Map<string, string[]> } = {},
): ExtractionScore {
  const maxLines = opts.maxLines ?? 8;
  const alt = (key: string) => opts.alternates?.get(key) ?? [];
  const results: Record<string, FieldResult> = {};
  let weighted = 0;
  let weightTotal = 0;

  for (const [formKey, truthKey] of Object.entries(INVOICE_HEADER_MAP)) {
    if (!truth.has(truthKey)) continue;
    const expected = truth.get(truthKey)!;
    const actual = (fields[formKey] ?? "").trim();
    const cmp = compareBest(truthKey, expected, alt(truthKey), actual);
    results[truthKey] = { field: truthKey, expected, actual, weight: HEADER_WEIGHT, ...cmp };
    weightTotal += HEADER_WEIGHT;
    if (cmp.match) weighted += HEADER_WEIGHT;
  }

  const tLines = groundTruthLines(truth);
  const sLines = submittedLines(fields, maxLines);
  const pairs = alignLines(tLines, sLines);
  let extraLines = 0;
  let missingLines = 0;

  for (const { truthIdx, sub } of pairs) {
    if (truthIdx === null) {
      // A line the student invented: every mapped field counts as wrong.
      extraLines++;
      for (const [suffix, leaf] of Object.entries(INVOICE_LINE_MAP)) {
        if (!(sub!.values[suffix] ?? "").trim()) continue;
        const key = `extra[${sub!.index}].${leaf}`;
        results[key] = { field: key, expected: "", actual: sub!.values[suffix], weight: LINE_WEIGHT, match: false, similarity: 0, expectedNormalised: "", actualNormalised: sub!.values[suffix] };
        weightTotal += LINE_WEIGHT;
      }
      continue;
    }
    const t = tLines.find((x) => x.index === truthIdx)!;
    if (!sub) missingLines++;
    for (const [suffix, leaf] of Object.entries(INVOICE_LINE_MAP)) {
      const truthKey = `lines[${truthIdx}].${leaf}`;
      if (!truth.has(truthKey)) continue;
      const expected = t.values[leaf] ?? "";
      const actual = sub ? (sub.values[suffix] ?? "").trim() : "";
      const cmp = compareBest(truthKey, expected, alt(truthKey), actual);
      results[truthKey] = { field: truthKey, expected, actual, weight: LINE_WEIGHT, ...cmp };
      weightTotal += LINE_WEIGHT;
      if (cmp.match) weighted += LINE_WEIGHT;
    }
  }

  const matched = Object.values(results).filter((r) => r.match).length;
  return {
    score: weightTotal === 0 ? 0 : Math.round((weighted / weightTotal) * 10000) / 10000,
    matched,
    total: Object.keys(results).length,
    extraLines,
    missingLines,
    fields: results,
  };
}

/**
 * Grades an extraction of any document against its ground truth, keyed by the
 * ground-truth paths themselves rather than a form taxonomy. This is what the
 * onboarding scenario uses: a commercial registration has no line items, so the
 * invoice weighting would not mean anything.
 *
 * Fields the participant did not send count as missed; fields they sent that no
 * ground truth covers are ignored rather than punished, because a document
 * carries more text than the lab records.
 */
export function scoreGenericExtraction(truth: Map<string, string>, fields: Record<string, string>, alternates?: Map<string, string[]>): ExtractionScore {
  const results: Record<string, FieldResult> = {};
  let matched = 0;
  for (const [field, expected] of truth) {
    const actual = (fields[field] ?? "").trim();
    const cmp = compareBest(field, expected, alternates?.get(field) ?? [], actual);
    results[field] = { field, expected, actual, weight: HEADER_WEIGHT, ...cmp };
    if (cmp.match) matched++;
  }
  const total = truth.size;
  return {
    score: total === 0 ? 0 : Math.round((matched / total) * 10000) / 10000,
    matched,
    total,
    extraLines: 0,
    missingLines: 0,
    fields: results,
  };
}

// ---------------------------------------------------------------------------
// Defect grading
// ---------------------------------------------------------------------------

export interface DefectGrade {
  /** Seeded defects whose rule ID the student's match result reported. */
  caught: { defectType: string; ruleId: string }[];
  /** Seeded defects the student's result did not report. */
  missed: { defectType: string; ruleId: string }[];
  /** Blocking rule IDs reported that no seeded defect explains. */
  falsePositives: string[];
  /** Caught / seeded, or 1 when nothing was seeded and nothing was raised. */
  recall: number;
  precision: number;
}

/**
 * Compares the rule IDs a student's three-way match produced with the defects
 * the generator seeded into the document. Warnings are ignored: only blocking
 * findings count for or against.
 */
/**
 * Grade a match result against the defects that were deliberately seeded.
 *
 * `baseline`, when given, is what the same rules report about the document as
 * it was actually printed — a perfect read. It matters because the participant
 * does not raise violations: the match engine does, from the values they
 * submitted. Some of those violations are simply true of the sandbox and
 * nothing to do with the reading. An invoice whose goods have not been
 * receipted yet raises GRN-QTY however perfectly it is read, and counting that
 * against the reader made the exceptions parameter unwinnable.
 *
 * So a false positive is a violation the reading *introduced*: present in what
 * they submitted, absent from a perfect read. Without a baseline the old,
 * stricter definition applies, which is right for callers that have no
 * document to compare against.
 */
export function gradeDefects(
  seeded: { defectType: string; details: Record<string, unknown> }[],
  reported: { ruleId: string; severity: string }[],
  baseline?: { ruleId: string; severity: string }[],
): DefectGrade {
  const blocking = reported.filter((r) => r.severity !== "warning");
  const reportedIds = new Set(blocking.map((r) => r.ruleId));
  const expected = seeded
    .map((d) => ({ defectType: d.defectType, ruleId: String(d.details.ruleId ?? "") }))
    .filter((d) => d.ruleId);
  const caught = expected.filter((d) => reportedIds.has(d.ruleId));
  const missed = expected.filter((d) => !reportedIds.has(d.ruleId));
  const expectedIds = new Set(expected.map((d) => d.ruleId));
  const inherent = new Set((baseline ?? []).filter((r) => r.severity !== "warning").map((r) => r.ruleId));
  const falsePositives = [...new Set(blocking.map((r) => r.ruleId))].filter((id) => !expectedIds.has(id) && !inherent.has(id));
  return {
    caught,
    missed,
    falsePositives,
    recall: expected.length === 0 ? 1 : Math.round((caught.length / expected.length) * 100) / 100,
    precision: blocking.length === 0 ? (expected.length === 0 ? 1 : 0) : Math.round((caught.length / new Set(blocking.map((r) => r.ruleId)).size) * 100) / 100,
  };
}
