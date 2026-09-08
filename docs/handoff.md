# Automation Lab — handoff

**Date:** 2026-09-07
**Status:** P0, P1, P2 and P3 implemented in this repository. P4 is specified in `docs/pdd.md` section 4.
**Owner:** Mohammed Shaker
**Companion documents:** `docs/spec.md` — the full design spec. Read it second. `docs/pdd.md` — the Process Definition Document: AS-IS and TO-BE processes students automate, annotated screenshots of every screen and document, and the P2/P3/P4 roadmap with acceptance criteria.

---

## 1. What this is, in one paragraph

Mohammed teaches a course on document understanding and RPA. Automation Lab is the practice
sandbox his students work in. It generates realistic procurement documents as PDFs
(purchase orders, delivery notes, goods receipts, invoices, receipts, quotes, vendor
commercial licences), and presents a web application where students run the full
procurement cycle — first by hand, then automated with UiPath through both UI automation
and a REST API. Because the system generates the documents itself, it knows every correct
field value, so it can grade a student's extraction accuracy automatically.

---

## 2. Verified environment facts

These were checked directly, not assumed. They matter because two different domains and
two different hosting platforms are in play and it is easy to conflate them.

| Thing | Reality |
|---|---|
| `mohammedshaker.com` | Next.js on **Vercel**. EN/AR portfolio site. Source not on the VPS. |
| `automationlab.mohammedshaker.com` | Target hostname. (The check that found no DNS record was run against the earlier `rpalab` name; re-verify before claiming.) |
| `share-know.com`, `beta.share-know.com` | WordPress containers on the VPS, behind Coolify/Traefik. Live production traffic. |
| `demo.share-know.com` | Resolves via a Cloudflare wildcard but nothing is routed to it. Not used by this project. |
| VPS capacity | 3 cores, 7.8 GB RAM (~2 GB used), 26 GB disk free. |

**Automation Lab does not run on that VPS.** It runs on Vercel. See section 4.

---

## 3. Current state

This repository holds P0 to P3: the foundation, the full document cycle, the REST API with
grading and the Validation Station, and the difficulty ladder with Arabic-first documents.
See `README.md` for what is implemented and how to run it. Not yet done: P4 (production
identity, Vercel project, DNS record, production database, S3-compatible blob store, rate
limits, flaky mode, gradebook integration) and the course material itself — the exercise
briefs, starter UiPath projects and the marking scheme that turns a score into a grade.

---

## 4. Decisions already made — and why

Anyone picking this up should treat these as settled. They were each reasoned through;
the rationale is recorded here because it is not recoverable from the code alone.

**Hosted on Vercel, not the VPS.**
The VPS serves live share-know.com traffic on 3 cores behind a shared Traefik proxy.
Thirty students pointing retry-happy UiPath bots at a co-hosted app turns a student's
runaway loop into a production outage. Vercel also matches mohammedshaker.com's platform
and design system, and shares an apex domain with it, which simplifies SSO. A Dockerfile
is kept in the repo so the app *can* move to a VPS later, but that is a fallback, not a plan.

**PDF generation is HTML/CSS → headless Chromium. Not `@react-pdf/renderer`.**
This was reversed mid-design. `@react-pdf/renderer` lacks Arabic contextual glyph shaping
and bidi, so Arabic renders as disconnected, backwards letters. Since the lab must produce
bilingual documents, the browser text engine is required. The usual objection — Chromium is
heavy on serverless — does not apply, because documents are rendered **once in a background
job at sandbox-seed time** and served as static files thereafter. Cold starts never touch a
user request.

**Master data is shared; only the active working set is per-student.**
A full document set per student, times thirty students, is tens of thousands of PDFs to
render and store. Instead: one shared read-only corpus (250 vendors, 1,200 catalogue items,
60 employees, three years of historical transactions **as database rows with no rendered
PDFs**), plus roughly 250 rendered PDFs per student generated from their own seed. Everyone
works at the same fictional company, which is a feature for a classroom — comparable grading.

**The UI has hard automation constraints.**
Stable `id` and `data-testid` on every interactive element, real paginated `<table>` markup,
no virtualisation or infinite scroll, predictable URLs, no shadow DOM, no CAPTCHA, long
session timeouts. These are requirements, not preferences. A conventional React app is
hostile to UiPath UI automation, and if students spend the course fighting flaky selectors
instead of learning document understanding, the lab has failed at its only job.
The convention is documented in `docs/selectors.md`.

**Ground truth is stored from day one.**
The generator knows every correct field value. Persist it, and automatic grading, field-level
scoring and seeded-defect detection all become nearly free. Bolt it on later and it is a rewrite.

