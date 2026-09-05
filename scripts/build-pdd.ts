/**
 * Builds the Process Definition Document (PDD) for Automation Lab in three
 * formats from one content model:
 *   docs/pdd.md                       (tracked in the repository)
 *   .data/Automation-Lab-PDD.docx     (Word, for distribution)
 *   .data/Automation-Lab-PDD.pdf      (PDF via the lab's Chromium renderer)
 * The rule catalogue in the appendix is read from the code, so it cannot drift.
 *   pnpm tsx scripts/build-pdd.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType,
} from "docx";
import { describeRules } from "../src/lib/validation/engine";
import { ALL_RULES } from "../src/lib/validation/rules";
import { closeRenderer, renderHtmlToPdf } from "../src/lib/documents/renderer";
import { fontFaceCss } from "../src/lib/documents/fonts";

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------
type Block =
  | { t: "h1" | "h2" | "h3"; text: string }
  | { t: "p"; text: string }
  | { t: "bullets"; items: string[] }
  | { t: "numbered"; items: string[] }
  | { t: "table"; header: string[]; rows: string[][]; widths?: number[] }
  | { t: "note"; text: string }
  | { t: "figure"; id: string }
  | { t: "pagebreak" };

interface Figure {
  id: string;
  title: string;
  file: string;
  width: number;
  height: number;
  scale: number;
  callouts: { n: number; selector: string; text: string }[];
}

/**
 * Screenshots captured by scripts/capture-pdd-figures.mjs against a running
 * lab with a provisioned sandbox. Figures are numbered in document order.
 */
const FIGURES: Map<string, Figure> = new Map(
  (JSON.parse(readFileSync("docs/pdd-assets/figures.json", "utf8")) as Figure[]).map((f) => [f.id, f]),
);
const figureNumbers = new Map<string, number>();
function figureOf(id: string): Figure & { n: number } {
  const f = FIGURES.get(id);
  if (!f) throw new Error(`Figure "${id}" is missing. Run: node scripts/capture-pdd-figures.mjs`);
  return { ...f, n: figureNumbers.get(id)! };
}

const DOC = {
  title: "Automation Lab",
  subtitle: "Process Definition Document (PDD)",
  version: "1.0",
  date: "2026-09-05",
  author: "Mohammed Shaker",
  status: "Draft for review",
};

const rules = describeRules(ALL_RULES);
const ruleTable = (applies: string[]) =>
  rules.filter((r) => applies.includes(r.appliesTo)).map((r) => [r.id, r.severity, r.appliesTo.replace(/_/g, " "), r.description + (Object.keys(r.params).length ? ` Parameters: ${JSON.stringify(r.params)}.` : "")]);

