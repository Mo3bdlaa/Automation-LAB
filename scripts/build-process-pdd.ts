/**
 * The Process Design Document for one process — accounts payable invoice
 * processing — written to the client's own PDD template.
 *
 *   .data/Invoice-Processing-PDD.docx
 *   .data/Invoice-Processing-PDD.pdf
 *
 * Section numbering, chapter order and every table's columns come from that
 * template. The words come from this file, and the facts in them come from the
 * code: the rule catalogue, the scenario definition and the difficulty ladder
 * are all read at build time rather than typed out, because a PDD that
 * disagrees with the system it documents is worse than no PDD — a developer
 * builds against the document and finds out at test time.
 *
 * One deliberate departure from the template is noted in II.4 and explained
 * there: its single seven-column step table is unreadable at A4 portrait, so
 * its columns are carried across two tables — which also leaves the Details
 * column wide enough for the screenshot it asks for, one per step, each with
 * a red box on the part of the screen that step touches.
 *
 *   pnpm pdd:process
 */
import { describeRules } from "../src/lib/validation/engine";
import { ALL_RULES } from "../src/lib/validation/rules";
import { SCENARIOS } from "../src/lib/challenge/scenarios";
import { LEVELS, LEVEL_SPECS } from "../src/lib/documents/levels";
import { COMPANY } from "../src/lib/generator/vocab";
import { buildPdd, type Block, type DocMeta } from "./pdd/render";

const scenario = SCENARIOS.find((s) => s.slug === "invoice-processing");
if (!scenario) throw new Error("The invoice-processing scenario is no longer in the catalogue");

const described = new Map(describeRules(ALL_RULES).map((r) => [r.id, r]));
const rule = (id: string) => {
  const r = described.get(id);
  if (!r) throw new Error(`Rule ${id} is quoted in the PDD but no longer exists`);
  return r;
};
/** The scenario's own rule list, in its own order, with severity and wording from the code. */
const RULES = scenario.rules.map(rule);
const bySeverity = (s: string) => RULES.filter((r) => r.severity === s);

const DOC: DocMeta = {
  title: "Invoice Processing",
  subtitle: "Process Design Document (PDD)",
  version: "1.0",
  date: "2026-09-21",
  author: "Mohammed Shaker",
  status: "Draft for review",
  strapline: "Accounts payable · a Document Understanding automation",
  targetApp: "https://automationlab.mohammedshaker.com",
  description:
    "Process Design Document for the accounts payable invoice-processing automation in Automation Lab.",
};

