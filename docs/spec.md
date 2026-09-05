# Automation Lab — design spec

**Domain:** automationlab.mohammedshaker.com
**Hosting:** Vercel, same platform/design system as mohammedshaker.com
**Explicitly out of scope:** the share-know.com VPS. Nothing in this project touches it.

## Purpose
A practice sandbox for a document-understanding / RPA course. Students run the full
procurement cycle by hand, then automate it with UiPath — both UI automation and REST API.

It is two systems:
1. A **document factory** generating internally coherent PDFs (PO, delivery note, GRN,
   invoice, receipt, quote, vendor commercial licence).
2. A **target application** with nav, forms, validation and approval flow.

Because the factory generates the documents, it knows every correct field value.
**Ground truth is stored from day one** — enabling automatic grading of student
extraction accuracy, field-level scoring, and a leaderboard.

## Decisions locked
| Question | Decision |
|---|---|
| Hosting | Vercel (Dockerfile kept, so it can move to a VPS later) |
| Student isolation | Per-student sandbox + reset |
| Interaction | Both hands-on UI and bots via API |
| Languages | English + Arabic |
| Courses platform | Undecided — identity boundary built swappable |

## Identity & access
mohammedshaker.com owns identity; the lab is a relying party. No signup in the lab.

- Hosted IdP (WorkOS / Clerk / Auth0) as single source of truth.
- Rejected: shared cookie on `.mohammedshaker.com` — couples both apps to one auth
  library and breaks across a different apex domain.
- If the courses part becomes a real LMS (Moodle/Canvas/LearnDash), use **LTI 1.3**
  instead, for grade passback (AGS) into the course gradebook.

Entitlements:

    user
    product      "rpa-fundamentals-2026-q1"
    enrollment   user x product, status, starts_at, ends_at
    grant        product -> { lab_access, cohort, role }

**JIT provisioning:** on first login, if the user holds an active enrollment granting
lab access, their sandbox provisions itself (seed derived from user ID). Enrollment
expiry archives the sandbox after a grace period; revoke drops access immediately.

P0 builds an `IdentityProvider` interface — the app only consumes
`{ userId, email, roles, entitlements }`. Local credentials provider for dev.

## Data architecture
**Shared corpus** — generated once, read-only, same fictional company for everyone:
- 250 vendors, full profiles (commercial registration, tax card, bank letter, trade
  licence, contacts, categories, payment terms, currency, rating, blacklist flags)
- 1,200 catalogue items (UoM, price history, tax codes)
- 60 employees (requesters, buyers, approvers with limits, warehouse, AP clerks)
- 15 cost centres, 40 GL accounts, 8 delivery locations
- 3 years of historical transactions **as database rows only, no rendered PDFs** —
  present for lookup, matching and duplicate detection
- ~1,000 vendor document PDFs (250 x 4)

**Per-student** — generated from their own seed:
- ~250 active documents, rendered as PDFs

Rationale: a full document set per student x 30 students is tens of thousands of PDFs
to render and store. This split gives a large populated world at tractable cost.
Render L1/L2 eagerly; generate heavy L3-L5 scans on first download and cache.

## Document model

    tenant --+-- vendor -- vendor_document
             +-- item, cost_center, gl_account, buyer, approver
             +-- rfq -> quote (x3) -> award
                     -> purchase_order -> delivery_note -> grn
                                       -> invoice -> payment

    document_file  (blob ref, difficulty level, mime, pages)
    ground_truth   (document_id, field, correct_value, bbox)
    seeded_defect  (document_id, defect_type, severity)
    extraction     (student submission, scored against ground_truth)

## Coherence rules ("data not washed")
- Arithmetic: line total = qty x price - discount; subtotal = sum(lines);
  per-line tax from tax code; grand total ties
- Cross-document: invoice qty <= GRN qty <= PO qty; invoice price = PO price;
  dates ordered RFQ -> quote -> PO -> delivery -> invoice
- Field realism: IBAN mod-97 valid, tax IDs with valid checksums, invoice numbers
  unique per vendor per fiscal year, consistent currency and UoM

