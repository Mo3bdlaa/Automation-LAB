# Automation Lab

Practice sandbox for the **Document Understanding & RPA** course. Students run a
procurement cycle at a fictional company by hand, then automate it with UiPath through
UI automation and a REST API. The lab generates its own procurement documents, so it
knows every correct field value and can grade extraction accuracy automatically.

- Design spec: [`docs/spec.md`](docs/spec.md)
- Handoff and decisions: [`docs/handoff.md`](docs/handoff.md)
- Selector convention for bots: [`docs/selectors.md`](docs/selectors.md)
- Identifier formats (IBAN, tax ID, CR number): [`docs/data-formats.md`](docs/data-formats.md)
- Process Definition Document (AS-IS, TO-BE, phase roadmap, 14 annotated screenshots): [`docs/pdd.md`](docs/pdd.md), Word and PDF versions via `pnpm pdd`

Everything in the lab is fictitious. Every PDF is watermarked `SPECIMEN — TRAINING ONLY`,
every response carries `X-Robots-Tag: noindex`, and `robots.txt` denies all crawlers.

## What P0, P1, P2 and P3 contain

| Area | Where |
|---|---|
| Next.js App Router + TypeScript + Tailwind, Dockerfile | `src/app`, `Dockerfile` |
| Postgres + Drizzle schema (tenants, vendors, items, employees, cost centres, GL accounts, POs, documents, ground truth, seeded defects, jobs, audit) | `src/db/schema.ts`, `drizzle/` |
| `IdentityProvider` interface + local credentials provider (roles: student, TA, instructor) | `src/lib/identity/` |
| Tenant scoping enforced at the query layer | `src/db/tenant.ts` (+ guard test `src/db/scoping.test.ts`) |
| Shared corpus seeder: 250 vendors, 1,200 items, 60 employees, 15 cost centres, 40 GL accounts, 8 delivery locations, 900 historical POs (rows only) | `src/lib/generator/`, `src/lib/corpus/persist.ts` |
| Per-student sandbox provisioning from a seed derived from the user id, plus reset | `src/lib/sandbox/lifecycle.ts` |
| Selector-stable UI: nav, paginated tables, vendor / item CRUD, PO create + approve | `src/app/*`, `src/components/ui.tsx` |
| PO PDF: HTML/CSS → headless Chromium in a background job, bilingual, watermarked | `src/lib/documents/` |
| Declarative validation rules with stable IDs, rendered in `#validation-errors` | `src/lib/validation/` |
| Background job queue (Postgres, SKIP LOCKED) with worker, cron route and in-process kick | `src/lib/jobs/` |
| i18n structure (EN/AR, RTL) | `src/i18n/` |
| `noindex` everywhere | `next.config.ts`, `vercel.json`, `public/robots.txt` |
| **P1** Full cycle generator: RFQ, quotes, delivery notes, GRNs, invoices, payments, receipts, vendor compliance documents; eleven labelled defect types | `src/lib/generator/cycle.ts`, `src/lib/generator/sandbox.ts` |
| **P1** Templates for every document kind, vendor-specific letterheads | `src/lib/documents/templates/` |
| **P1** Three-way match engine + GRN entry rules | `src/lib/validation/matching.ts` |
| **P1** Invoice extraction screen, approve / reject / pay; GRN posting; quote award | `src/app/invoices`, `src/app/deliveries`, `src/app/rfqs` |
| **P1** Bulk ZIP downloads per work queue, lazy render of vendor documents | `src/app/api/queues`, `src/app/api/documents` |
| **P1** Enterprise-ERP styling (shell bar, tiles, object pages) | `src/app/globals.css`, `src/components/ui.tsx` |
| **P2** Personal API tokens (SHA-256 at rest, revocable), bearer auth beside the session cookie | `src/lib/api/tokens.ts`, `src/app/api/tokens` |
| **P2** Full REST API over the whole cycle: vendors, items, POs, RFQs, deliveries, GRNs, invoices, extractions, payments, documents | `src/app/api/` |
| **P2** Work queues with Orchestrator semantics: claim with a lease, complete, fail with retry, defer | `src/lib/api/work-items.ts`, `src/app/api/work-items` |
| **P2** OpenAPI 3.1 document + Swagger UI, guarded by a test that route files and paths stay in step | `src/lib/api/openapi.ts`, `src/app/api/docs` |
| **P2** Extraction grading against ground truth: per-field normalisation, weighted score, line alignment | `src/lib/grading/` |
| **P2** Defect grading: seeded rule IDs versus the rule IDs the student's match reported | `src/lib/grading/score.ts` |
| **P2** Validation Station: PDF beside the fields, low-confidence highlighting, correct and resubmit | `src/app/invoices/[internalNumber]/validate/` |
| **P2** Instructor dashboard with cohort stats, drill-down and CSV export | `src/app/instructor/` |
| **P2** HMAC-signed webhooks delivered from the job queue | `src/lib/webhooks/`, `src/app/api/webhooks` |
| **P2** Domain services shared by the UI actions and the API, so both paths validate identically | `src/lib/services/` |
| **P3** Difficulty ladder: levels 1 to 5, from the native PDF to a photographed, stamped and annotated page | `src/lib/documents/levels.ts`, `degrade.ts`, `degrade-params.ts` |
| **P3** Degradation in Chromium: pdf.js rasterises the level-1 PDF, SVG filters and CSS transforms do the damage, the result is an image-only PDF | `src/lib/documents/degrade.ts` |
| **P3** Arabic-first documents: per-vendor script, RTL layouts, Eastern Arabic numerals, Hijri dates beside Gregorian | `src/lib/documents/templates/i18n.ts`, `vendor-documents.ts` |
| **P3** Bilingual ground truth: a name read in either script grades as correct | `groundTruth.alternates`, `src/lib/grading/normalise.ts` |
| **P3** Field bounding boxes captured from the print layout and carried through the degradation geometry | `documentFieldBoxes`, `src/lib/documents/renderer.ts` |
| **P3** Cohort difficulty setting, per-level scoring, per-level columns in the gradebook export | `src/lib/lab-settings.ts`, `src/app/instructor/` |
| **P3** OCR ladder acceptance test | `scripts/ocr-ladder.ts` |