// ---------------------------------------------------------------------------
// The step list. Both tables in II.4 and the scope lists in III are derived
// from it, so a step cannot be described in one place and forgotten in another.
// ---------------------------------------------------------------------------
interface Step {
  n: number;
  name: string;
  /** The step's thumbnail, captured by scripts/capture-step-shots.mjs. */
  shot: string;
  input: string;
  description: string;
  where: string;
  exception: string;
  actions: string;
  rules: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    shot: "step-01",
    name: "Sign in",
    input: "Robot credential",
    description:
      "Authenticate. A robot holds its own credential and sends Authorization: Bearer al_… on every call; a person signs in through the browser.",
    where: "Sign-in page · POST /api/tokens",
    exception: "401 Unauthorized — the token is expired or revoked.",
    actions: "Stop the job and alert. Never retry a rejected credential in a loop.",
    rules: "—",
  },
  {
    n: 2,
    shot: "step-02",
    name: "Read the queue",
    input: "Queue name invoices-pending",
    description:
      "List the invoices waiting to be read. The queue is the unit of work; nothing is processed that is not in it.",
    where: "GET /api/work-items?queue=invoices-pending · #tile-invoices-pending",
    exception: "The queue is empty.",
    actions: "End the run normally. An empty queue is not an error.",
    rules: "—",
  },
  {
    n: 3,
    shot: "step-03",
    name: "Claim one item",
    input: "Work item id",
    description:
      "Take a single item and hold it. One item at a time: the claim is what stops two robots, or a robot and a person, working the same invoice.",
    where: "POST /api/work-items/claim",
    exception: "409 Conflict — somebody else claimed it first.",
    actions: "Skip it and claim the next item.",
    rules: "—",
  },
  {
    n: 4,
    shot: "step-04",
    name: "Open the invoice",
    input: "Internal AP number",
    description:
      "Read the invoice record. While it is pending extraction the record carries no values: the reference, the AP number and a link to the document are all it will give you.",
    where: "GET /api/invoices/{internalNumber} · #invoice-document",
    exception: "404 Not found — the item points at an invoice that has since been reset.",
    actions: "Fail the work item as a business exception and continue.",
    rules: "—",
  },
  {
    n: 5,
    shot: "step-05",
    name: "Download the document",
    input: "Document id, difficulty level",
    description:
      "Fetch the PDF at the level the run is set to. Level 1 is the file as the system printed it; levels 2 to 5 are progressively worse scans of the same page.",
    where: "GET /api/documents/{id}/file?level=N · #invoice-download",
    exception: "404 — a level above 1 has not been rendered yet.",
    actions: "Wait and retry: levels 2 to 5 are produced on first request.",
    rules: "—",
  },
  {
    n: 6,
    shot: "step-06",
    name: "Read the header",
    input: "The PDF",
    description:
      "Extract the 12 header fields: invoice number, invoice date, due date, PO number, currency, vendor name, vendor tax ID, IBAN, bank name, subtotal, tax total and grand total.",
    where: "#extraction-form · #extraction-field-grandTotal",
    exception: "A field cannot be read, or is read with low confidence.",
    actions: "Route the item to the exception queue rather than guessing a value.",
    rules: "—",
  },
  {
    n: 7,
    shot: "step-07",
    name: "Read the lines",
    input: "The PDF",
    description:
      "Extract 8 fields on every line: PO line, item code, description, quantity, unit of measure, unit price, tax rate and tax amount.",
    where: "#extraction-field-line-{n}-{field}",
    exception: "The line count read does not match the line count printed.",
    actions: "Route to the exception queue. A missed line is a missed charge.",
    rules: "—",
  },
  {
    n: 8,
    shot: "step-08",
    name: "Submit the extraction",
    input: "Header and lines",
    description:
      "Post what was read. The three-way match runs on the submitted values, not on what the system already knows — so a misread digit produces a real violation, exactly as it would in production.",
    where: "POST /api/extractions · #extraction-form",
    exception: "422 — a field is malformed (a date that is not a date, a negative quantity).",
    actions: "Correct the field and resubmit. Do not resubmit unchanged.",
    rules: "Field validation",
  },
  {
    n: 9,
    shot: "step-09",
    name: "Read the match result",
    input: "The match response",
    description:
      "Read the violations. Every one carries a stable rule ID and a severity. Branch on the ID; the message is written for a person and may be reworded.",
    where: "#validation-errors · li[data-rule-id] · #validation-errors[data-blocking]",
    exception: "No response, or a timeout.",
    actions: "Re-read the invoice to see whether the match was applied before retrying.",
    rules: "All 15 — see III.5",
  },
  {
    n: 10,
    shot: "step-10",
    name: "Decide",
    input: "Rule IDs and severities",
    description:
      "One decision per invoice, taken from the highest severity present: clean or warnings only, approve; any error, reject; any critical, leave it as an exception and do not pay.",
    where: "#invoice-approve · #invoice-reject",
    exception: "Severities conflict — an error and a critical on the same invoice.",
    actions: "The highest severity wins. Critical always beats error.",
    rules: "See III.5",
  },
  {
    n: 11,
    shot: "step-11",
    name: "Pay",
    input: "Approved invoice",
    description: "Release an approved invoice for payment. An invoice with a critical finding is never paid.",
    where: "POST /api/invoices/{internalNumber}/pay · #invoice-pay",
    exception: "The invoice is not in an approved state.",
    actions: "Re-read the invoice; another actor may have changed it.",
    rules: "—",
  },
  {
    n: 12,
    shot: "step-12",
    name: "Close the work item",
    input: "Work item id, outcome",
    description:
      "Complete the item, or fail it as a business exception carrying the rule IDs found. An item left open is an item nobody has processed.",
    where: "POST /api/work-items/{id}/complete · /fail",
    exception: "The item was already closed.",
    actions: "Log and continue; do not reopen it.",
    rules: "—",
  },
];