## Seeded defects (labelled, gradeable)
Price variance past tolerance; over-delivery; duplicate invoice number; invoice with no
PO; wrong tax rate; changed bank account (fraud); expired tax certificate; currency
mismatch; UoM mismatch (boxes vs pieces); off-by-one totals; vendor not in master.
Each recorded in ground truth so "did the student catch it?" is scoreable.

## Validation engine
Declarative rules students can read and later edit. Same engine on form save and API POST.

    { id: 'PO-INV-PRICE', severity: 'error',    tolerance: 0.02 }
    { id: 'GRN-QTY',      severity: 'error'    }
    { id: 'DUP-INV',      severity: 'critical' }
    { id: 'BANK-CHANGE',  severity: 'critical' }
    { id: 'TAX-CERT-EXP', severity: 'warning'  }

Errors render in a fixed container **with rule IDs**, so a bot branches on
`PO-INV-PRICE` rather than parsing prose.

## Hard UI constraints (design for UiPath)
A normal React app is hostile to UI automation. These are requirements, not preferences:
- Explicit stable `id` + `data-testid` on every interactive element; never rely on
  generated class names
- Real paginated `<table>` markup — no virtualisation, no infinite scroll
- Predictable URLs (`/invoices/INV-2026-00412`)
- No shadow DOM, no canvas grids, no CAPTCHA, long session timeouts
- `?classic=1` mode serving plain server-rendered HTML as an escape hatch

## Dispatcher / performer exercises
| # | Dispatcher scrapes | Performer does |
|---|---|---|
| 1 | Invoices -> Pending Extraction | Download PDF, extract, fill form, submit, handle validation errors |
| 2 | Vendor applications -> Pending | Download commercial licence, extract CR no./expiry/activities, create vendor, duplicate check |
| 3 | POs -> Awaiting Invoice | Match invoice to PO + GRN, 3-way match, route exceptions |
| 4 | Any of the above | Same flow via REST API, compare runtime and failure rate vs UI |

Everything replayable: reset transactional state, rerun, identical starting conditions.
Audit log shows what the bot touched.

## Difficulty ladder
L1 native text PDF -> L2 clean 300dpi scan -> L3 skewed/noisy 200dpi -> L4 phone photo
with perspective and shadow -> L5 stamps, handwriting, staple marks. Bilingual at every level.

## PDF engine
HTML/CSS templates -> headless Chromium -> PDF. **Not @react-pdf/renderer** — it lacks
Arabic contextual glyph shaping and bidi. Chromium gives correct Arabic/RTL for free and
lets letterheads be built in ordinary CSS. Rendering happens in a background job at
sandbox-seed time, so serverless cold starts are irrelevant.

## Downloads
`/api/documents/{id}/file`, predictable filenames
(`INV-2026-00412_ACME-TRADING.pdf`), `Content-Disposition: attachment` so UiPath's
download-and-wait works. Bulk ZIP per queue for offline extraction training.

## API
`GET /api/work-items` (Orchestrator queue semantics), `GET /api/documents/:id/file`,
`POST /api/extractions`, `POST /api/invoices/:id/validate`,
`POST /api/invoices/:id/approve`. Swagger UI at `/api/docs`, plus webhooks.
Optional "flaky mode" injecting latency and 503s for teaching retry logic.

## Stack
Next.js (App Router) + TypeScript + Tailwind/shadcn, Postgres + Drizzle, headless
Chromium for PDF, sharp for degradation, S3-compatible blob. Dockerfile for portability.

## Safety
Every generated document watermarked `SPECIMEN - TRAINING ONLY`. `noindex` + robots
deny — plausible fake IBANs and tax IDs must not be indexable.

## Phases
- **P0** auth boundary, tenants, selector-stable nav/tables, vendor+item master,
  shared corpus seeder, PO -> PDF, first rules, reset sandbox
- **P1** full cycle, all document types, 3-way match, seeded defects, ground truth, downloads
- **P2** queue views, REST API + Swagger, extraction grading, validation station, instructor dashboard
- **P3** Arabic templates + RTL, degradation L3-L5, handwriting and stamps

i18n structure and the Chromium renderer go in at P0 — those cannot be retrofitted.

## Open items
- mohammedshaker.com GitHub repo needed, to inherit the real design system
- Vercel connector not authorized in the design session — cannot create the project or deploy
- Courses platform undecided; identity boundary built swappable
