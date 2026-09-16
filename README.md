# Automation Lab

Practice sandbox and public automation challenge for the **Document Understanding & RPA**
course. Participants run a procurement cycle at a fictional company by hand, then automate
it with UiPath through UI automation and a REST API. The lab generates its own procurement
documents, so it knows every correct field value and can grade a run automatically — which
is what turns the sandbox into a scored, verifiable challenge.

- Design spec: [`docs/spec.md`](docs/spec.md)
- Handoff and decisions: [`docs/handoff.md`](docs/handoff.md)
- Deploying it: [`docs/deploy.md`](docs/deploy.md)
- Selector convention for bots: [`docs/selectors.md`](docs/selectors.md)
- Identifier formats (IBAN, tax ID, CR number): [`docs/data-formats.md`](docs/data-formats.md)
- Process Definition Document (AS-IS, TO-BE, phase roadmap, 14 annotated screenshots): [`docs/pdd.md`](docs/pdd.md), Word and PDF versions via `pnpm pdd`
- Per-scenario PDD and SDD template: generated live at `/challenges/{slug}/pdd.pdf` and `/challenges/{slug}/sdd.docx`

Everything in the lab is fictitious. Every PDF is watermarked `SPECIMEN — TRAINING ONLY`,
every response carries `X-Robots-Tag: noindex`, and `robots.txt` denies all crawlers.

## What P0 to P5 contain

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
| **P5** Public accounts: self-service sign-up, scrypt password hashing, display name / alias / location, profile editing | `src/lib/identity/accounts.ts`, `src/app/register`, `src/app/account` |
| **P5** Scenario catalogue: four scenarios with steps, rules in scope, par times and judging weights | `src/lib/challenge/scenarios.ts` |
| **P5** Scored runs: start, track, close or abandon; one open run per participant | `src/lib/challenge/runs.ts`, `src/app/api/challenge/runs` |
| **P5** Five-parameter scoring (accuracy, decisions, exceptions, coverage, time) per scenario | `src/lib/challenge/score.ts` |
| **P5** Anti-oracle: a scored run returns the business result but never the grade until it is closed | `inScoredRun`, `src/lib/services/` |
| **P5** Result dashboard, opt-in leaderboard per scenario and channel (UI vs API) | `src/app/runs/[id]`, `src/app/leaderboard` |
| **P5** Certificates with a public verification page and a PDF download | `src/lib/challenge/certificate.ts`, `src/app/verify/[code]` |
| **P5** Guided walkthrough panel that bots can ignore, and a public landing page with scenario cards | `src/app/challenges/[slug]/walkthrough.tsx`, `src/app/landing.tsx` |
| **P5** Per-scenario PDD (generated from the scenario the grader uses) and an SDD skeleton | `src/lib/challenge/documents.ts` |
| **P5** Scenario-sized sandboxes with guaranteed queue depths, and a self-service reset | `src/lib/generator/sandbox.ts`, `src/app/api/sandbox/reset` |

## Running locally

