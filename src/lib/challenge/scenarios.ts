/**
 * The challenge catalogue.
 *
 * A scenario is one business process a participant automates end to end. It is
 * defined in code rather than in the database, because a scenario is part of
 * the contract: its slug, its scoring weights and its steps are what a
 * leaderboard compares people on, and they must not drift between deployments.
 * Scores from different versions of a scenario are not comparable, so a change
 * that alters what is being measured gets a new `version` and a fresh board.
 *
 * Slugs and weights are a public contract, like the rule IDs: never rename a
 * slug, never re-weight a live scenario without bumping its version.
 */
import type { WorkItemQueue } from "@/db/schema";

/** The five things every run is judged on. */
export const PARAMETERS = ["accuracy", "decisions", "exceptions", "coverage", "time"] as const;
export type Parameter = (typeof PARAMETERS)[number];

export const PARAMETER_LABELS: Record<Parameter, string> = {
  accuracy: "Accuracy",
  decisions: "Decisions",
  exceptions: "Exceptions",
  coverage: "Coverage",
  time: "Time",
};

export const PARAMETER_MEANINGS: Record<Parameter, string> = {
  accuracy: "How close the values you entered are to what the documents actually say.",
  decisions: "Whether you did the right thing with each item: approve, reject, pay, hold.",
  exceptions: "The deliberate problems in the data: how many you caught, how many you missed, and how many you raised that were not there.",
  coverage: "How much of the queue you got through.",
  time: "How long the run took against a par time for the queue.",
};

export interface ScenarioStep {
  /** What the participant (or their robot) does. */
  title: string;
  detail: string;
  /** The selectors or endpoints this step uses, quoted verbatim from the app. */
  handles: string[];
}

export interface Scenario {
  slug: string;
  version: number;
  title: string;
  titleAr: string;
  /** One line for the card. */
  tagline: string;
  /** What the business is asking for, in the words a process owner would use. */
  brief: string;
  /** Ordered, so the cards read from easiest to hardest. */
  difficulty: 1 | 2 | 3;
  /** Roughly how long a careful human takes per item, used for the time score. */
  parSecondsPerItem: number;
  /** The queue the work comes from. */
  queue: WorkItemQueue;
  /** How many items a scored run puts in front of you. */
  targetSize: number;
  /** Does this scenario need the documents read, or only the screens driven? */
  documentUnderstanding: boolean;
  weights: Record<Parameter, number>;
  steps: ScenarioStep[];
  /** Rule IDs a participant is expected to meet in this scenario. */
  rules: string[];
  /** What earns a certificate. */
  passMark: number;
}

const WEIGHTS_WITH_DU: Record<Parameter, number> = { accuracy: 40, decisions: 20, exceptions: 25, coverage: 10, time: 5 };
const WEIGHTS_WITHOUT_DU: Record<Parameter, number> = { accuracy: 45, decisions: 25, exceptions: 10, coverage: 15, time: 5 };