**Identity lives at mohammedshaker.com; the lab is a relying party.**
No signup in the lab. Students get access automatically by holding an active course
enrollment, and their sandbox provisions itself on first login. A shared cookie on
`.mohammedshaker.com` was considered and rejected — it couples both apps to one auth library
version and breaks across any different apex domain.

---

## 5. Open questions

**Courses platform — undecided.** Mohammed plans to add courses and learning paths to
mohammedshaker.com but has not chosen a stack. This determines the identity integration:

- Custom Next.js section → hosted IdP (WorkOS / Clerk / Auth0), entitlements in own database
- A real LMS (Moodle / Canvas / LearnDash) → **LTI 1.3**, which additionally gives grade
  passback so lab scores land in the course gradebook automatically
- SaaS platform (Teachable / Thinkific / Kajabi) → webhook-driven provisioning on purchase

Because it is undecided, P0 builds an `IdentityProvider` interface. The application only
ever consumes `{ userId, email, roles, entitlements }`. Swapping providers later touches one
module (`src/lib/identity`). **This does not block anything.**

---

## 6. Blockers — needed from Mohammed

1. **The mohammedshaker.com GitHub repository.** The lab should inherit the real design
   system rather than an approximation reconstructed from rendered CSS. If he prefers not to
   share it, the fallback is to name two or three pages and match from the served stylesheets.
2. **Vercel authorization.** The Vercel connector was not authorized in the design session,
   so no project could be created and nothing could be deployed. Either authorize the
   Vercel integration, or go the git-push route with a one-time manual deploy.

Neither blocks local scaffolding. P0 runs on `localhost:3000`.

---

## 7. P0 task breakdown

Roughly in dependency order. Status reflects this repository.

1. Scaffold Next.js (App Router) + TypeScript + Tailwind. Add Dockerfile. — done
2. Set up Postgres + Drizzle. Schema for tenants, vendors, items, employees, cost centres,
   GL accounts, purchase orders. — done
3. Build the `IdentityProvider` interface with a local credentials provider for development.
   Roles: student, TA, instructor. — done
4. Tenant scoping — `tenant_id` on every table, enforced at the query layer, not in
   application code where it can be forgotten. — done (`src/db/tenant.ts`)
5. Shared corpus seeder — deterministic, seeded RNG. Vendors with valid mod-97 IBANs and
   checksummed tax IDs. Catalogue with UoM and tax codes. — done
6. Per-student sandbox provisioning from a seed derived from user ID. Plus reset. — done
7. Selector-stable UI shell: nav, paginated tables, vendor and item master CRUD forms.
   `id` / `data-testid` naming convention documented. — done
8. First PDF template: purchase order, HTML/CSS → Chromium, in a background job.
   Watermark `SPECIMEN — TRAINING ONLY`. — done
9. Validation rule engine with declarative rules. Errors rendered in a fixed container
   **with rule IDs** so bots can branch on `PO-INV-PRICE` rather than parsing prose. — done
10. `noindex` and robots deny across the whole site. — done

**Set up at P0 even though they are used later:** the i18n structure (EN/AR) and the
Chromium render pipeline. Both are in.

## 7b. P1 — done in this repository

- Full cycle as data and PDFs: RFQ → three quotes → award (creates a draft PO) → PO →
  delivery note → goods receipt → tax invoice → payment → receipt. Every student
  sandbox gets 60 purchase orders with the documents their status implies (~250 PDFs).
- Vendor compliance documents (commercial registration, tax card, bank letter, trade
  licence) for all 250 vendors in the shared corpus. Rows and ground truth are seeded;
  the PDFs render on first download and are then cached, per the storage strategy.
- Eleven seeded defect types, each labelled in `seeded_defects` with the rule ID that
  should catch it. Roughly 30 % of non-paid invoices carry one or two defects. Six
  stand-alone invoices per sandbox have no PO or come from a vendor not in the master.
- Three-way match engine (`src/lib/validation/matching.ts`) with the rule IDs from the
  spec (`PO-INV-PRICE`, `GRN-QTY`, `DUP-INV`, `BANK-CHANGE`, `TAX-CERT-EXP`, …). A unit
  test asserts every generated defect type is caught by its rule.
- Invoice extraction screen: pending invoices show only the PDF; the student enters the
  fields, the match runs on what they typed, and the result renders in
  `#validation-errors`. Submissions are stored in `extractions` for P2 grading.
- Hands-on flows with a starting point in every sandbox: post a goods receipt from a
  delivered note (with over-receipt rules), award one of four open RFQs (creates a draft
  PO), approve / reject / pay an invoice.