Prerequisites: Node 22, pnpm, Postgres 16, a Chromium binary (Playwright's, or the system one).

```bash
pnpm install
cp .env.example .env            # adjust DATABASE_URL if needed
createdb automationlab           # or: psql -c "create database automationlab"
pnpm db:migrate                  # applies drizzle/ migrations
pnpm db:seed --levels            # master set + every difficulty level (idempotent)
pnpm dev                         # http://localhost:3000
```

Anyone can create an account at `/register` (email, password, display name, an alias for the
leaderboard and a location). In development the fixture accounts from
`config/local-users.json` work alongside self-service sign-up:

| Email | Password | Role |
|---|---|---|
| `student@lab.local` | `student` | student, active enrollment |
| `student2@lab.local` | `student` | student, active enrollment |
| `expired@lab.local` | `expired` | student, expired enrollment (no access) |
| `ta@lab.local` | `ta` | TA |
| `instructor@lab.local` | `instructor` | instructor |

On first login a sandbox is created and provisioned in the background: 60 purchase
orders with their RFQs, quotes, delivery notes, goods receipts, invoices, payments and
receipts, plus twelve pending vendor applications, about 250 PDFs. The dashboard shows
progress and refreshes itself. `SANDBOX_ACTIVE_POS` sizes the cycle down for a public event
where hundreds of sandboxes are provisioned at once.

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
pnpm challenge:smoke         # signs up, opens a scored run, works it over the API, checks score, certificate and board
pnpm bot:smoke               # a robot credential signs in and lands in its owner's sandbox
pnpm scorer:proof            # plays every scenario perfectly and asserts each one scores 100
pnpm blob:check              # writes, reads, compares and deletes one object in the configured store
pnpm db:seed --force --levels  # regenerate the document set (bumps the build number)
pnpm ocr:ladder --docs=20     # OCR accuracy per difficulty level (needs tesseract-ocr and tesseract-ocr-ara)
pnpm pdd:figures   # re-captures the annotated screenshots in docs/pdd-assets (needs `pnpm dev` running)
pnpm pdd           # regenerates docs/pdd.md, .data/Automation-Lab-PDD.docx and .pdf from scripts/build-pdd.ts
pnpm db:reset      # drops everything (dev only), then db:migrate + db:seed again
```

## The challenge

The lab doubles as a public, scored challenge. A participant signs up, picks a scenario,
opens a **scored run**, works the queue — by hand or with a bot — and closes it. Closing
returns a score out of 100, a breakdown, and a list of what went wrong. At or above the
pass mark the run earns a certificate with a code anyone can verify.

| Scenario | Queue | Items | Par | Reading PDFs |
|---|---|---|---|---|
| `invoice-processing` — Accounts payable | `invoices-pending` | 12 | 90s/item | required |
| `vendor-onboarding` — Supplier onboarding | `vendor-applications` | 10 | 120s/item | required |
| `goods-receipt` — Warehouse | `deliveries-awaiting-grn` | 8 | 60s/item | no |
| `sourcing-award` — Sourcing | `rfqs-open` | 6 | 75s/item | no |

Slugs, weights and pass marks are a public contract like rule IDs: a published leaderboard
entry and a certificate both refer to a scenario version, so changing what a slug means
invalidates them. Bump `version` instead.

**Five judging parameters.** Accuracy (are the values right), decisions (approve, reject,
pay, hold, refuse), exceptions (the deliberate problems: caught, missed, invented — scored
as an F1), coverage (how much of the queue), and time (against par). Weights differ per
scenario: 40/20/25/10/5 where documents must be read, 45/25/10/15/5 where they need not be.

**No oracle while the run is open.** During a scored run the application returns the
business result — the invoice matched, the receipt posted — but never the grade. Only the
first submission for a document counts. The score, the breakdown and the misses all arrive
at close. A participant may hold only one open run at a time.

**The channel is recorded, not declared.** Every audited action carries whether it came
through the screens or through a bearer token, so a run is placed on the UI or the API
leaderboard by what actually happened rather than by what the participant claimed.

**Opt-in leaderboard.** Nothing is published until the owner publishes it, and unpublishing
removes it again. The board shows the alias and location from the profile, never the email.
Only a participant's best run per scenario appears.

**Certificates.** A passing scored run issues a code (idempotent — re-closing does not mint
a second one) in an alphabet without look-alike characters. `/verify/{code}` is public and
unauthenticated, shows the name, the scenario and the score, and serves the certificate as
a PDF. An invented code answers 404.

**Documents.** Each scenario generates its own PDD at `/challenges/{slug}/pdd.pdf` from the
same scenario definition the grader uses, so the document cannot describe a process the
grader does not measure. `/challenges/{slug}/sdd.docx` is a solution design skeleton with
the facts filled in and the thinking left blank — designing the solution is the exercise.

**The walkthrough** on a scenario page is a side panel of steps with the endpoints and
selectors for each. It never overlays the page and never intercepts pointer events, so a
bot driving the screens is unaffected whether it is open or closed.

## How the pieces fit

**Tenancy, and why nothing is copied.** One `shared` tenant holds the whole master set:
the corpus *and* the transaction set everyone works on — orders, deliveries, invoices,
supplier applications, their documents and ground truth. Each participant gets a `student`
tenant holding only what they changed and what they created.

A participant is never given a copy. They read the master rows directly, and a change to
one is stored in `entity_overlays` as a patch merged back on read for them alone. Ids
never move, so the lines, documents and ground truth hanging off a row keep resolving with
nothing else to migrate. `TenantDb` (`src/db/tenant.ts`) resolves reads through a CTE that
shadows the table name, so a `WHERE "invoices"."status" = …` written by the query builder
filters on the *merged* value and the overlay stays invisible above that layer.

This is why signing up is instant and a thousand participants cost one rendered corpus.
Participant-created vendors are numbered from `V-10001`, items from `ITM-900001`, purchase
orders as `PO-YYYY-9xxxx`, so they never collide with the master set.

**Document sets are versioned.** The shared tenant carries a build number, bumped whenever
the transaction set is regenerated. Every run records the build it was worked against, the
leaderboard shows one build at a time, and the certificate prints it. So the documents can
be swapped between events: the board starts clean and certificates already issued keep
verifying, now naming what they were earned on.

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
`409` with `Retry-After` while the job runs.

Which OCR or extraction engine to point at these documents is the student's decision, and
part of the exercise. `pnpm ocr:ladder` is the lab's own check that the ladder is real: it
renders every level, reads it back with Tesseract and reports the share of ground-truth
values the OCR output contains, split by what the vendor printed. It asserts that no level
reads better than the one before it, paired per document and measured against the sampling
error rather than a fixed margin.

One result is worth knowing before you set an exercise: with Tesseract, the cost is the
**numeral system, not the script**. Across all 105 Arabic-first invoices at level 1, those
printed with Western digits score 91.4 % — as well as an English document — and those
printed with Eastern Arabic-Indic digits (٠١٢) score 27.2 %, falling to 2.9 % on the numeric
fields. That is roughly one document in eight, and it is a difficulty a student can solve by
changing engine or preprocessing, which is the judgement the exercise is meant to teach.

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
consumes `{ userId, email, roles, entitlements }` and nothing else. `accounts` is the public
provider: email and password, hashed with scrypt (`scrypt$N$r$p$salt$hash`, compared in
constant time), sign-up at `/register`, profile at `/account`. `local` reads the fixture
file and is development-only; in development it runs *alongside* `accounts`, so the fixture
logins and self-service sign-up both work without switching. `IDENTITY_PROVIDER` overrides
the choice. Adding WorkOS / Clerk / Auth0 or LTI 1.3 is a new module beside `local.ts` plus
one `case`.

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

**Rate limits.** Aimed at abuse, not at usage: the lab exists to be hammered by
robots. An authenticated participant gets **600 requests a minute**, counted per account
so a classroom behind one NAT does not throttle itself — a performer working a
twelve-invoice queue uses well under a fifth of that, while a loop with no delay in it is
stopped. Anonymous traffic gets 120 a minute per address, certificate checks 60 per ten
minutes, and the tight ones are the credential paths: 10 sign-in attempts per 15 minutes
and 5 sign-ups an hour, per address. Every response carries `X-RateLimit-Limit` and
`X-RateLimit-Remaining`; a `429` carries `Retry-After` in seconds and
`{ error: "rate_limited", retryAfter }`. Policies live in `src/lib/api/rate-limit.ts`.

**Conventions.** JSON in, JSON out. Lists take `?limit=&cursor=` and answer
`{ items, page: { limit, total, nextCursor } }`; the cursor is opaque, and a `null`
`nextCursor` means the end. Single resources carry a weak `ETag` and honour
`If-None-Match`. Errors answer `{ error, message, ... }` where `error` is a stable machine
code: `400 bad_request`, `401 unauthenticated`, `403 no_lab_access` / `no_sandbox` /
`read_only` (a master-set row nobody may change, such as a document or its ground truth),
`404 not_found`, `409 conflict` (paying a paid invoice, a PDF still rendering — with
`Retry-After`), `422` carrying `violations` with the rule IDs when a validation rule blocks
the write, and `429 rate_limited` with `Retry-After`.

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
| GET | `/api/scenarios` | the challenge catalogue: slugs, queues, sizes, weights, pass marks |
| GET, POST | `/api/challenge/runs` | your runs; open one (`{ scenario, mode, level? }`), `409` while one is open |
| GET, PATCH | `/api/challenge/runs/{id}` | poll a run; `{ publish }` opts it on or off the board |
| POST | `/api/challenge/runs/{id}/close` | close the run and receive the score, breakdown and certificate |
| POST | `/api/challenge/runs/{id}/abandon` | drop a run without a score |
| GET | `/api/leaderboard?scenario=&channel=` | public board, published runs only |
| POST | `/api/vendors/{code}/approve`, `/reject` | decide a pending vendor application |
| POST | `/api/deliveries/{id}/refuse` | refuse a delivery (over-delivery beyond tolerance) |
| POST | `/api/sandbox/reset` | wipe and regenerate your sandbox |
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

**Runs over the API.** A bot opens a run with `POST /api/challenge/runs`, which returns the
target references it will be judged on, works only those, then closes it. `GET` on the run
reports `status`, `processedCount` and elapsed time while it is open — enough for a
performer to know it is being scored, and nothing about how well.

**Instructor view.** `/instructor` (staff only) lists the cohort with sandbox status,
documents processed, average score, defects caught and accuracy per difficulty level, and
sets the cohort's exercise level; `/instructor/export.csv` exports it with per-level columns.

## Deploying

Full instructions, with the things that will bite: **[`docs/deploy.md`](docs/deploy.md)**.

The shape of it: **Vercel** for the app, **Neon** for Postgres, **Cloudflare R2** for the
documents, and you build the document set on your own machine and never on the server.

That last part is what makes it cheap. The transaction set is shared and fixed until you
change it, so generating it, rendering the PDFs and producing difficulty levels 2 to 5 all
happen once, locally, via `pnpm db:seed --levels`. The deployed app only reads the result —
no Chromium, no render queue, no background worker in production. The one thing that cannot
be pre-rendered is a document a participant creates (a goods receipt, or a purchase order
they awarded); in production those are not printed, which is what `PARTICIPANT_DOCUMENT_PDFS`
controls. The records exist and every endpoint works; only the printed copy is absent. R2 rather than S3
because this site's job is handing people PDFs and R2 charges nothing for egress.

Two guards exist to make a misconfiguration fail loudly rather than quietly: the local
fixture identity provider refuses to start under `NODE_ENV=production`, and so does
`BLOB_STORE=local`, because a serverless function's disk does not survive the request and
would serve 404s from a different instance. Do not set the escape hatches.

Run `pnpm blob:check` before the seed — it proves the bucket takes writes in two seconds
rather than after twenty minutes of rendering — and `pnpm challenge:smoke` against the
deployed URL afterwards, which signs up, runs a scored challenge end to end and verifies
the certificate.

## Docker

```bash
docker build -t automation-lab .
docker run -p 3000:3000 -e DATABASE_URL=... -e SESSION_SECRET=... automation-lab
```

The image bundles Chromium and Noto fonts, so rendering works out of the box.