export const SCENARIOS: Scenario[] = [
  {
    slug: "invoice-processing",
    version: 1,
    title: "Accounts payable: invoice processing",
    titleAr: "الحسابات الدائنة: معالجة الفواتير",
    tagline: "Read the invoice, match it against the order and the goods received, then approve, reject or hold.",
    brief:
      "Accounts payable receives supplier invoices as PDFs. Accounts payable reads each one, checks it against the purchase order and the goods receipts, and either approves it for payment or sends it back. Roughly a third of the invoices have something wrong with them, and the ones that are wrong are the ones that matter.",
    difficulty: 3,
    parSecondsPerItem: 90,
    queue: "invoices-pending",
    targetSize: 12,
    documentUnderstanding: true,
    weights: WEIGHTS_WITH_DU,
    steps: [
      {
        title: "Take the next invoice",
        detail: "Read the queue and take one item at a time. Every item has a reference, the internal AP number, and a link to the PDF.",
        handles: ["GET /api/work-items?queue=invoices-pending", "POST /api/work-items/claim", "#tile-invoices-pending"],
      },
      {
        title: "Read the document",
        detail: "Download the PDF and extract the header fields and the lines. A pending invoice deliberately hides its values in the application: the document is the only source.",
        handles: ["GET /api/documents/{id}/file?level=N", "#invoice-document", "#invoice-download"],
      },
      {
        title: "Submit what you read",
        detail: "Enter the header and the lines. The three-way match runs on the values you submitted, not on what the system already knows.",
        handles: ["POST /api/extractions", "#extraction-form", "#extraction-field-grandTotal"],
      },
      {
        title: "Read the match result",
        detail: "Every violation carries a rule ID. Branch on the rule ID, never on the message text.",
        handles: ["#validation-errors", "li[data-rule-id]", "#validation-errors[data-blocking]"],
      },
      {
        title: "Decide",
        detail: "A clean invoice is approved and paid. An invoice with a critical finding is never paid: leave it as an exception. An invoice with an error is rejected. Warnings are approved with a note.",
        handles: ["POST /api/invoices/{internalNumber}/approve", "/reject", "/pay", "#invoice-approve", "#invoice-reject", "#invoice-pay"],
      },
      {
        title: "Close the item",
        detail: "Mark the queue item successful, or fail it as a business exception with the rule IDs you found.",
        handles: ["POST /api/work-items/{id}/complete", "POST /api/work-items/{id}/fail"],
      },
    ],
    rules: ["PO-INV-PRICE", "GRN-QTY", "DUP-INV", "BANK-CHANGE", "INV-NO-PO", "INV-TOTAL-TIE", "INV-VENDOR-MASTER", "INV-VENDOR-BLOCKED", "INV-PO-VENDOR", "INV-TAX-RATE", "INV-CURRENCY", "INV-UOM", "INV-LINE-PO", "INV-DATE-FUTURE", "TAX-CERT-EXP"],
    passMark: 60,
  },
  {
    slug: "vendor-onboarding",
    version: 1,
    title: "Procurement: supplier onboarding",
    titleAr: "المشتريات: تأهيل الموردين",
    tagline: "Read a commercial registration certificate, create the supplier, and refuse the ones that should not pass.",
    brief:
      "New suppliers send their commercial registration, tax certificate and a bank letter. Procurement keys them into the master data and checks that the registration is valid, that the tax number belongs to that company, and that nobody is being onboarded twice. An expired certificate is the most common reason to send an application back.",
    difficulty: 2,
    parSecondsPerItem: 120,
    queue: "vendor-applications",
    targetSize: 10,
    documentUnderstanding: true,
    weights: WEIGHTS_WITH_DU,
    steps: [
      {
        title: "Take the next application",
        detail: "Each item carries the vendor code and a link to every compliance document that came with it.",
        handles: ["GET /api/work-items?queue=vendor-applications", "#tile-vendors-pending"],
      },
      {
        title: "Read the certificates",
        detail: "The commercial registration carries the registration number, the legal name in both scripts, the address and the expiry date. The tax card carries the tax number.",
        handles: ["GET /api/documents/{id}/file", "#vendor-documents"],
      },
      {
        title: "Submit what you read",
        detail: "Send the fields you extracted from the certificate, keyed by their ground-truth path.",
        handles: ["POST /api/extractions with documentId"],
      },
      {
        title: "Decide",
        detail: "Approve an application whose documents are valid and consistent. Reject one whose registration or tax certificate has expired, whose numbers fail their check digits, or that duplicates a supplier already in the master.",
        handles: ["POST /api/vendors/{code}/approve", "POST /api/vendors/{code}/reject", "#vendor-approve", "#vendor-reject"],
      },
    ],
    rules: ["VEND-CR-FMT", "VEND-CR-EXP", "VEND-TAXID-FMT", "VEND-TAX-CERT-EXP", "VEND-IBAN", "VEND-DUP-TAXID", "VEND-IBAN-DUP", "VEND-BLACKLIST", "VEND-DUP-NAME"],
    passMark: 60,
  },
  {
    slug: "goods-receipt",
    version: 1,
    title: "Warehouse: goods receipt",
    titleAr: "المستودع: استلام البضائع",
    tagline: "Post what actually arrived against the delivery note, and stop what should not be received.",
    brief:
      "Deliveries arrive with a delivery note quoting the purchase order. The warehouse posts a goods receipt for what physically arrived. Over-deliveries beyond tolerance are not received: the purchase order is the authority, not the note in the driver's hand.",
    difficulty: 1,
    parSecondsPerItem: 60,
    queue: "deliveries-awaiting-grn",
    targetSize: 8,
    documentUnderstanding: false,
    weights: WEIGHTS_WITHOUT_DU,
    steps: [
      {
        title: "Take the next delivery",
        detail: "Delivery notes marked delivered with no goods receipt against them.",
        handles: ["GET /api/work-items?queue=deliveries-awaiting-grn", "GET /api/deliveries/{id}"],
      },
      {
        title: "Post the receipt",
        detail: "Post the quantities the note declares, line by line, against the purchase order.",
        handles: ["POST /api/grns", "#grn-form", "#grn-submit"],
      },
      {
        title: "Handle the refusals",
        detail: "A quantity above the ordered quantity plus tolerance is rejected with GRN-OVER-PO. Record the exception rather than forcing it through.",
        handles: ["#validation-errors", "li[data-rule-id='GRN-OVER-PO']"],
      },
    ],
    rules: ["GRN-OVER-PO", "GRN-LINE-MIN", "GRN-SPLIT", "GRN-QTY"],
    passMark: 60,
  },
  {
    slug: "sourcing-award",
    version: 1,
    title: "Sourcing: award the quotation",
    titleAr: "المصادر: ترسية عرض السعر",
    tagline: "Compare the quotations against a request, award the right one, and raise the purchase order.",
    brief:
      "Buyers send a request for quotation to several suppliers and receive quotes back. The award goes to the quotation that is cheapest among those that are still valid and can deliver in time — not simply the lowest number on the page. Awarding creates a draft purchase order, which then has to be approved.",
    difficulty: 2,
    parSecondsPerItem: 75,
    queue: "rfqs-open",
    targetSize: 6,
    documentUnderstanding: false,
    weights: WEIGHTS_WITHOUT_DU,
    steps: [
      {
        title: "Take the next request",
        detail: "Requests for quotation that have quotations back and no award yet.",
        handles: ["GET /api/work-items?queue=rfqs-open", "GET /api/rfqs/{number}"],
      },
      {
        title: "Compare the quotations",
        detail: "Each quotation carries a total, a validity date and a lead time. A quotation that has expired, or that cannot deliver by the required date, is not eligible however cheap it is.",
        handles: ["#rfq-quotes", "tr[data-quote-id]"],
      },
      {
        title: "Award and raise the order",
        detail: "Awarding the winning quotation creates a draft purchase order. Approve it so the supplier can be told.",
        handles: ["POST /api/rfqs/{number}/award", "POST /api/purchase-orders/{number}/approve", "#rfq-award"],
      },
    ],
    rules: ["PO-APPROVAL-LIMIT", "PO-VENDOR-ACTIVE", "PO-VENDOR-TAX-CERT", "PO-DATES"],
    passMark: 60,
  },
];

export function scenarioBySlug(slug: string): Scenario | null {
  return SCENARIOS.find((s) => s.slug === slug) ?? null;
}

export function isScenarioSlug(slug: string): boolean {
  return SCENARIOS.some((s) => s.slug === slug);
}

/** Par time for a whole run, which the time score is measured against. */
export function parSeconds(scenario: Scenario, items: number): number {
  return scenario.parSecondsPerItem * Math.max(1, items);
}

export const DIFFICULTY_LABELS: Record<Scenario["difficulty"], string> = {
  1: "Warm-up",
  2: "Intermediate",
  3: "Full process",
};