## Running locally

Prerequisites: Node 22, pnpm, Postgres 16, a Chromium binary (Playwright's, or the system one).

```bash
pnpm install
cp .env.example .env            # adjust DATABASE_URL if needed
createdb automationlab           # or: psql -c "create database automationlab"
pnpm db:migrate                  # applies drizzle/ migrations
pnpm db:seed                     # shared corpus (idempotent; --force to regenerate)
pnpm dev                         # http://localhost:3000
```

Sign in with a development account from `config/local-users.json`:

| Email | Password | Role |
|---|---|---|
| `student@lab.local` | `student` | student, active enrollment |
| `student2@lab.local` | `student` | student, active enrollment |
| `expired@lab.local` | `expired` | student, expired enrollment (no access) |
| `ta@lab.local` | `ta` | TA |
| `instructor@lab.local` | `instructor` | instructor |

On first login a sandbox is created and provisioned in the background: 60 purchase
orders with their RFQs, quotes, delivery notes, goods receipts, invoices, payments and
receipts, about 250 PDFs. The dashboard shows progress and refreshes itself.

Jobs run in-process right after they are enqueued, so `pnpm dev` alone is enough. For a
dedicated worker (recommended when rendering many documents) run `pnpm worker` in a
second terminal and set `JOBS_KICK=0` for the web process.

`.github/workflows/ci.yml` runs typecheck, lint, tests, the migrations and the build on
every push and pull request.

Other scripts:

```bash
pnpm test          # vitest unit tests (generators, checksums, rules, grading, levels, scoping guard)
pnpm typecheck
pnpm lint
pnpm render:po     # renders a sample PO to .data/sample-po.pdf without a database
node scripts/e2e-smoke.mjs   # browser smoke test of the whole cycle against `pnpm dev`
pnpm serve:prod 3000         # assembles the standalone build and serves it (frees the port first)
pnpm api:smoke               # mints a token, then drives the whole REST API with bearer auth
pnpm ocr:ladder --docs=20     # OCR accuracy per difficulty level (needs `apt-get install tesseract-ocr`)
pnpm pdd:figures   # re-captures the annotated screenshots in docs/pdd-assets (needs `pnpm dev` running)
pnpm pdd           # regenerates docs/pdd.md, .data/Automation-Lab-PDD.docx and .pdf from scripts/build-pdd.ts
pnpm db:reset      # drops everything (dev only), then db:migrate + db:seed again
```

## How the pieces fit

**Tenancy.** One `shared` tenant holds the read-only corpus. Each student gets a
`student` tenant. `TenantDb` reads from `{own, shared}` and writes only to `own`; rows
from the shared tenant are visible but immutable through the app. Student-created
vendors are numbered from `V-10001`, items from `ITM-900001`, purchase orders as
`PO-YYYY-9xxxx`, so they never collide with generated data.

**Determinism.** All generation uses a seeded RNG (`src/lib/generator/rng.ts`). The shared
corpus seed is a constant; a student's seed is a hash of their user id. Reset wipes the
tenant's rows and blobs and regenerates the identical starting set.

**Documents.** Approving a draft PO creates a `documents` row, its `ground_truth` rows,
and a `render_document` job. The job renders the bilingual HTML template through
Chromium and stores the PDF in the blob store (`.data/blobs` locally). Download via
`GET /api/documents/{id}/file` with `Content-Disposition: attachment` and a predictable
filename (`PO-2026-05001_AL-FAISAL-TRADING-LLC.pdf`). A `409` with `Retry-After` means
the render is still queued.

**Invoices and the three-way match.** An invoice in `pending_extraction` shows only its PDF.
The student (or bot) enters the fields in the extraction form; the submission is stored
and the three-way match runs on the submitted values against the PO and posted GRNs.
Violations render in `#validation-errors` with rule IDs (`PO-INV-PRICE`, `GRN-QTY`,
`DUP-INV`, `BANK-CHANGE`, …). The invoice becomes `matched` or `exception`, then can be
approved, rejected, or paid. Seeded defects are recorded per document and visible to
instructors on the invoice page.

**Difficulty levels.** Every document exists at five levels. Level 1 is the PDF the
templates render: vector text, no OCR needed. Levels 2 to 5 are produced from it on first
request and cached: pdf.js rasterises the page inside the same Chromium the renderer uses,
SVG filters and CSS transforms apply the damage, and the pages are printed back into an
**image-only** PDF — so from level 2 up a bot has to OCR.

| Level | What it is | Resolution |
|---|---|---|
| 1 | Native PDF, selectable text | vector |
| 2 | Clean flatbed scan: faint blur, JPEG artefacts, a fraction of a degree of skew | 300 dpi |
| 3 | Office scan: up to 3° skew, sensor noise, uneven lighting | 200 dpi |
| 4 | Phone photo: perspective, shadow gradient, warm cast, soft focus | 150 dpi |
| 5 | A handled page: stamps, handwritten notes, staple marks, fold lines | 150 dpi |

The damage is seeded from `(document id, level)`, so a level is reproducible: the same
document always degrades to the same image. Request one with `?level=N` on a document
download, a queue ZIP, an invoice page or the validation station; the first request answers
`409` with `Retry-After` while the job runs. `pnpm ocr:ladder` measures what OCR actually
reads at each level.

**Arabic-first documents.** Each vendor prints in its own script (`documentLanguage`:
about half bilingual, a third Arabic-first, a fifth English). An Arabic-first document is
right-to-left with English as the secondary script, prints Eastern Arabic numerals for
about two in five of those vendors, and shows a Hijri date beside the ISO one — the ISO
date is always there, because a grader has to be able to read it. Ground truth records both
scripts of a name or description (`alternates`), so a bot that read the Arabic name scores
the same as one that read the English name. Anything Al-Nahda itself issues (RFQ, purchase
order, goods receipt) stays bilingual.

**Field positions.** The renderer measures every element the templates tag with
`data-gt-field` against the printed page and stores a normalised box per field. The
degradation pipeline carries those boxes through its own geometry, so a highlight lands in
the right place on a skewed scan. `GET /api/documents/{id}?level=N&boxes=1` returns them,
and the validation station draws them as a page map.

**Validation.** Rules are plain objects with an `id`, `severity`, `description`, optional
`params` and a `check`. The same engine runs on form save and API POST. Violations render
inside `#validation-errors`, one `<li>` per violation with `data-rule-id` and
`data-severity`. `GET /api/rules` and `/rules` list them.

**Identity.** `src/lib/identity/index.ts` is the only place a provider is chosen. The app
consumes `{ userId, email, roles, entitlements }` and nothing else. Adding WorkOS / Clerk
/ Auth0 or LTI 1.3 is a new module beside `local.ts` plus one `case`.

## REST API

The API covers the whole cycle, so exercise 4 (the same processes without the UI) needs no
screen scraping. Interactive documentation is at **`/api/docs`** (Swagger UI over the
OpenAPI 3.1 document at `/api/openapi`).

**Authentication.** Either the session cookie (UI bots log in through the form once and
reuse it) or a personal bearer token. Students mint tokens on `/sandbox`; the token is
shown once, stored as a SHA-256 hash, and revocable:

```bash
curl -H "Authorization: Bearer al_..." http://localhost:3000/api/me
```

**Conventions.** JSON in, JSON out. Lists take `?limit=&cursor=` and answer
`{ items, page: { limit, total, nextCursor } }`; the cursor is opaque, and a `null`
`nextCursor` means the end. Single resources carry a weak `ETag` and honour
`If-None-Match`. Errors answer `{ error, message, ... }` where `error` is a stable machine
code: `400 bad_request`, `401 unauthenticated`, `403 no_lab_access` / `no_sandbox` /
`read_only` (a shared-corpus row), `404 not_found`, `409 conflict` (paying a paid invoice, a PDF still
rendering — with `Retry-After`), and `422` carrying `violations` with the rule IDs when a
validation rule blocks the write.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + DB check |
| GET | `/api/me` | principal, entitlements, sandbox progress, running score |
| GET | `/api/sandbox` | sandbox status: poll until `status: "ready"` and `rendered === documents` |
| GET, POST | `/api/tokens`, DELETE `/api/tokens/{id}` | list, mint and revoke personal tokens |
| GET | `/api/queues` | the five queues with their descriptions and pending counts |
| GET | `/api/work-items?queue=` | dispatcher read: materialises the queue, then lists items |
| POST | `/api/work-items/claim` | performer claim: one item, leased, `FOR UPDATE SKIP LOCKED` |
| POST | `/api/work-items/{id}/complete`, `/fail` | close an item; `fail` can retry or abandon |
| GET, POST | `/api/vendors`, GET/PATCH `/api/vendors/{code}` | vendor master data |
| GET, POST | `/api/items`, GET/PATCH `/api/items/{code}` | item master data |
| GET, POST | `/api/purchase-orders`, POST `/{number}/approve` | create and approve POs |
| GET | `/api/rfqs`, `/api/rfqs/{number}`, POST `/{number}/award` | quotations and award → PO |
| GET | `/api/deliveries`, `/api/deliveries/{id}` | delivery notes |
| GET, POST | `/api/grns`, GET `/api/grns/{number}` | post a goods receipt against a delivery note |
| GET | `/api/invoices`, `/api/invoices/{internalNumber}` | AP inbox; a pending invoice hides its printed values |
| POST | `/api/extractions` | submit extracted fields; graded against ground truth |
| POST | `/api/invoices/{internalNumber}/match`, `/approve`, `/reject`, `/pay` | three-way match and the AP decisions |
| GET | `/api/payments`, `/api/payments/{number}` | payments and receipts |
| GET | `/api/documents/{id}?level=N&boxes=1` | metadata, which levels exist, and field positions |
| GET | `/api/documents/{id}/file?level=N` | the PDF at a difficulty level |
| GET | `/api/queues/{queue}/download?level=N` | ZIP of a queue's documents with a JSON manifest |
| GET, POST | `/api/webhooks`, DELETE `/api/webhooks/{id}` | HMAC-signed event delivery |
| GET | `/api/rules` | validation rules as JSON |
| POST | `/api/jobs/run` | process queued jobs (Vercel Cron; `Authorization: Bearer $CRON_SECRET`) |

**Queues.** `invoices-pending`, `pos-awaiting-invoice`, `vendor-applications`,
`deliveries-awaiting-grn`, `rfqs-open`. Items are keyed by `(tenant, queue, reference)`, so
re-running a dispatcher never duplicates work and an item a performer already completed
stays completed; an item whose source condition disappeared is abandoned with a reason.
`claim` takes a lease, so two performers on the same queue never take the same item.

**Grading.** `POST /api/extractions` stores the submission, compares every field with the
ground truth (`src/lib/grading/normalise.ts`: numbers to 2 dp, ISO dates, Arabic-Indic
digits folded to Western, identifiers stripped of separators, descriptions matched at a
0.9 similarity threshold), weights header fields 2 and line fields 1, and returns
`score`, `fieldResults` and the defect grade (`caught`, `missed`, `falsePositives`,
`recall`, `precision`). A bot may send a per-field `confidence` map; anything below 0.85
is highlighted on the Validation Station at `/invoices/{internalNumber}/validate` for a
human to correct and resubmit.

**Difficulty.** `GET /api/queues` and `GET /api/work-items` report the level the instructor
set for the cohort and hand out download URLs at that level; pass `?level=N` to override.
`POST /api/extractions` accepts the `level` the bot read, and scores are reported per level.

**Instructor view.** `/instructor` (staff only) lists the cohort with sandbox status,
documents processed, average score, defects caught and accuracy per difficulty level, and
sets the cohort's exercise level; `/instructor/export.csv` exports it with per-level columns.

## Deploying to Vercel

1. Create the Vercel project from this repository (framework: Next.js).
2. Provision Postgres (Neon / Vercel Postgres) and set `DATABASE_URL`.
3. Set `SESSION_SECRET`, `CRON_SECRET`, `APP_ORIGIN=https://automationlab.mohammedshaker.com`.
4. Run `pnpm db:migrate && pnpm db:seed` once against the production database.
5. Chromium: install `@sparticuz/chromium` (`pnpm add @sparticuz/chromium`) so the render
   job can run inside the function; the renderer picks it up automatically. Alternatively
   run `pnpm worker` on any always-on host pointed at the same database and blob store,
   and set `JOBS_KICK=0` on Vercel.
6. Blob store: `BLOB_STORE=local` only works on a persistent disk. Add an S3-compatible
   implementation of `BlobStore` (`src/lib/blob/index.ts`) before rendering in production.
7. `vercel.json` schedules `/api/jobs/run` every five minutes to drain the queue.
8. Point `automationlab.mohammedshaker.com` at the project.

Identity remains the local provider until the courses platform is decided
(`docs/handoff.md`, section 5). Do not expose the local provider publicly: it refuses to
start with `NODE_ENV=production` unless `ALLOW_LOCAL_IDENTITY_IN_PROD=1`.

## Docker

```bash
docker build -t automation-lab .
docker run -p 3000:3000 -e DATABASE_URL=... -e SESSION_SECRET=... automation-lab
```

The image bundles Chromium and Noto fonts, so rendering works out of the box.