const B: Block[] = [
  { t: "h1", text: "1. Introduction" },
  { t: "h2", text: "1.1 Purpose of the document" },
  { t: "p", text: "This Process Definition Document describes the procurement processes that students automate in Automation Lab, the practice sandbox of the Document Understanding and RPA course. It follows the structure of a standard UiPath PDD: the AS-IS process as a human performs it in the target application, the TO-BE process as an attended or unattended automation, the exceptions the automation must handle, and the acceptance criteria. It also fixes the scope of the remaining platform phases (P2, P3 and P4) so that the lab, the exercises and the grading evolve together." },
  { t: "p", text: "Two audiences use it. Students read sections 2 and 3 as they would read a PDD handed to them by a client: it is the specification of what to build. The instructor and developers read section 4 and the appendices: they define what the platform must provide in each phase and how it is verified." },
  { t: "h2", text: "1.2 Objectives" },
  { t: "bullets", items: [
    "Give students a realistic, ERP-like target application with stable selectors, a REST API and a large, coherent document set, so course time goes to document understanding and process design rather than to fighting flaky automation.",
    "Grade extraction accuracy and exception handling automatically against ground truth the lab already knows, because it generated every document.",
    "Make every exercise replayable: a sandbox reset restores identical starting conditions, and every student works at the same fictional company so results are comparable.",
    "Exercise the full procurement cycle (RFQ, quotation, purchase order, delivery note, goods receipt, invoice, payment) with labelled defects that break the three-way match in instructive ways.",
  ] },
  { t: "h2", text: "1.3 Process key contacts" },
  { t: "table", header: ["Role", "Name / group", "Responsibility in the lab"], widths: [2200, 2600, 4560], rows: [
    ["Process owner", "Mohammed Shaker (instructor)", "Owns the process definitions, the rule catalogue and the grading scheme. Approves scope changes."],
    ["Subject-matter expert", "Teaching assistants", "Answer questions on procurement rules (three-way match, tolerances, vendor compliance). Review exception handling."],
    ["Business analyst", "Student (per exercise)", "Reads this PDD, documents the AS-IS process in their own words, records assumptions."],
    ["Solution architect / developer", "Student (per exercise)", "Designs the dispatcher and performer, implements the workflows, handles business and application exceptions."],
    ["Platform", "Automation Lab (automationlab.mohammedshaker.com)", "Provides the target application, documents, ground truth, REST API and grading."],
  ] },
  { t: "h2", text: "1.4 Minimum prerequisites for automation" },
  { t: "bullets", items: [
    "A course enrollment that includes lab access. There is no signup in the lab; identity is owned by mohammedshaker.com.",
    "UiPath Studio (Community or Enterprise) and an Orchestrator tenant with one queue per exercise.",
    "UiPath Document Understanding access for the extraction exercises (or an equivalent OCR and extraction approach approved by the instructor).",
    "A modern Chromium-based browser with the UiPath extension. The lab uses no shadow DOM, no canvas grids and no CAPTCHA.",
    "For the API exercises: an HTTP client and the ability to hold a session cookie (30-day lifetime).",
  ] },

  { t: "pagebreak" },
  { t: "h1", text: "2. AS-IS process description" },
  { t: "h2", text: "2.1 Process overview" },
  { t: "p", text: "Three processes are automated during the course, each in a UI variant and later an API variant. All three run at Al-Nahda Trading & Contracting Co., the fictional company every student works for. Volumes below are per student sandbox at provisioning; the figures grow as students create records." },
  { t: "table", header: ["Item", "P1 Invoice processing with three-way match", "P2 Vendor onboarding from commercial licence", "P3 Purchase orders awaiting invoice"], widths: [1900, 2560, 2450, 2450], rows: [
    ["Function / department", "Accounts payable", "Procurement, vendor master", "Accounts payable / procurement"],
    ["Process owner", "AP team lead", "Procurement manager", "AP team lead"],
    ["Trigger", "Invoice registered in the AP inbox with status Pending extraction", "Vendor application with status Pending and a commercial registration certificate on file", "Purchase order status Received or Partially received with no matched invoice"],
    ["Volume per sandbox", "About 30 pending invoices, of which about 30 % carry a seeded defect; 6 stand-alone invoices with no PO or unknown vendor", "About 13 pending vendor applications; 250 vendors with 4 compliance documents each", "About 20 purchase orders"],
    ["Frequency", "Daily", "Weekly", "Daily"],
    ["Average handling time (human)", "6 to 8 minutes per invoice", "5 minutes per application", "3 minutes per PO"],
    ["Input", "Invoice PDF (level 1 native text in P1; scanned levels from P3)", "Commercial registration certificate PDF; tax card, bank letter, trade licence", "PO detail page, related delivery notes and goods receipts"],
    ["Output", "Invoice in status Matched, Exception, Approved, Rejected or Paid; extraction stored", "Vendor record created or corrected; status Active or Blocked", "List of POs with open receipts and no invoice; escalation to buyer"],
    ["Peak periods", "Month end", "Quarter start", "Month end"],
  ] },

  { t: "h2", text: "2.2 Applications used" },
  { t: "table", header: ["Application", "Type", "Access", "Notes for automation"], widths: [2300, 1500, 2300, 3260], rows: [
    ["Automation Lab web application", "Web (server-rendered HTML, ERP-style)", "https://automationlab.mohammedshaker.com, session cookie after login", "Every interactive element carries both id and data-testid with the same value. Tables are real HTML tables with fixed page size 25 and page in the URL. Status badges expose data-status. Validation results render in #validation-errors with data-rule-id per line."],
    ["Automation Lab REST API", "HTTPS JSON", "Same session cookie; bearer tokens from P2", "Documents download with Content-Disposition attachment and predictable file names. 409 with Retry-After means a PDF is still rendering."],
    ["PDF documents", "Files", "Download links on detail pages, bulk ZIP per queue", "Level 1 documents are native text and can be read without OCR. Levels 2 to 5 (P3) are scans of increasing difficulty."],
    ["UiPath Orchestrator", "SaaS", "Student tenant", "Queues for dispatcher/performer; assets for the lab URL and credentials."],
  ] },
  { t: "figure", id: "01-launchpad" },

  { t: "h2", text: "2.3 Detailed AS-IS steps: P1 Invoice processing" },
  { t: "p", text: "The AP clerk starts from the launchpad ({{fig:01-launchpad}}), opens the queue of invoices pending extraction ({{fig:02-invoice-queue}}) and works the oldest first." },
  { t: "table", header: ["#", "Action", "Screen / selector", "Business rule"], widths: [500, 3100, 3000, 2760], rows: [
    ["1", "Open the AP inbox filtered to pending invoices.", "/invoices?status=pending_extraction, table #invoices-table, rows #invoices-row-{INV-YYYY-NNNNN}", "Work oldest received date first."],
    ["2", "Open one invoice.", "/invoices/{INV-YYYY-NNNNN}; #invoice-document with data-rendered", "While pending, field values are hidden. Only the PDF is available."],
    ["3", "Download the PDF.", "#invoice-download (attachment, file name INV-YYYY-NNNNN_VENDOR.pdf)", "If data-rendered is 0, wait and retry; do not proceed without the file."],
    ["4", "Read header fields: invoice number, dates, PO reference, vendor name and tax ID, IBAN, bank, currency, totals.", "PDF", "Read what is printed, even when it looks wrong. The match, not the reader, decides."],
    ["5", "Read every line: PO line, item code, description, quantity, unit of measure, unit price, VAT %, tax amount, line total.", "PDF", "Lines may be a subset of the PO lines or partial quantities."],
    ["6", "Enter the fields into the extraction form.", "#extraction-form, #extraction-field-{field}, #extraction-field-line-{n}-{field}", "Leave unused lines blank. Do not invent values for blank fields."],
    ["7", "Submit.", "#extraction-submit", "The three-way match runs on the submitted values against the referenced PO and posted goods receipts."],
    ["8", "Read the result.", "#validation-errors with data-count and data-blocking; each li has data-rule-id and data-severity", "Branch on rule IDs, never on message text. Warnings do not block."],
    ["9", "Decide: approve when the match is clean or only warnings; reject or route as exception otherwise.", "#invoice-approve, #invoice-reject", "See section 3.4 for the rule-to-action table."],
    ["10", "Pay approved invoices.", "#invoice-pay", "Creates a payment (PAY-YYYY-9NNNN) to the IBAN as printed. BANK-CHANGE must have been resolved before this step."],
  ] },
  { t: "figure", id: "02-invoice-queue" },
  { t: "figure", id: "03-invoice-pending" },
  { t: "figure", id: "12-document-invoice" },
  { t: "figure", id: "04-extraction-form" },
  { t: "figure", id: "05-match-exception" },

  { t: "h2", text: "2.4 Detailed AS-IS steps: P2 Vendor onboarding" },
  { t: "p", text: "The buyer opens a vendor application, downloads the compliance documents on file ({{fig:07-vendor-compliance}}) and reads the commercial registration certificate ({{fig:14-document-licence}})." },
  { t: "table", header: ["#", "Action", "Screen / selector", "Business rule"], widths: [500, 3100, 3000, 2760], rows: [
    ["1", "List pending vendor applications.", "/vendors?status=pending, #vendors-table", "Applications are vendor records in status Pending."],
    ["2", "Open the vendor and its compliance documents.", "/vendors/{V-NNNNN}, #vendor-documents-table, #vendor-documents-download-vendor_licence", "The licence PDF renders on first download; allow a few seconds."],
    ["3", "Extract from the commercial registration certificate: CR number, legal form, activities, capital, manager, issue and expiry dates.", "PDF (id doc-number, doc-issued, doc-expiry inside the PDF text)", "CR number must be 10 digits with a valid mod-11 check digit (VEND-CR-FMT)."],
    ["4", "Extract from the tax card: tax registration number and expiry.", "PDF", "15 digits, starts with 3, Luhn check (VEND-TAXID-FMT). Expired certificates are a warning (VEND-TAX-CERT-EXP)."],
    ["5", "Extract from the bank letter: IBAN, SWIFT, account name.", "PDF", "IBAN must pass mod-97 (VEND-IBAN). Account name must match the vendor name."],
    ["6", "Compare with the record and correct it; check for duplicates by tax ID, IBAN and name.", "/vendors/{code}/edit, #vendor-form", "VEND-DUP-TAXID and VEND-IBAN-DUP are critical: stop and escalate."],
    ["7", "Set status Active (or Blocked when blacklisted or documents expired) and save.", "#vendor-field-status, #vendor-submit", "Shared-corpus vendors are read-only; create a sandbox vendor when the exercise says so."],
  ] },
  { t: "figure", id: "07-vendor-compliance" },
  { t: "figure", id: "14-document-licence" },

  { t: "h2", text: "2.5 Detailed AS-IS steps: P3 Purchase orders awaiting invoice" },
  { t: "p", text: "The purchase order object page shows every document raised against the order ({{fig:06-purchase-order}}), which is how the clerk sees at a glance whether goods were received and whether an invoice has arrived." },
  { t: "table", header: ["#", "Action", "Screen / selector", "Business rule"], widths: [500, 3100, 3000, 2760], rows: [
    ["1", "List received purchase orders.", "/purchase-orders?status=received (and partially_received), #purchase-orders-table", "Working set only; exclude history."],
    ["2", "Open each PO and read related documents.", "/purchase-orders/{PO-YYYY-NNNNN}, #po-related with data-count, items related-grn-*, related-invoice-*", "A PO with goods receipts and no invoice is awaiting invoice."],
    ["3", "Check receipts: accepted quantities per line.", "/grns/{GRN-YYYY-NNNNN}, #grn-lines-table", "Accepted, not received, is the quantity that may be invoiced."],
    ["4", "When an invoice exists, run the match and route exceptions.", "/invoices/{INV}, #invoice-rematch", "Same rule catalogue as P1."],
    ["5", "Report the list to the buyer.", "Export or Orchestrator queue", "Include PO number, vendor, received date, open amount."],
  ] },
  { t: "figure", id: "06-purchase-order" },
  { t: "figure", id: "13-document-purchase-order" },
  { t: "figure", id: "08-goods-receipt" },

  { t: "h2", text: "2.6 Exceptions in the AS-IS process" },
  { t: "p", text: "Business exceptions are the defects the lab seeds into documents. Each is labelled in the data with the rule that should catch it, which is how extraction and exception handling are graded." },
  { t: "table", header: ["Seeded defect", "Where it appears", "Rule that catches it", "Expected human action"], widths: [2200, 2300, 1900, 2960], rows: [
    ["Price variance beyond tolerance", "Invoice line unit price", "PO-INV-PRICE (2 %)", "Reject or route to buyer for price approval."],
    ["Over-delivery / over-invoicing", "Invoice quantity above accepted receipts", "GRN-QTY, PO-QTY", "Hold; request credit note."],
    ["Duplicate invoice number", "Same vendor, same fiscal year", "DUP-INV", "Reject as duplicate."],
    ["Invoice with no PO", "PO reference blank or unknown", "INV-NO-PO", "Route to procurement to raise or link a PO."],
    ["Wrong tax rate", "VAT % on a line differs from the item tax code", "INV-TAX-RATE", "Reject; request corrected tax invoice."],
    ["Changed bank account", "IBAN on invoice differs from master", "BANK-CHANGE (critical)", "Stop. Verify with vendor by phone before any payment."],
    ["Expired tax certificate", "Vendor master", "TAX-CERT-EXP (warning)", "Approve but flag; request renewed certificate."],
    ["Currency mismatch", "Invoice currency differs from PO", "INV-CURRENCY", "Reject; request reissue."],
    ["Unit of measure mismatch", "Boxes invoiced, pieces ordered", "INV-UOM", "Hold; confirm conversion with buyer."],
    ["Off-by-one total", "Printed total does not tie to lines", "INV-TOTAL-TIE", "Reject; arithmetic error."],
    ["Vendor not in master", "Tax ID unknown", "INV-VENDOR-MASTER (critical)", "Route to vendor onboarding; never pay."],
  ] },
  { t: "p", text: "Application exceptions observed in the AS-IS process: a PDF not yet rendered (download answers 409 with Retry-After), an expired session (redirect to /login), a form that fails validation (the page re-renders with #validation-errors populated), and network timeouts. None of these are business decisions; they are retried or escalated to the run log." },

  { t: "pagebreak" },
  { t: "h1", text: "3. TO-BE process description" },
  { t: "h2", text: "3.1 Automation scope" },
  { t: "table", header: ["In scope", "Out of scope"], widths: [4680, 4680], rows: [
    ["Reading pending work from the lab (UI or API) and pushing it to an Orchestrator queue (dispatcher).", "Changing procurement policy, tolerances or the rule catalogue."],
    ["Downloading documents, extracting fields with Document Understanding, submitting extractions, reading match results by rule ID (performer).", "Paying invoices that carry a critical exception (BANK-CHANGE, DUP-INV, INV-VENDOR-MASTER); these are always human decisions."],
    ["Approving clean invoices and paying them; rejecting invoices with blocking errors; routing critical ones to a human queue.", "Editing shared-corpus master data."],
    ["Onboarding vendors from compliance documents; duplicate checks; setting status.", "Handling documents outside the seven kinds the lab generates."],
    ["Producing the awaiting-invoice report.", ""],
  ] },
  { t: "h2", text: "3.2 Dispatcher / performer design" },
  { t: "p", text: "All three processes use the UiPath dispatcher/performer pattern with the Robotic Enterprise Framework. The dispatcher reads a queue-shaped list from the lab and adds one Orchestrator queue item per work item. The performer takes items one at a time, processes them and sets the item outcome. Queue items carry the following specific content." },
  { t: "table", header: ["Process", "Queue", "Reference (unique)", "Specific content"], widths: [1900, 1900, 2200, 3360], rows: [
    ["Invoice processing", "AL_Invoices", "Internal number INV-YYYY-NNNNN", "documentId, downloadUrl, receivedDate, tenantId, attempt"],
    ["Vendor onboarding", "AL_VendorApplications", "Vendor code V-NNNNN", "vendorId, licenceDocumentId, taxCardDocumentId, bankLetterDocumentId"],
    ["Awaiting invoice", "AL_POsAwaitingInvoice", "PO number PO-YYYY-NNNNN", "purchaseOrderId, vendorCode, receivedDate, openAmount"],
  ] },
  { t: "h2", text: "3.3 TO-BE steps: performer for invoice processing" },
  { t: "numbered", items: [
    "Init: read assets (lab URL, credentials, queue name), open the browser or create the API session, verify /api/sandbox reports status ready.",
    "Get transaction item from AL_Invoices.",
    "Navigate to /invoices/{reference}; wait for #invoice-document[data-rendered=\"1\"]; download via #invoice-download (or GET /api/documents/{id}/file). Retry up to 3 times on 409.",
    "Run Document Understanding: digitize, classify as Tax Invoice, extract header and line fields with the taxonomy in Appendix C. Route to Validation Station when confidence is below 0.85 on any critical field (number, grand total, IBAN, PO number).",
    "Fill #extraction-form from the extracted fields; submit; wait for #validation-errors[data-count].",
    "Read every li[data-rule-id]. If data-blocking is 0: approve (#invoice-approve) and, if no warnings need review, pay (#invoice-pay). If a critical rule is present: leave the invoice, set the queue item to a business exception with the rule IDs in the reason. Otherwise reject or hold per section 3.4.",
    "Set transaction status and write extraction results to the run log.",
    "End: close applications; report processed, exceptions and failures.",
  ] },
  { t: "h2", text: "3.4 Business exception handling (rule ID to action)" },
  { t: "table", header: ["Severity", "Rule IDs", "Performer action", "Queue outcome"], widths: [1300, 3600, 2900, 1560], rows: [
    ["Critical", "BANK-CHANGE, DUP-INV, INV-VENDOR-MASTER, INV-VENDOR-BLOCKED, INV-PO-VENDOR, VEND-DUP-TAXID, VEND-IBAN-DUP", "Do not approve or pay. Leave status Exception. Add a comment with the rule IDs. Notify the human queue.", "Business exception"],
    ["Error", "PO-INV-PRICE, GRN-QTY, PO-QTY, INV-NO-PO, INV-TAX-RATE, INV-CURRENCY, INV-UOM, INV-TOTAL-TIE, INV-LINE-PO", "Reject the invoice (#invoice-reject) unless the exercise says to hold; record the rule IDs.", "Business exception"],
    ["Warning", "TAX-CERT-EXP, INV-DATE-FUTURE, VEND-TAX-CERT-EXP", "Approve; flag in the report. Do not pay TAX-CERT-EXP invoices in the API exercise until the instructor's flag is cleared.", "Successful with note"],
  ] },
  { t: "figure", id: "09-rule-catalogue" },
  { t: "h2", text: "3.5 Application exception handling" },
  { t: "table", header: ["Exception", "Detection", "Handling"], widths: [2600, 3000, 3760], rows: [
    ["Document not rendered", "#invoice-document[data-rendered=\"0\"] or HTTP 409 with Retry-After", "Wait the Retry-After seconds (default 5), retry 3 times, then requeue with a delay."],
    ["Session expired", "Redirect to /login", "Re-authenticate through Init; retry the transaction once."],
    ["Form validation failed (technical)", "#validation-errors contains TENANT-READ-ONLY or INV-STATE", "Not retryable: the record is read-only or in a closed state. Mark as business exception with the rule ID."],
    ["Selector not found", "Element timeout", "Take a screenshot, retry once after a page reload, then mark as application exception. Selectors are stable; a missing element usually means the wrong page."],
    ["API 5xx or timeout (flaky mode, P4)", "HTTP status", "Exponential backoff 2, 4, 8 seconds; at most 3 attempts; then application exception."],
  ] },
  { t: "h2", text: "3.6 Reporting" },
  { t: "bullets", items: [
    "Per run: items processed, business exceptions by rule ID, application exceptions, average handling time.",
    "Per student (P2): extraction accuracy per field against ground truth, defects caught versus seeded, false positives, time per document. Available at /api/me/score and on the instructor dashboard.",
    "Per document: the audit log records every read and write the bot performed, so a run can be reconstructed after the fact.",
  ] },

  { t: "pagebreak" },
  { t: "h1", text: "4. Platform roadmap: phases P2, P3 and P4" },
  { t: "p", text: "P0 (foundation) and P1 (full document cycle, seeded defects, three-way match) are implemented. The remaining phases are defined here with deliverables, the exercise each unlocks, and acceptance criteria that the smoke test and unit tests must cover before the phase is called done. P4 is new: it gathers the production and integration items that the design left open." },

  { t: "h2", text: "4.1 P2: Queues, REST API, grading, validation station, instructor dashboard" },
  { t: "h3", text: "Deliverables" },
  { t: "table", header: ["Area", "Deliverable", "Detail"], widths: [1900, 3200, 4260], rows: [
    ["Work queues", "Queue pages and API with Orchestrator-like semantics", "GET /api/work-items?queue=invoices-pending|vendor-applications|pos-awaiting-invoice returns items with reference, specificContent, priority, deferDate. POST /api/work-items/{id}/start|complete|fail with idempotency keys, so a re-run of the dispatcher never duplicates work."],
    ["REST API", "Full read/write coverage of the cycle", "Vendors, items, purchase orders, deliveries, goods receipts, invoices, payments: list, get, create, update. POST /api/extractions, POST /api/invoices/{id}/match, /approve, /reject, /pay, POST /api/grns from a delivery note, POST /api/rfqs/{id}/award. Cursor pagination, ETags, 409 for state conflicts."],
    ["Authentication", "Personal API tokens", "Students create bearer tokens on the sandbox page (hashed at rest, revocable). Cookies keep working for UI bots."],
    ["API documentation", "OpenAPI 3.1 + Swagger UI at /api/docs", "Generated from route schemas (zod), with examples using sandbox data. Postman collection export."],
    ["Extraction grading", "Field-level scoring against ground truth", "Normalised comparison per field type (numbers to 2 dp, dates ISO, identifiers stripped of spaces, strings case- and diacritic-insensitive; fuzzy threshold for descriptions). Score = weighted field accuracy; header fields weight 2, lines weight 1. Stored on extractions.score and fieldResults."],
    ["Defect grading", "Caught versus seeded", "For each document the seeded defect's ruleId is compared with the rule IDs in the student's match result: true positive, missed, false positive. Contributes to the exercise score."],
    ["Validation station", "Human-in-the-loop correction screen", "/invoices/{id}/validate shows the PDF beside the extracted fields, highlights fields below a confidence threshold submitted by the bot, lets the student correct and resubmit. Mirrors UiPath's Validation Station as a teaching screen."],
    ["Instructor dashboard", "Cohort view", "/instructor: students, sandbox status, documents processed, extraction score, defects caught, time per document, last activity; drill-down to a student's extraction history and audit log. Leaderboard toggle. Export CSV."],
    ["Webhooks", "Event delivery", "Student-registered webhook URLs for invoice.status_changed, document.rendered, sandbox.ready with HMAC signature."],
    ["Bulk data", "Queue ZIPs already exist", "Add JSON manifest inside each ZIP with documentId, internalNumber, filename, level."],
  ] },
  { t: "h3", text: "Exercise unlocked" },
  { t: "p", text: "Exercise 4: the same three processes through the REST API instead of the UI. Students compare runtime and failure rate between the UI and API variants and defend the choice in a short write-up." },
  { t: "h3", text: "Acceptance criteria" },
  { t: "bullets", items: [
    "A dispatcher can fill an Orchestrator queue from GET /api/work-items and a performer can complete every item with API calls only; re-running the dispatcher creates no duplicates.",
    "Every route is documented in Swagger UI and every example request in the documentation succeeds against a fresh sandbox.",
    "Grading a perfect extraction of a level-1 invoice scores 1.0; grading the smoke test's deliberately wrong extraction scores below 0.2; the defect grade reports the seeded rule ID as caught when the student's match lists it.",
    "The instructor dashboard lists every student tenant with correct counts within 5 seconds of a page load for a cohort of 30.",
    "Unit tests cover scoring normalisation; the browser smoke test covers token creation, an API-only invoice run, and the validation station round trip.",
  ] },

  { t: "h2", text: "4.2 P3: Arabic-first templates and degraded scans (levels 2 to 5)" },
  { t: "h3", text: "Deliverables" },
  { t: "table", header: ["Area", "Deliverable", "Detail"], widths: [1900, 3200, 4260], rows: [
    ["Arabic templates", "Arabic-first variants of every document kind", "Right-to-left layouts with English as the secondary script, Eastern Arabic numerals where a vendor would use them, Hijri dates alongside Gregorian on vendor documents. Per-vendor language preference (Arabic, English, bilingual) stored on the vendor and used by the generator."],
    ["Ground truth for Arabic", "Bilingual field values", "Ground truth stores both scripts and the numeral system used, so an extraction in either script grades correctly."],
    ["Degradation pipeline", "Levels 2 to 5 from the level-1 PDF", "Render to image, then apply: L2 clean 300 dpi scan (slight blur, JPEG); L3 200 dpi with skew up to 3 degrees, noise, uneven contrast; L4 phone photo with perspective, shadow gradient, colour cast; L5 stamps, handwriting overlays (amounts, signatures), staple marks, folds. Implemented with sharp and a small compositing library; deterministic per document and level."],
    ["Lazy rendering", "Levels on first download", "Level 1 stays eager. Levels 2 to 5 render on first request for ?level=N and are cached in the blob store. Bulk ZIPs accept a level parameter."],
    ["Bounding boxes", "Field positions in ground truth", "The renderer records each field's box (page, x, y, w, h) from the level-1 layout and transforms it through the degradation geometry, enabling position-aware grading and Validation Station highlights."],
    ["Difficulty ladder in exercises", "Per-exercise level", "Instructor sets the level per exercise; the queue API exposes it; the dashboard reports accuracy per level."],
  ] },
  { t: "h3", text: "Acceptance criteria" },
  { t: "bullets", items: [
    "An Arabic-first invoice renders with connected glyphs and correct bidi in Chromium and its ground truth grades a correct Arabic extraction at 1.0.",
    "Each degradation level is reproducible: the same document and level produce byte-identical images across runs.",
    "OCR accuracy on the lab's reference extractor decreases monotonically from L1 to L5 on a 50-document sample, confirming the ladder is real.",
    "A level-3 PDF is available within 10 seconds of first request and instantly thereafter; blob usage per sandbox stays below 400 MB with all levels rendered for the invoice queue.",
  ] },

  { t: "figure", id: "11-arabic-rtl" },

  { t: "h2", text: "4.3 P4: Production identity, deployment and integration" },
  { t: "h3", text: "Deliverables" },
  { t: "table", header: ["Area", "Deliverable", "Detail"], widths: [1900, 3200, 4260], rows: [
    ["Identity", "Production IdentityProvider", "One of: hosted IdP (WorkOS, Clerk or Auth0) with entitlements from the courses database; or LTI 1.3 tool launch from the LMS with Assignment and Grade Services for grade passback. Chosen when the courses platform is decided. The local provider stays for development only."],
    ["Entitlements", "JIT provisioning and lifecycle", "Enrollment active: sandbox provisions on first login. Expiry: sandbox archived after 30 days grace. Revoke: access dropped immediately, sandbox archived."],
    ["Hosting", "Vercel project", "automationlab.mohammedshaker.com; production Postgres (Neon or Vercel Postgres); S3-compatible blob store implementation; serverless Chromium package or an always-on render worker; cron draining the job queue; environment secrets."],
    ["Operations", "Observability", "Structured logs, error tracking, render queue depth and latency metrics, daily provisioning report to the instructor."],
    ["Teaching features", "Flaky mode", "Instructor toggle per cohort that injects latency (200 to 3000 ms) and intermittent 503 responses (configurable rate) into the API and selected pages, to teach retry logic and idempotency."],
    ["Grade export", "Gradebook integration", "Scores pushed to the LMS via AGS or exported as CSV compatible with the course platform."],
    ["Security", "Hardening", "Rate limits per token, audit retention policy, per-tenant storage quotas, dependency and container scanning, noindex verified in production."],
    ["Data", "Sandbox lifecycle", "Archive and purge policies for graduated cohorts; instructor bulk reset per cohort."],
  ] },
  { t: "h3", text: "Acceptance criteria" },
  { t: "bullets", items: [
    "A student who enrolls on the courses platform can open the lab with no additional signup and finds a ready sandbox within 5 minutes; a revoked student gets /no-access within 1 minute.",
    "Grades appear in the course gradebook within 5 minutes of an exercise being marked complete.",
    "A cohort of 30 students provisioning at once completes all renders within 30 minutes without any request timing out.",
    "Flaky mode on: a compliant performer with the retry policy of section 3.5 completes a 30-invoice queue; a performer without retries fails at the configured rate.",
    "The production site answers X-Robots-Tag noindex on every route and serves no document without a session.",
  ] },

  { t: "h2", text: "4.4 Dependencies and order" },
  { t: "table", header: ["Phase", "Depends on", "Blocks", "Decision needed"], widths: [1200, 2800, 2600, 2760], rows: [
    ["P2", "P1 (done)", "Exercise 4, grading in P3 and P4", "None. Can start now."],
    ["P3", "P2 grading (for per-level scoring), P1 templates", "Advanced exercises", "Reference OCR engine for the acceptance test (UiPath OCR or Tesseract)."],
    ["P4", "Courses platform choice; Vercel authorization; mohammedshaker.com repository or stylesheet access for optional re-branding", "Public launch", "Hosted IdP versus LTI 1.3; blob provider; render worker versus serverless Chromium."],
  ] },

  { t: "pagebreak" },
  { t: "h1", text: "5. Other requirements" },
  { t: "h2", text: "5.1 Security and data" },
  { t: "bullets", items: [
    "All data is fictitious. Every PDF is watermarked SPECIMEN - TRAINING ONLY in English and Arabic. Every response carries X-Robots-Tag noindex and robots.txt denies all crawlers, because plausible IBANs and tax IDs must never be indexable.",
    "Tenant isolation is enforced at the query layer: a student can read the shared corpus and their own sandbox, and write only to their sandbox.",
    "Sessions last 30 days by design so unattended bots do not fail mid-exercise; tokens (P2) are hashed at rest and revocable.",
  ] },
  { t: "h2", text: "5.2 Test data and replayability" },
  { t: "bullets", items: [
    "Every generator is deterministic from a seed. The shared corpus seed is a constant; a student's seed derives from their user id. Reset regenerates the identical starting set, including document numbers and seeded defects.",
    "Student-created records use separate number ranges (V-10001+, ITM-900001+, PO-YYYY-9NNNN, GRN-YYYY-9NNNN, PAY-YYYY-9NNNN) and never collide with generated data.",
    "The browser smoke test (scripts/e2e-smoke.mjs) is the acceptance test for the UI processes and must pass before a phase is released.",
  ] },
  { t: "figure", id: "10-sandbox" },
  { t: "h2", text: "5.3 Performance targets" },
  { t: "table", header: ["Metric", "Target"], widths: [4680, 4680], rows: [
    ["Page load, list of 25 rows", "Under 1 second at the 95th percentile"],
    ["Document download when rendered", "Under 500 ms to first byte"],
    ["Sandbox provisioning (rows)", "Under 30 seconds"],
    ["Sandbox rendering (about 300 level-1 PDFs)", "Under 4 minutes with one worker"],
    ["API throughput per tenant", "10 requests per second sustained without throttling"],
  ] },

  { t: "pagebreak" },
  { t: "h1", text: "Appendix A. Rule catalogue" },
  { t: "p", text: "Generated from the code at build time. Rule IDs are a public contract: none is ever renamed; retired rules are replaced by new IDs." },
  { t: "h3", text: "A.1 Invoice and three-way match" },
  { t: "table", header: ["Rule ID", "Severity", "Applies to", "Description"], widths: [1900, 1100, 1500, 4860], rows: ruleTable(["invoice", "invoice_line"]) },
  { t: "h3", text: "A.2 Goods receipt" },
  { t: "table", header: ["Rule ID", "Severity", "Applies to", "Description"], widths: [1900, 1100, 1500, 4860], rows: ruleTable(["grn", "grn_line"]) },
  { t: "h3", text: "A.3 Purchase order" },
  { t: "table", header: ["Rule ID", "Severity", "Applies to", "Description"], widths: [1900, 1100, 1500, 4860], rows: ruleTable(["purchase_order", "purchase_order_line"]) },
  { t: "h3", text: "A.4 Vendor and item master" },
  { t: "table", header: ["Rule ID", "Severity", "Applies to", "Description"], widths: [1900, 1100, 1500, 4860], rows: ruleTable(["vendor", "item"]) },

  { t: "h1", text: "Appendix B. Selector conventions" },
  { t: "table", header: ["Element", "id and data-testid", "Example"], widths: [2600, 3400, 3360], rows: [
    ["Navigation link", "nav-{route}", "nav-invoices"],
    ["Table / row / cell", "{entity}-table, {entity}-row-{code}, {entity}-cell-{code}-{field}", "invoices-row-INV-2026-05012"],
    ["Pager", "{entity}-pager with data-page, data-page-count, data-total; -prev, -next", "invoices-pager-next"],
    ["Filter", "{entity}-filter-{field}, {entity}-filter-submit", "invoices-filter-status"],
    ["Form field / submit", "{entity}-field-{field}, {entity}-submit", "extraction-field-line-1-unitPrice"],
    ["Status badge", "{entity}-status-{code} with data-status", "invoice-status-INV-2026-05012"],
    ["Document card / download", "{entity}-document with data-rendered; {entity}-download", "invoice-download"],
    ["Validation container", "#validation-errors with data-count, data-blocking; li[data-rule-id][data-severity]", "validation-error-PO-INV-PRICE"],
    ["Launchpad tile", "tile-{queue} with data-count", "tile-invoices-pending"],
    ["Related document", "related-{kind}-{code}", "related-grn-GRN-2026-05003"],
  ] },

  { t: "h1", text: "Appendix C. Document Understanding taxonomy (Tax Invoice)" },
  { t: "table", header: ["Field", "Type", "Ground truth key", "Notes"], widths: [2400, 1400, 2600, 2960], rows: [
    ["Invoice number", "Text", "number", "Vendor formats vary: INV-YYYY-NNNNN, YYYY/NNNNNN, TI-NNNNNNN, INVYYNNNNNN"],
    ["Invoice date / Due date", "Date", "invoiceDate, dueDate", "ISO in ground truth"],
    ["PO reference", "Text", "poNumber", "May be blank or unknown (INV-NO-PO)"],
    ["Vendor name / Tax ID", "Text / Number", "vendor.name, vendor.taxId", "15 digits"],
    ["IBAN / Bank", "Text", "vendor.iban, vendor.bankName", "Compare with master (BANK-CHANGE)"],
    ["Currency", "Text", "currency", "ISO 4217"],
    ["Subtotal / VAT / Total", "Number", "subtotal, taxTotal, grandTotal", "2 decimals"],
    ["Line items", "Table", "lines[n].itemCode, description, quantity, uom, unitPrice, taxRate, taxAmount, lineTotal", "taxRate in percent"],
  ] },

  { t: "h1", text: "Appendix D. Glossary" },
  { t: "table", header: ["Term", "Meaning"], widths: [2400, 6960], rows: [
    ["PDD", "Process Definition Document: the specification of a process to automate, as-is and to-be."],
    ["RFQ", "Request for quotation. The buyer asks vendors to bid."],
    ["PO", "Purchase order. The buyer's binding order to a chosen vendor."],
    ["Delivery note / GRN", "The vendor's shipping document and the warehouse's goods receipt note confirming what arrived."],
    ["Three-way match", "Purchase order versus goods receipt versus invoice on quantity and price within tolerance before payment."],
    ["Dispatcher / performer", "UiPath pattern: one bot fills a queue with work items, another processes them one at a time."],
    ["Validation Station", "UiPath's human-in-the-loop screen for correcting machine-extracted fields."],
    ["Ground truth", "The known-correct field values the lab stores for every document it generates."],
    ["Seeded defect", "A deliberate, labelled error injected into a document to test exception handling."],
    ["LTI 1.3 / AGS", "Standard for launching a tool from an LMS with student context; AGS writes grades back."],
  ] },

  { t: "h1", text: "Appendix E. Document control" },
  { t: "table", header: ["Version", "Date", "Author", "Change"], widths: [1200, 1600, 2600, 3960], rows: [
    ["1.0", DOC.date, DOC.author, "Initial PDD covering AS-IS, TO-BE and the P2, P3, P4 roadmap."],
  ] },
  { t: "table", header: ["Sign-off", "Name", "Role", "Date"], widths: [2200, 2600, 2600, 1960], rows: [
    ["Process owner", DOC.author, "Instructor", ""],
    ["Subject-matter expert", "", "Teaching assistant", ""],
  ] },
];