- Downloads: per-document attachment URLs plus bulk ZIPs per work queue
  (`/api/queues/{invoices-pending|pos-awaiting-invoice|vendor-applications|kind:<kind>}/download`).
- UI restyled to an enterprise-ERP look (shell bar, launchpad tiles, object pages,
  toolbar tables) so the target app resembles what students automate at work. Tokens
  live in one CSS block for re-branding.

---

## 7c. P2 — done in this repository

- **Personal API tokens.** Minted on `/sandbox`, shown once, stored as a SHA-256 hash,
  revocable. `apiSession()` accepts either the token or the session cookie, so a bot can
  use whichever suits it (`src/lib/api/tokens.ts`).
- **REST API over the whole cycle** — vendors, items, purchase orders, RFQs, deliveries,
  goods receipts, invoices, extractions, payments, documents, queues, webhooks. Cursor
  pagination, weak ETags, `409` for state conflicts, `422` carrying the violated rule IDs.
- **Domain services** (`src/lib/services/`). The UI server actions and the API routes are
  both thin wrappers over the same service functions, so a rule can never apply on one
  path and not the other. This was the main structural change of P2.
- **Work queues with Orchestrator semantics** (`src/lib/api/work-items.ts`). A dispatcher
  read materialises the queue from current domain state, keyed by `(tenant, queue,
  reference)`; a performer claims one item under a lease with `FOR UPDATE SKIP LOCKED`,
  then completes or fails it. Re-running a dispatcher never duplicates work; an item whose
  source condition disappeared is abandoned with a reason rather than handed out stale.
- **OpenAPI 3.1 + Swagger UI** at `/api/docs`. `src/lib/api/openapi.test.ts` fails the
  build if a route file has no documented path or a documented path has no route file, so
  the document cannot silently drift from the code.
- **Grading.** `src/lib/grading/normalise.ts` compares by field kind (numbers to 2 dp, ISO
  dates, Arabic-Indic digits folded to Western, identifiers stripped of separators, text at
  a 0.9 similarity threshold); `score.ts` weights header fields 2 and line fields 1 and
  aligns submitted lines to ground-truth lines by item code, then description and quantity.
  Defect grading compares the seeded rule IDs with the rule IDs the student's match
  reported and returns caught / missed / false positives with recall and precision.
- **Validation Station** at `/invoices/{internalNumber}/validate`: the PDF beside the
  fields, every field group carrying `data-low-confidence` when the confidence the bot
  submitted is below 0.85, correct and resubmit. Mirrors UiPath's screen as a teaching one.
- **Instructor dashboard** at `/instructor` (staff only) with cohort stats, per-student
  drill-down and CSV export.
- **Webhooks.** Student-registered endpoints, HMAC-signed, delivered by a job so a slow or
  dead endpoint never blocks a request.
- **Build shape.** The document renderer and the job handlers are loaded dynamically, and
  the sandbox module is split into `lifecycle.ts` (request side) and `provision.ts` (job
  side), so `playwright-core` stays out of the page bundles and the standalone build runs
  without it.

---

## 7d. P3 — done in this repository

- **The difficulty ladder** (`src/lib/documents/levels.ts`). Five levels, a public contract
  like the rule IDs: 1 native PDF, 2 clean scan (300 dpi), 3 office scan (200 dpi, up to 3°
  of skew, noise, uneven light), 4 phone photo (perspective, shadow, warm cast), 5 a handled
  page (stamps, handwriting, staples, folds). Levels 2 to 5 are image-only PDFs, so a bot
  that read level 1 with a text extractor has to switch to OCR.
- **Degradation runs in Chromium**, not in a native image library. pdf.js rasterises the
  level-1 PDF inside the page, SVG filters (`feTurbulence` for grain) and CSS transforms do
  the damage, each page is screenshotted as JPEG, and the JPEGs are printed back into a PDF.
  One rendering engine for the whole lab: nothing to install on a serverless host, and the
  filters are seeded, so a level is reproducible. Verified: the same document and level
  produce byte-identical page images across runs.
- **Deterministic parameters** (`degrade-params.ts`), seeded from `(document id, level)`.
  Two documents at the same level are damaged differently; one document always degrades the
  same way. Unit-tested.
- **Lazy production.** Level 1 stays eager. A level above 1 is produced on first request,
  cached in the blob store, and the request answers `409` with `Retry-After` while the job
  runs. Measured at about one second per page after warm-up, 2.8 s cold.
- **Arabic-first documents.** Every vendor carries a `documentLanguage` (about half
  bilingual, a third Arabic-first, a fifth English only) and prints its own paperwork in it,
  including the certificates an authority issues about it. Arabic-first means RTL with
  English as the secondary script, Eastern Arabic numerals for about two in five of those
  vendors, and a Hijri date beside the ISO one. The Hijri conversion is arithmetic rather
  than `Intl`, so it cannot drift with an ICU version; it is decoration, never graded, and
  the ISO date is always printed.
