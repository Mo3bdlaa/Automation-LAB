# Automation Lab

Practice sandbox for the **Document Understanding & RPA** course. Students run a
procurement cycle at a fictional company by hand, then automate it with UiPath through
UI automation and a REST API. The lab generates its own procurement documents, so it
knows every correct field value and can grade extraction accuracy automatically.

- Design spec: [`docs/spec.md`](docs/spec.md)
- Handoff and decisions: [`docs/handoff.md`](docs/handoff.md)
- Selector convention for bots: [`docs/selectors.md`](docs/selectors.md)
- Identifier formats (IBAN, tax ID, CR number): [`docs/data-formats.md`](docs/data-formats.md)
- Process Definition Document (AS-IS, TO-BE, P2/P3/P4 roadmap, 14 annotated screenshots): [`docs/pdd.md`](docs/pdd.md), Word and PDF versions via `pnpm pdd`

Everything in the lab is fictitious. Every PDF is watermarked `SPECIMEN — TRAINING ONLY`,
every response carries `X-Robots-Tag: noindex`, and `robots.txt` denies all crawlers.

## What P0 and P1 contain

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

Other scripts:

```bash
pnpm test          # vitest unit tests (generators, checksums, rules, session, scoping guard)
pnpm typecheck
pnpm lint
pnpm render:po     # renders a sample PO to .data/sample-po.pdf without a database
node scripts/e2e-smoke.mjs   # browser smoke test of the whole cycle against `pnpm dev`
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

**Validation.** Rules are plain objects with an `id`, `severity`, `description`, optional
`params` and a `check`. The same engine runs on form save and API POST. Violations render
inside `#validation-errors`, one `<li>` per violation with `data-rule-id` and
`data-severity`. `GET /api/rules` and `/rules` list them.

**Identity.** `src/lib/identity/index.ts` is the only place a provider is chosen. The app
consumes `{ userId, email, roles, entitlements }` and nothing else. Adding WorkOS / Clerk
/ Auth0 or LTI 1.3 is a new module beside `local.ts` plus one `case`.

## API (P0 subset)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + DB check |
| GET | `/api/sandbox` | sandbox status for bots: poll until `status: "ready"` and `rendered === documents` |
| GET | `/api/documents/{id}/file?level=1` | download a rendered document (vendor compliance documents render on first download) |
| GET | `/api/queues/{queue}/download` | ZIP of a work queue: `invoices-pending`, `pos-awaiting-invoice`, `vendor-applications`, `kind:<document kind>` |
| GET | `/api/rules` | validation rules as JSON |
| POST | `/api/jobs/run` | process queued jobs (Vercel Cron; `Authorization: Bearer $CRON_SECRET`) |

Authentication for the API is the same session cookie as the UI. Bots log in through the
form once and reuse the cookie (30-day lifetime).

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