for (const b of B) if (b.t === "figure") figureNumbers.set(b.id, figureNumbers.size + 1);
/** Replaces {{fig:id}} cross-references with "Figure N". */
function T(text: string): string {
  return text.replace(/\{\{fig:([\w-]+)\}\}/g, (_, id: string) => {
    const n = figureNumbers.get(id);
    if (!n) throw new Error(`Cross-reference to unknown figure "${id}"`);
    return `Figure ${n}`;
  });
}
const FIGURE_LIST = [...figureNumbers.entries()].map(([id, n]) => ({ n, title: FIGURES.get(id)!.title, id }));

// ---------------------------------------------------------------------------
// Markdown emitter
// ---------------------------------------------------------------------------
function toMarkdown(): string {
  const out: string[] = [
    `# ${DOC.title} — ${DOC.subtitle}`, "",
    `**Version:** ${DOC.version} · **Date:** ${DOC.date} · **Author:** ${DOC.author} · **Status:** ${DOC.status}`, "",
    "> Generated by `pnpm pdd`. Edit `scripts/build-pdd.ts`, not this file. Word and PDF versions are written to `.data/`.",
    "> Screenshots come from `scripts/capture-pdd-figures.mjs`, captured against a running lab.", "",
    "**Figures**", "",
    ...FIGURE_LIST.map((f) => `${f.n}. ${f.title}`), "",
  ];
  const esc = (s: string) => T(s).replace(/\|/g, "\\|");
  for (const b of B) {
    switch (b.t) {
      case "h1": out.push(`## ${b.text}`, ""); break;
      case "h2": out.push(`### ${b.text}`, ""); break;
      case "h3": out.push(`#### ${b.text}`, ""); break;
      case "p": out.push(T(b.text), ""); break;
      case "note": out.push(`> ${T(b.text)}`, ""); break;
      case "bullets": out.push(...b.items.map((i) => `- ${T(i)}`), ""); break;
      case "numbered": out.push(...b.items.map((i, n) => `${n + 1}. ${T(i)}`), ""); break;
      case "table":
        out.push(`| ${b.header.map(esc).join(" | ")} |`, `| ${b.header.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.map(esc).join(" | ")} |`), "");
        break;
      case "figure": {
        const f = figureOf(b.id);
        out.push(`![Figure ${f.n}. ${f.title}](${f.file})`, "", `**Figure ${f.n}. ${f.title}**`, "", ...f.callouts.map((c) => `${c.n}. ${c.text}`), "");
        break;
      }
      case "pagebreak": break;
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// HTML emitter (for the PDF)
// ---------------------------------------------------------------------------
const escHtml = (s: string) => T(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function toHtml(): string {
  const body: string[] = [];
  const toc: { level: 1 | 2; text: string; id: string }[] = [];
  for (const b of B) {
    switch (b.t) {
      case "h1": { const id = slug(b.text); toc.push({ level: 1, text: b.text, id }); body.push(`<h1 id="${id}">${escHtml(b.text)}</h1>`); break; }
      case "h2": { const id = slug(b.text); toc.push({ level: 2, text: b.text, id }); body.push(`<h2 id="${id}">${escHtml(b.text)}</h2>`); break; }
      case "h3": body.push(`<h3>${escHtml(b.text)}</h3>`); break;
      case "p": body.push(`<p>${escHtml(b.text)}</p>`); break;
      case "note": body.push(`<p class="note">${escHtml(b.text)}</p>`); break;
      case "bullets": body.push(`<ul>${b.items.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ul>`); break;
      case "numbered": body.push(`<ol>${b.items.map((i) => `<li>${escHtml(i)}</li>`).join("")}</ol>`); break;
      case "table": {
        const total = (b.widths ?? b.header.map(() => 1)).reduce((a, x) => a + x, 0);
        const cols = (b.widths ?? b.header.map(() => 1)).map((w) => `<col style="width:${((100 * w) / total).toFixed(2)}%">`).join("");
        body.push(`<table><colgroup>${cols}</colgroup><thead><tr>${b.header.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
        break;
      }
      case "figure": {
        const f = figureOf(b.id);
        const b64 = readFileSync(f.file).toString("base64");
        body.push(
          `<figure><img src="data:image/png;base64,${b64}" alt="${escHtml(f.title)}"><figcaption><b>Figure ${f.n}. ${escHtml(f.title)}</b><ol class="callouts">${f.callouts.map((c) => `<li>${escHtml(c.text)}</li>`).join("")}</ol></figcaption></figure>`,
        );
        break;
      }
      case "pagebreak": body.push(`<div class="pb"></div>`); break;
    }
  }
  const tocHtml = `<nav class="toc"><h1>Contents</h1><ul>${toc.map((e) => `<li class="l${e.level}"><a href="#${e.id}">${escHtml(e.text)}</a></li>`).join("")}</ul></nav>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escHtml(`${DOC.title} — ${DOC.subtitle}`)}</title><style>
${fontFaceCss()}
@page { size: A4; }
* { box-sizing: border-box; }
body { font-family: "Noto Sans", Arial, sans-serif; font-size: 10pt; color: #1d2d3e; line-height: 1.45; margin: 0; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
.cover h1 { font-size: 34pt; color: #1d3557; margin: 0 0 4pt; }
.cover .sub { font-size: 20pt; color: #354a5f; border-bottom: 3px solid #1d3557; padding-bottom: 10pt; margin-bottom: 18pt; }
.cover .course { color: #556b82; font-size: 12pt; margin-bottom: 40pt; }
.cover dl { display: grid; grid-template-columns: 34mm 1fr; row-gap: 3pt; font-size: 11pt; }
.cover dt { color: #556b82; } .cover dd { margin: 0; font-weight: 600; }
.cover .warn { margin-top: 50pt; color: #7a0000; font-style: italic; font-size: 9pt; }
.pb { page-break-after: always; }
h1 { font-size: 16pt; color: #1d3557; margin: 18pt 0 8pt; page-break-after: avoid; }
h2 { font-size: 12.5pt; color: #1d3557; margin: 14pt 0 6pt; page-break-after: avoid; }
h3 { font-size: 11pt; color: #354a5f; margin: 10pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 7pt; text-align: justify; }
p.note { font-style: italic; margin-left: 10pt; }
ul, ol { margin: 0 0 8pt; padding-left: 18pt; } li { margin-bottom: 3pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 8.8pt; page-break-inside: auto; table-layout: fixed; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background: #1d3557; color: #fff; text-align: left; padding: 4pt 5pt; font-weight: 600; }
td { border: 1px solid #c9d2dc; padding: 3.5pt 5pt; vertical-align: top; word-wrap: break-word; }
tbody tr:nth-child(even) td { background: #f2f4f7; }
figure { margin: 8pt 0 12pt; page-break-inside: avoid; }
figure img { display: block; width: 100%; max-height: 168mm; object-fit: contain; object-position: left top; border: 1px solid #c9d2dc; }
figcaption { font-size: 8.5pt; color: #354a5f; margin-top: 4pt; }
figcaption b { color: #1d3557; }
ol.callouts { margin: 3pt 0 0; padding-left: 16pt; }
ol.callouts li { margin-bottom: 1.5pt; }
.figlist { font-size: 9.5pt; } .figlist ol { padding-left: 16pt; } .figlist li { margin-bottom: 2pt; }
.toc h1 { margin-top: 0; } .toc ul { list-style: none; padding: 0; } .toc li.l1 { font-weight: 600; margin-top: 6pt; } .toc li.l2 { margin-left: 14pt; font-size: 9.5pt; } .toc a { color: #1d2d3e; text-decoration: none; }
</style></head><body>
<div class="cover">
  <h1>${escHtml(DOC.title)}</h1>
  <div class="sub">${escHtml(DOC.subtitle)}</div>
  <div class="course">Document Understanding &amp; RPA course · practice sandbox</div>
  <dl><dt>Version</dt><dd>${DOC.version}</dd><dt>Date</dt><dd>${DOC.date}</dd><dt>Author</dt><dd>${escHtml(DOC.author)}</dd><dt>Status</dt><dd>${escHtml(DOC.status)}</dd><dt>Target application</dt><dd>https://automationlab.mohammedshaker.com</dd></dl>
  <div class="warn">All data in Automation Lab is fictitious. Documents are watermarked SPECIMEN - TRAINING ONLY.</div>
</div>
<div class="pb"></div>
${tocHtml}
<div class="figlist"><h2>Figures</h2><ol>${FIGURE_LIST.map((f) => `<li>${escHtml(f.title)}</li>`).join("")}</ol></div>
<div class="pb"></div>
${body.join("\n")}
</body></html>`;
}

// ---------------------------------------------------------------------------
// DOCX emitter
// ---------------------------------------------------------------------------
const FONT = "Calibri";
const NAVY = "1D3557";
const GREY = "F2F4F7";
const PAGE_W = 11906 - 2 * 1134; // A4 minus 2 cm margins = 9638 DXA

function run(text: string, opts: Partial<{ bold: boolean; size: number; color: string; italics: boolean }> = {}) {
  return new TextRun({ text: T(text), font: FONT, size: opts.size ?? 21, bold: opts.bold, color: opts.color, italics: opts.italics });
}

function table(header: string[], rows: string[][], widths?: number[]): Table {
  const n = header.length;
  let w = widths ?? Array.from({ length: n }, () => Math.floor(PAGE_W / n));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum !== PAGE_W) w = w.map((x) => Math.round((x * PAGE_W) / sum));
  const diff = PAGE_W - w.reduce((a, b) => a + b, 0);
  w[w.length - 1] += diff;
  const border = { style: BorderStyle.SINGLE, size: 4, color: "C9D2DC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text: string, i: number, head: boolean) =>
    new TableCell({
      width: { size: w[i], type: WidthType.DXA },
      borders,
      shading: head ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({ children: [run(text, { bold: head, size: head ? 19 : 18, color: head ? "FFFFFF" : undefined })], spacing: { after: 0 } })],
    });
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, ri) =>
        new TableRow({
          children: r.map((c, i) => {
            const tc = cell(c, i, false);
            if (ri % 2 === 1) (tc as unknown as { options: { shading?: unknown } }).options.shading = { type: ShadingType.CLEAR, fill: GREY, color: "auto" };
            return tc;
          }),
        }),
      ),
    ],
  });
}

function blocksToDocx(): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of B) {
    switch (b.t) {
      case "h1": out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(b.text, { size: 30, bold: true, color: NAVY })], spacing: { before: 360, after: 160 } })); break;
      case "h2": out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(b.text, { size: 25, bold: true, color: NAVY })], spacing: { before: 280, after: 120 } })); break;
      case "h3": out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(b.text, { size: 22, bold: true, color: "354A5F" })], spacing: { before: 200, after: 80 } })); break;
      case "p": out.push(new Paragraph({ children: [run(b.text)], spacing: { after: 140 }, alignment: AlignmentType.JUSTIFIED })); break;
      case "note": out.push(new Paragraph({ children: [run(b.text, { italics: true })], spacing: { after: 140 }, indent: { left: 400 } })); break;
      case "bullets": for (const i of b.items) out.push(new Paragraph({ children: [run(i)], numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 } })); break;
      case "numbered": for (const i of b.items) out.push(new Paragraph({ children: [run(i)], numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 } })); break;
      case "table": out.push(table(b.header, b.rows, b.widths), new Paragraph({ children: [], spacing: { after: 120 } })); break;
      case "figure": {
        const f = figureOf(b.id);
        // Content area is 9638 DXA wide (6.69 in = 642 px at 96 dpi); cap the height so a figure
        // plus its caption still fits on one page.
        const scale = Math.min(636 / f.width, 720 / f.height);
        out.push(
          new Paragraph({
            children: [new ImageRun({ type: "png", data: readFileSync(f.file), transformation: { width: Math.round(f.width * scale), height: Math.round(f.height * scale) } })],
            spacing: { before: 120, after: 60 },
          }),
          new Paragraph({ children: [run(`Figure ${f.n}. ${f.title}`, { bold: true, size: 17, color: NAVY })], spacing: { after: 60 }, keepNext: true }),
          ...f.callouts.map((c) => new Paragraph({ children: [run(`${c.n}. ${c.text}`, { size: 17 })], spacing: { after: 30 }, indent: { left: 200 } })),
          new Paragraph({ children: [], spacing: { after: 100 } }),
        );
        break;
      }
      case "pagebreak": out.push(new Paragraph({ children: [new PageBreak()] })); break;
    }
  }
  return out;
}

function cover(): Paragraph[] {
  return [
    new Paragraph({ children: [run("", { size: 20 })], spacing: { before: 2400 } }),
    new Paragraph({ children: [run(DOC.title, { size: 56, bold: true, color: NAVY })], spacing: { after: 120 } }),
    new Paragraph({ children: [run(DOC.subtitle, { size: 34, color: "354A5F" })], spacing: { after: 600 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 8 } } }),
    new Paragraph({ children: [run("Document Understanding & RPA course · practice sandbox", { size: 24, color: "556B82" })], spacing: { after: 1200 } }),
    ...[["Version", DOC.version], ["Date", DOC.date], ["Author", DOC.author], ["Status", DOC.status], ["Target application", "https://automationlab.mohammedshaker.com"]].map(
      ([k, v]) => new Paragraph({ children: [run(`${k}: `, { bold: true, size: 22 }), run(v, { size: 22 })], spacing: { after: 80 } }),
    ),
    new Paragraph({ children: [run("All data in Automation Lab is fictitious. Documents are watermarked SPECIMEN - TRAINING ONLY.", { italics: true, size: 18, color: "7A0000" })], spacing: { before: 1800 } }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run("Contents", { size: 30, bold: true, color: NAVY })], spacing: { after: 160 } }),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }) as unknown as Paragraph,
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run("Figures", { size: 30, bold: true, color: NAVY })], spacing: { after: 160 } }),
    ...FIGURE_LIST.map((f) => new Paragraph({ children: [run(`Figure ${f.n}. ${f.title}`, { size: 19 })], spacing: { after: 50 } })),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

async function main() {
  mkdirSync(".data", { recursive: true });
  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/pdd.md", toMarkdown());

  const doc = new Document({
    creator: DOC.author,
    title: `${DOC.title} — ${DOC.subtitle}`,
    description: "Process Definition Document for the Automation Lab procurement processes and platform roadmap.",
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 25, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, color: "354A5F", font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
        { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
      ],
    },
    features: { updateFields: true },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        headers: { default: new Header({ children: [new Paragraph({ children: [run(`${DOC.title} · ${DOC.subtitle} · v${DOC.version}`, { size: 16, color: "556B82" })], alignment: AlignmentType.RIGHT })] }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [run("SPECIMEN - TRAINING ONLY · fictitious data · page ", { size: 16, color: "7A0000" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "7A0000" })],
              }),
            ],
          }),
        },
        children: [...cover(), ...blocksToDocx()],
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(".data/Automation-Lab-PDD.docx", buf);

  const html = toHtml();
  writeFileSync(".data/Automation-Lab-PDD.html", html);
  const chrome = 'font-family: Arial, sans-serif; font-size: 7.5pt; color: #556b82; width: 100%; padding: 0 14mm;';
  const { pdf, pages } = await renderHtmlToPdf(html, {
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    headerTemplate: `<div style="${chrome} text-align: right;">${escHtml(`${DOC.title} · ${DOC.subtitle} · v${DOC.version}`)}</div>`,
    footerTemplate: `<div style="${chrome} text-align: center; color: #7a0000;">SPECIMEN - TRAINING ONLY · fictitious data · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });
  writeFileSync(".data/Automation-Lab-PDD.pdf", pdf);
  await closeRenderer();
  console.log(`Wrote docs/pdd.md, .data/Automation-Lab-PDD.docx (${buf.byteLength} bytes) and .data/Automation-Lab-PDD.pdf (${pages} pages, ${pdf.byteLength} bytes); ${rules.length} rules in the catalogue`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