const PAR = scenario.parSecondsPerItem;

const B: Block[] = [
  // -------------------------------------------------------------------------
  { t: "h1", text: "Document History" },
  {
    t: "table",
    header: ["Date", "Version", "Role", "Name", "Organization (Dept.)", "Function", "Comments"],
    rows: [
      ["2026-09-21", "1.0", "Author", "Mohammed Shaker", "Automation Lab", "Business Analyst / RPA", "Created document v1.0 from the process as implemented."],
    ],
    widths: [11, 8, 10, 15, 16, 16, 24],
  },
  { t: "h1", text: "Document Approval Flow" },
  {
    t: "table",
    header: ["Version", "Flow", "Role", "Name", "Organization (Dept.)", "Signature and date"],
    rows: [
      ["1.0", "Document prepared by", "Business Analyst", "Mohammed Shaker", "Automation Lab", ""],
      ["1.0", "Document approved by", "Process Owner", "To be assigned", "Accounts payable", ""],
      ["1.0", "Document approved by", "RPA Solution Architect", "To be assigned", "Automation CoE", ""],
    ],
    widths: [9, 20, 18, 18, 18, 17],
  },
  {
    t: "note",
    text: `The company in this document does not exist. ${COMPANY.name} is the fictional buyer every participant works for, and every vendor, order, invoice, tax number and bank account in it is generated for training. Contacts are named as roles rather than people for that reason.`,
  },
  { t: "pagebreak" },

  // -------------------------------------------------------------------------
  { t: "h1", text: "I. Introduction" },
  { t: "h2", text: "I.1 Purpose of the Document" },
  {
    t: "p",
    text: "This Process Design Document describes the accounts payable invoice-processing process selected for automation with UiPath Robotic Process Automation, and the Document Understanding that process depends on. It records the sequence of steps performed, the conditions and rules that govern each decision, the inputs the process consumes and the exceptions it has to survive.",
  },
  {
    t: "p",
    text: "It is written to be built from. Every endpoint, element id, rule identifier and field name in it is the one the application actually exposes, and the tables of rules and difficulty levels are generated from the source at build time. Where a developer has a choice to make — a confidence threshold, a retry budget — the document says so rather than inventing a number.",
  },
  { t: "h2", text: "I.2 Objectives" },
  {
    t: "p",
    text: `The process selected for RPA sits in accounts payable. The business objectives expected after automation are:`,
  },
  {
    t: "bullets",
    items: [
      `Reduce handling time per invoice. A competent person takes about ${PAR} seconds an invoice end to end, which is the baseline the lab scores time against.`,
      "Remove the transcription step. Twelve header fields and eight fields per line are read off a document and keyed by hand today; every one of them is an opportunity for a typing error that the three-way match will then blame on the supplier.",
      "Make the exception path explicit. A defect found by a rule is routed by that rule's identifier rather than by a person's reading of a message.",
      "Produce an audit trail. Every decision is recorded against the rule identifiers that justified it.",
      "Keep the judgement with people. Anything the robot is not confident about, and anything with a critical finding, goes to a person — by design, not by failure.",
    ],
  },
  { t: "h2", text: "I.3 Key Contacts" },
  {
    t: "table",
    header: ["Role", "Name", "Contact details", "Notes"],
    rows: [
      ["Process SME", "Accounts payable lead", "ap@automation-lab.example", "Questions on how an invoice is handled today and why."],
      ["Process Reviewer", "Automation CoE", "coe@automation-lab.example", "Reviews this document for completeness."],
      ["Process Owner / approver for production", "Head of Finance", "finance@automation-lab.example", "Escalations, exception policy, sign-off."],
      ["Technical contact", "Automation Lab platform", "https://automationlab.mohammedshaker.com/api/docs", "The live API reference; the OpenAPI document is served from the application."],
    ],
    widths: [20, 18, 28, 34],
  },
  { t: "h2", text: "I.4 Minimum Prerequisites for Automation" },
  {
    t: "bullets",
    items: [
      "This Process Design Document, reviewed and signed off.",
      "An account on the target application, and a sandbox provisioned for it.",
      "A personal API token for the robot (Sandbox page, or POST /api/tokens). The robot must hold its own credential, not a person's.",
      "A Document Understanding capability able to read Arabic as well as English, and Eastern Arabic numerals as well as Western ones.",
      "An agreed confidence threshold below which an item goes to a person instead of being decided.",
      "An exception queue with an owner, and an agreed response time for items placed in it.",
    ],
  },
  { t: "pagebreak" },

  // -------------------------------------------------------------------------
  { t: "h1", text: "II. As-Is Process Description" },
  { t: "h2", text: "II.1 Process Overview" },
  { t: "p", text: "General information about the process prior to automation." },
  {
    t: "table",
    header: ["#", "Item", "Description"],
    rows: [
      ["1", "Process full name", scenario.title],
      ["2", "Process area", "Finance"],
      ["3", "Department", "Accounts payable"],
      ["4", "Process short description", scenario.brief],
      ["5", "Roles required", "Accounts payable clerk. An AP supervisor for anything held as an exception."],
      ["6", "Schedule and frequency", "Continuous. Invoices arrive through the day and are worked from a queue; the practice queue is open all year."],
      ["7", "Items per reference period", `${scenario.targetSize} invoices in a scored run. A freshly provisioned sandbox holds about 30 invoices pending extraction.`],
      ["8", "Average handling time per item", `${PAR} seconds. This is the baseline the time parameter is scored against, not an observed average.`],
      ["9", "Peak periods", "Month end and the days after a delivery run, when several invoices arrive for the same order."],
      ["10", "Transaction volume during peak", "Not modelled. The queue is fixed at provisioning so that every participant works the same volume."],
      ["11", "FTEs supporting the activity", "One clerk per sandbox."],
      ["12", "Expected change in volume", "None. Volume is a property of the exercise, not of a business."],
      ["13", "Level of exception rate", "About one invoice in three carries at least one seeded defect, and the defective ones are the ones that matter."],
      ["14", "Input data", "A vendor tax invoice as a PDF, at one of five difficulty levels. About half the vendors print bilingual, a third print Arabic first, and two in five write their numbers in Eastern Arabic digits."],
      ["15", "Output data", "An invoice status — approved, rejected or exception — a payment record where the invoice was paid, and a closed work item carrying the rule identifiers found."],
      ["16", "Process owner", "Head of Finance (see I.3)."],
    ],
    widths: [5, 22, 73],
  },
  { t: "h2", text: "II.2 Applications Used in the Process" },
  {
    t: "table",
    header: ["#", "Application name & version", "System language", "Thin / thick client", "Environment / access method", "Comments"],
    rows: [
      ["1", "Automation Lab (web)", "EN / AR", "Thin client", "Browser over HTTPS", "The ERP under automation. Every interactive element carries a stable id and data-testid."],
      ["2", "Automation Lab REST API v1", "EN", "n/a", "HTTPS, Authorization: Bearer al_…", "The same operations without a browser. Documented at /api/docs; OpenAPI at /api/openapi."],
      ["3", "UiPath Studio and Robot", "EN", "Thick client", "Windows", "Where the automation is built and run."],
      ["4", "Document Understanding / OCR", "EN / AR", "Varies", "Per team", "Must handle right-to-left text and Eastern Arabic numerals. Choice of engine is out of scope for this document."],
      ["5", "PDF reader", "EN", "Thick client", "Windows", "For a person checking a held document by hand."],
    ],
    widths: [5, 20, 11, 12, 21, 31],
  },
  { t: "h2", text: "II.3 As-Is Process Map" },
  { t: "h3", text: "High-level as-is process map" },
  {
    t: "p",
    text: "The process at the level a business reader needs: an invoice arrives, somebody reads it, finds the two documents it has to agree with, compares them and decides. {{fig:map-as-is-high}} shows it as five stages.",
  },
  { t: "figure", id: "map-as-is-high" },
  { t: "h3", text: "Detailed as-is process map" },
  {
    t: "p",
    text: "{{fig:map-as-is}} shows the same process with the parties separated. Every step in the middle lane is performed by a person today. The three outcomes on the bottom row are the only three ways an invoice can leave the process.",
  },
  { t: "figure", id: "map-as-is" },
  { t: "pagebreak" },
  { t: "h2", text: "II.4 Detailed As-Is Process Steps" },
  {
    t: "p",
    text: "The twelve steps a developer has to build. The template carries seven columns in one table; at A4 portrait that leaves each column under an inch, which is too narrow for a description and far too narrow for the screenshot the template's Details column asks for. So they are split across the two tables below: what each step does and which screen it happens on, then what it consumes, which endpoint or element drives it, and what can go wrong.",
  },
  { t: "h3", text: "What each step does, and where" },
  {
    t: "p",
    text: "The red box on each screen marks what the step touches. The endpoints and element ids behind those screens are in the second table, with the exceptions they raise.",
  },
  {
    t: "table",
    header: ["Step", "Description", "Screen", "Rules"],
    rows: STEPS.map((s) => [`${s.n}. ${s.name}`, s.description, { img: s.shot }, s.rules]),
    widths: [12, 39, 38, 11],
  },
  { t: "h3", text: "What each step consumes, drives and can fail on" },
  {
    t: "table",
    header: ["Step", "Input", "Endpoint / selector", "Exception handling", "Possible actions"],
    rows: STEPS.map((s) => [`${s.n}. ${s.name}`, s.input, s.where, s.exception, s.actions]),
    widths: [11, 15, 25, 24, 25],
  },
  { t: "pagebreak" },
  { t: "h3", text: "The queue the process works from" },
  {
    t: "p",
    text: "{{fig:02-invoice-queue}} is the inbox filtered to invoices pending extraction. This is the list step 2 reads, and the count on it is the work in front of the process.",
  },
  { t: "figure", id: "02-invoice-queue" },
  { t: "h3", text: "An invoice before it has been read" },
  {
    t: "p",
    text: "{{fig:03-invoice-pending}} is the point of the exercise. A pending invoice shows its reference and its document and nothing else: the values are on the page, not in the system, and the only way to get them is to read them.",
  },
  { t: "figure", id: "03-invoice-pending" },
  { t: "h3", text: "Where the read values are entered" },
  {
    t: "p",
    text: "{{fig:04-extraction-form}} is the form steps 6 to 8 fill: twelve header fields above, then one row per invoice line with eight fields each.",
  },
  { t: "figure", id: "04-extraction-form" },
  { t: "h3", text: "What comes back" },
  {
    t: "p",
    text: "{{fig:05-match-exception}} is the match result step 9 reads. Each violation is a list item carrying data-rule-id, and the container carries data-blocking when at least one of them stops payment.",
  },
  { t: "figure", id: "05-match-exception" },
  { t: "pagebreak" },

  { t: "h2", text: "II.5 Input Data Description" },
  {
    t: "table",
    header: ["Step", "Sample", "Input type", "Location", "Standard?", "Structured?", "Data used from the input"],
    rows: [
      ["5, 6, 7", "{{fig:12-document-invoice}}", "PDF document", "GET /api/documents/{id}/file?level=N", "No — each vendor prints its own layout, script and number system", "Only at level 1. Levels 2 to 5 are images of paper", "12 header fields; 8 fields on each line"],
      ["4", "{{fig:13-document-purchase-order}}", "Reference record", "GET /api/purchase-orders/{number}", "Yes", "Yes", "PO number, vendor, currency, lines, agreed prices and quantities"],
      ["9", "{{fig:05-match-exception}}", "Screen element / JSON", "#validation-errors, response of POST /api/extractions", "Yes", "Yes", "Rule ID, severity, field path"],
    ],
    widths: [7, 16, 12, 22, 16, 14, 13],
  },
  {
    t: "note",
    text: "Inputs are standard if the content sits in the same place every time. Inputs are structured if they are machine-readable and digital: a scanned image is not.",
  },
  { t: "h3", text: "The document itself" },
  {
    t: "p",
    text: "{{fig:12-document-invoice}} is a vendor tax invoice as the lab generates it. The three regions a reader has to find are always present and never in the same place twice: the header, the lines, and the totals block — which is printed, and does not always agree with the sum of the lines.",
  },
  { t: "figure", id: "12-document-invoice" },
  {
    t: "p",
    text: "{{fig:16-arabic-invoice}} is the same document from a vendor that prints Arabic first. An extraction built only against the English layout stops here.",
  },
  { t: "figure", id: "16-arabic-invoice" },
  { t: "h3", text: "The five difficulty levels" },
  {
    t: "p",
    text: "The same invoice is served at five levels of degradation. The level is a request parameter, so the same document can be read again at a harder setting without changing anything else. {{fig:15-difficulty-ladder}} shows three of them side by side with the totals block magnified.",
  },
  {
    t: "table",
    header: ["Level", "Name", "What it is"],
    rows: LEVELS.map((n) => LEVEL_SPECS[n]).map((l) => [String(l.level), l.label, l.description]),
    widths: [8, 18, 74],
  },
  { t: "figure", id: "15-difficulty-ladder" },
  {
    t: "p",
    text: "{{fig:13-document-purchase-order}} is the reference document step 4 reads: the purchase order the invoice has to agree with.",
  },
  { t: "figure", id: "13-document-purchase-order" },
  { t: "pagebreak" },

  // -------------------------------------------------------------------------
  { t: "h1", text: "III. To-Be Process Description" },
  { t: "p", text: "The expected design of the process after automation." },
  { t: "h2", text: "III.1 To-Be Detailed Process Map" },
  {
    t: "p",
    text: "{{fig:map-to-be}} is the as-is map with one lane changed hands. Steps shown in orange are performed by the robot; everything else is unchanged, including the three outcomes. The process is not redesigned — that is the point of comparing the two maps.",
  },
  { t: "figure", id: "map-to-be" },
  {
    t: "p",
    text: "One process improvement is proposed on the to-be design and nothing else: the robot records the rule identifiers behind every decision on the work item it closes, which no one does today. That is what makes III.7 possible.",
  },
  { t: "h2", text: "III.2 Parallel Initiatives / Overlap" },
  {
    t: "table",
    header: ["#", "Initiative", "Step affected", "Impact on this automation", "Expected completion", "Contact"],
    rows: [
      ["1", "Supplier onboarding automation", "None directly — it maintains the vendor master this process reads", "A vendor created incorrectly there surfaces here as INV-VENDOR-MASTER", "Not scheduled", "Automation CoE"],
    ],
    widths: [5, 20, 22, 26, 14, 13],
  },
  { t: "h2", text: "III.3 In Scope for RPA" },
  { t: "p", text: "Steps 1 to 12 of II.4, in full:" },
  { t: "bullets", items: STEPS.map((s) => `Step ${s.n} — ${s.name}. ${s.description.split(".")[0]}.`) },
  { t: "h2", text: "III.4 Out of Scope for RPA" },
  {
    t: "table",
    header: ["Sub-process", "Activity", "Reason for being out of scope", "Impact on the to-be", "Possible measures"],
    rows: [
      ["1.1", "Bank transmission of an approved payment", "The process ends at a payment record; no money moves", "None — the to-be ends where the as-is ends", "Treat the payment record as the hand-off point to treasury"],
      ["1.2", "Vendor master maintenance", "A separate process with its own owner and its own document", "A blocked or missing vendor arrives as a critical finding", "Route INV-VENDOR-MASTER and INV-VENDOR-BLOCKED to the vendor team, not to AP"],
      ["1.3", "Credit notes and disputes", "Not modelled in the source system", "A rejected invoice is returned; what happens next is manual", "Document the manual follow-up separately"],
      ["1.4", "Judging a document that cannot be read", "Requires a person to look at paper", "The robot routes it; it does not decide it", "Exception queue with an owner and a response time"],
      ["1.5", "Choosing the confidence threshold", "A design decision, per team and per document type", "Determines how much of the volume a person still sees", "Tune against a measured run, then fix it and record it here"],
    ],
    widths: [10, 22, 24, 22, 22],
  },
  { t: "pagebreak" },

  { t: "h2", text: "III.5 Business Exceptions Handling" },
  {
    t: "table",
    header: ["Known", "Unknown"],
    rows: [
      [
        "Previously encountered. A scenario is defined, a rule identifies it, and an action is agreed in advance. All fifteen below are known.",
        "A situation never encountered before. It can be caused by a change in the document, in the vendor master or in the process itself.",
      ],
    ],
    widths: [50, 50],
  },
  { t: "h3", text: "Known exceptions" },
  {
    t: "p",
    text: `Every business exception in this process is raised by a named rule, and every rule identifier is a published contract: it appears in the catalogue at /api/rules, it is returned on the element that reports the violation, and it does not change. Branch on the identifier, never on the message text. ${bySeverity("critical").length} of the ${RULES.length} are critical, ${bySeverity("error").length} are errors and ${bySeverity("warning").length} are warnings.`,
  },
  {
    t: "table",
    header: ["BE #", "Exception name (rule ID)", "Step", "Parameters", "Action to be taken"],
    rows: RULES.map((r, i) => [
      `BE${i + 1}`,
      `${r.id} — ${r.severity}`,
      r.appliesTo === "invoice_line" ? "7, 9, 10" : "6, 9, 10",
      r.description + (Object.keys(r.params).length ? ` Parameters: ${JSON.stringify(r.params)}.` : ""),
      r.severity === "critical"
        ? "Never pay. Leave the invoice as an exception, fail the work item with this rule ID, and hand it to a person."
        : r.severity === "error"
          ? "Reject the invoice back to the supplier, citing this rule ID. Close the work item as handled."
          : "Approve with a note recording this rule ID. A warning does not stop payment.",
    ]),
    widths: [8, 18, 9, 33, 32],
  },
  { t: "h3", text: "Unknown exceptions" },
  {
    t: "p",
    text: "For any business situation not covered above, the robot must not decide. It leaves the invoice untouched, fails the work item as a business exception with the response it received, and notifies the exception queue owner with a screenshot or the raw response attached.",
  },
  {
    t: "p",
    text: "{{fig:09-rule-catalogue}} is the rule catalogue as the application publishes it. It is also available as JSON at /api/rules, which is the version a robot should read if it needs to reason about severity at run time rather than hard-coding it.",
  },
  { t: "figure", id: "09-rule-catalogue" },
  { t: "pagebreak" },

  { t: "h2", text: "III.6 Application Error and Exception Handling" },
  {
    t: "table",
    header: ["Area", "Known", "Unknown"],
    rows: [
      [
        "Technology / applications",
        "Experienced before; a retry policy or workaround is agreed. The seven below are known.",
        "New, or caused by a change outside this process. Escalate rather than retry indefinitely.",
      ],
    ],
    widths: [20, 40, 40],
  },
  { t: "h3", text: "Known errors and exceptions" },
  {
    t: "table",
    header: ["#", "Error name", "Step", "Parameters", "Action to be taken"],
    rows: [
      ["1", "Application crash or 5xx from the API", "Any", "HTTP status, response body", "Retry three times with exponential backoff. If it still fails, close the application, reopen it and take the item again; then fail the item as an application exception."],
      ["2", "401 Unauthorized", "1, any", "Token prefix", "Do not retry in a loop — a rejected credential does not recover by being tried again. Stop the job and alert."],
      ["3", "429 Too Many Requests", "Any", "Retry-After header", "Honour Retry-After. The limits exist so that one runaway robot does not take the platform down for everybody."],
      ["4", "409 Conflict on claim", "3", "Work item id", "Another actor holds the item. Skip it and claim the next."],
      ["5", "404 on the document file", "5", "Document id, level", "A level above 1 is rendered on first request. Wait and retry before treating it as missing."],
      ["6", "Timeout while submitting the extraction", "8", "Internal AP number", "Re-read the invoice before resubmitting: the submission may have been applied. Never blind-retry a write."],
      ["7", "Document unreadable, or confidence below threshold", "6, 7", "Field name, confidence", "Do not guess. Route the item to the exception queue and record which field failed and at which level."],
    ],
    widths: [5, 22, 8, 18, 47],
  },
  { t: "h3", text: "Unknown errors and exceptions" },
  {
    t: "p",
    text: "For anything else, the robot stops work on the item, closes the applications it opened, fails the work item as an application exception, and notifies the exception queue owner with the error and a screenshot attached.",
  },
  { t: "h2", text: "III.7 Reporting" },
  {
    t: "table",
    header: ["#", "Report type", "Update frequency", "Details", "Where it is visible"],
    rows: [
      ["1", "Run summary", "On completion of a run", `Score out of 100 across the five parameters — accuracy ${scenario.weights.accuracy}, decisions ${scenario.weights.decisions}, exceptions ${scenario.weights.exceptions}, coverage ${scenario.weights.coverage}, time ${scenario.weights.time} — and pass or fail against ${scenario.passMark}.`, "Run result page in the application"],
      ["2", "Transaction log", "Per item", "Every work item: claimed, completed or failed, with the rule IDs recorded on it.", "GET /api/work-items"],
      ["3", "Exception log", "Daily", "Items failed as business exceptions, grouped by rule ID. The rule that fires most is the one to work on.", "GET /api/work-items?status=failed"],
      ["4", "Error log", "Daily", "Application errors by type, and the background job log.", "Sandbox page; GET /api/sandbox"],
      ["5", "Certificate register", "On issue", "Certificates issued for a passing run, each with a code anybody can verify.", "/verify/{code}"],
    ],
    widths: [5, 16, 15, 42, 22],
  },
  { t: "pagebreak" },

  // -------------------------------------------------------------------------
  { t: "h1", text: "IV. Other Observations" },
  {
    t: "bullets",
    items: [
      "The application is built to be automated. Every interactive element carries both an id and a data-testid, tables are real paginated HTML, there is no virtualisation, no infinite scroll, no shadow DOM and no CAPTCHA. Selectors are a published contract, not an implementation detail.",
      "Every screen has an endpoint behind it. A robot may drive the process entirely through the API with no browser involved, and the scoring does not care which route was taken.",
      "The difficulty level is the variable that matters. The same process at level 1 and at level 4 is the same clicks and a completely different reading problem; measure the automation at the level it will meet in production, not at the level that demonstrates well.",
      "A held invoice costs as much as a wrongly paid one. The scoring counts an invented exception against the run, because in production an exception queue nobody trusts is an exception queue nobody works.",
      "Timing: the time parameter is worth only 5 points of 100. Accuracy and correct decisions are worth 60 between them. Optimise the reading before the speed.",
    ],
  },
  { t: "h1", text: "V. Additional Sources of Process Documentation" },
  {
    t: "table",
    header: ["Documentation", "Where it is", "Comments"],
    rows: [
      ["Live API reference", "/api/docs on the target application", "Generated from the same definition the server validates against; OpenAPI JSON at /api/openapi."],
      ["Validation rule catalogue", "/rules in the application; /api/rules as JSON", "The authoritative list of rule identifiers, severities and parameters."],
      ["Selector contract", "docs/selectors.md in the repository", "Which ids and data-testids are stable, and what a change to one would break."],
      ["Scenario catalogue", "/api/scenarios", "This process as the challenge defines it: steps, handles, weights and pass mark."],
      ["Platform PDD", ".data/Automation-Lab-PDD.pdf", "The lab-wide document covering all four processes and the platform."],
      ["Session deck", "course/invoice-processing-deck.pdf", "The same process taught as a two-hour session."],
    ],
    widths: [24, 30, 46],
  },
];

buildPdd({
  doc: DOC,
  blocks: B,
  outBase: ".data/Invoice-Processing-PDD",
  figureFiles: ["docs/pdd-assets/figures.json", "docs/pdd-assets/diagrams.json", "docs/pdd-assets/steps.json"],
})
  .then(({ docx, pdf, pages }) =>
    console.log(
      `Wrote .data/Invoice-Processing-PDD.docx (${docx} bytes) and .pdf (${pages} pages, ${pdf} bytes); ${STEPS.length} steps, ${RULES.length} business exceptions`,
    ),
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