- **Bilingual ground truth.** `ground_truth.alternates` records the other script of a name
  or description, and the grader takes the best reading, so an Arabic extraction of a
  bilingual invoice scores 1.0.
- **Field boxes.** Template elements carrying a graded value are tagged `data-gt-field`; the
  renderer measures them against the printed page and stores a normalised box per field
  (`document_field_boxes`). The degradation pipeline puts marker elements through the same
  transform, so the boxes follow the skew and perspective. Exposed on
  `GET /api/documents/{id}?boxes=1` and drawn as a page map on the validation station.
- **The ladder in the exercise.** The instructor sets a cohort level on `/instructor`; the
  queue API hands out download URLs at that level, an extraction records the level it was
  read from, and both the dashboard and the CSV export report accuracy per level.
- **Acceptance measured, not asserted.** `pnpm ocr:ladder` renders every level, reads page 1
  back with Tesseract and reports the share of ground-truth values the OCR text contains, by
  the script the vendor printed in. Which engine a *student* points at these documents is
  their decision and part of the exercise; Tesseract is here because it is free and
  scriptable, and the lab needs some way to prove its own ladder is real.
  On a 15-invoice mixed sample at 300 dpi: L1 80.1 %, L2 80.0 %, L3 79.0 %, L4 64.3 %,
  L5 48.2 % — monotonic. On 8 Arabic-first invoices: L1 51.0 %, L2 52.8 %, L3 49.0 %,
  L4 36.1 %, L5 23.5 %.
  Three findings worth keeping:
  1. A *clean* synthetic scan costs OCR almost nothing. The real step for a bot is between
     level 1 and level 2, where the text layer disappears, and again at level 4 where
     perspective and shadow start to bite.
  2. Arabic costs about half the recall at every level with this engine, and collapses at
     level 5. Engine choice and configuration matter far more than the level does — which
     is the judgement the exercise is meant to teach.
  3. Individual Arabic documents range from 20 % to 100 % at level 1. Inspecting the weakest
     one, it comes from a vendor that prints Eastern Arabic numerals (٠١٢), which this engine
     reads badly. Worth confirming across a larger sample before it goes in a lecture, but it
     is exactly the kind of failure a student should meet and solve.

---

## 8. Risks and gotchas

- **Arabic and RTL.** Bilingual PDF templates are the hardest technical piece. Do not defer
  the renderer choice; validate Arabic shaping with a real template early, even though the
  Arabic *content* is scheduled for P3. The PO template already carries Arabic labels for
  this reason.
- **Storage growth.** Heavy L3–L5 degraded scans can run to megabytes each. Render L1/L2
  eagerly and generate the hard levels on first download, then cache. Watch blob spend.
- **Sandbox provisioning time.** Rendering ~250 PDFs takes minutes. It must be a background
  job with a visible progress state, not a blocking request.
- **Replayability.** Students rerun bots constantly. Reset must return identical starting
  conditions, and API endpoints should be idempotent where possible.
- **Fake financial data.** Plausible IBANs and tax IDs must never be indexable or mistakable
  for real documents. Watermark plus `noindex` are non-negotiable.
- **Do not "consolidate" the lab onto the VPS to save money.** See section 4.

---

## 9. Glossary

For a developer who knows web engineering but not procurement or UiPath.

- **RFQ / RFP** — request for quotation / proposal. The buyer asks vendors to bid.
- **PO** — purchase order. The buyer's binding order to a chosen vendor.
- **Delivery note** — accompanies goods when the vendor ships them.
- **GRN** — goods receipt note. What the warehouse confirms it actually received.
- **Three-way match** — the core AP control: purchase order vs goods receipt vs invoice must
  agree on quantity and price within tolerance before payment. Most seeded defects are
  designed to break this in an instructive way.
- **Dispatcher / performer** — the standard UiPath pattern. A dispatcher bot scrapes a list
  of pending work and pushes items onto a queue; a performer bot pulls items one at a time
  and processes each. The lab provides queue-shaped views to support both halves.
- **Document Understanding** — UiPath's product for extracting structured fields from
  documents. Also the name of the course.
- **Validation station** — UiPath's human-in-the-loop screen where a person corrects
  machine-extracted fields. The lab mirrors this as a teaching screen.
- **Ground truth** — the known-correct field values, used to score extraction accuracy.
- **LTI 1.3 / AGS** — the standard for launching an external tool from an LMS carrying
  student and course context. AGS is the part that writes grades back.
