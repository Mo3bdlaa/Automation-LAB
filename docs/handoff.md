# Automation Lab — handoff

**Date:** 2026-09-10
**Status:** P0, P1, P2, P3, P5 (the public challenge) and P6 (shared master set, hosting readiness) implemented in this repository. What remains before launch is a deployment and a mail server — see `docs/deploy.md`.
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

This repository holds P0 to P3 and P5: the foundation, the full document cycle, the REST API
with grading and the Validation Station, the difficulty ladder with Arabic-first documents,
and the public challenge — self-service accounts, four scored scenarios, a five-parameter
grader, an opt-in leaderboard and verifiable certificates. See `README.md` for what is
implemented and how to run it.

Not yet done: P4 (Vercel project, DNS record, production database, S3-compatible blob store,
rate limits, flaky mode, an institutional identity provider and gradebook integration) and
the course material itself — the exercise briefs, starter UiPath projects and the marking
scheme that turns a score into a grade. P5 shipped ahead of P4 deliberately: the challenge
only needs an account and a database, and it is the piece that makes the lab worth putting
in front of people.

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

P5 settled the *public* half of it: the challenge runs on self-service email-and-password
accounts (`accounts`), which need no third party and no purchase decision. A course cohort
arriving later through an LMS or a hosted IdP is an additional provider, not a replacement —
the two can coexist, and a participant who signed up for the hackathon keeps their runs and
their certificates.

---

## 6. Blockers — needed from Mohammed

1. **The mohammedshaker.com GitHub repository.** The lab should inherit the real design
   system rather than an approximation reconstructed from rendered CSS. If he prefers not to
   share it, the fallback is to name two or three pages and match from the served stylesheets.
2. **Vercel authorization.** The Vercel connector was not authorized in the design session,
   so no project could be created and nothing could be deployed. Either authorize the
   Vercel integration, or go the git-push route with a one-time manual deploy.

3. **A decision on where the public challenge is announced**, and when. The platform is
   ready and the certificates are verifiable; what is missing is a date, a domain record and
   whoever countersigns the certificates for the chapter.

Neither of the first two blocks local scaffolding. P0 runs on `localhost:3000`.

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
- UI restyled to an enterprise-ERP look so the target app resembles what students
  automate at work: a grouped module sidebar, a top bar with breadcrumb and search,
  object pages, toolbar tables with status tabs. Tokens live in one CSS block for
  re-branding. See `docs/spec.md` § Look and feel.

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
  what the vendor printed. Which engine a *student* points at these documents is
  their decision and part of the exercise; Tesseract is here because it is free and
  scriptable, and the lab needs some way to prove its own ladder is real.
  The check that no level reads *better* than the one before it is paired per document and
  measured against the sampling error, not a fixed margin. Both matter: the same documents
  are read at every level, so pairing removes the difference between an easy invoice and a
  hard one, and a population this spread out moves several points between runs on noise
  alone — a fixed margin failed an honest 24-document run at random, and a flaky acceptance
  test gets ignored. Levels 1 and 2 are expected to tie, because level 1 is measured through
  OCR of a rasterised page too and the only difference is faint blur. On 24 invoices the
  steps are L1→L2 −1.0 points (2 s.e. 1.0), L2→L3 −2.4 (2.0), L3→L4 −10.9 (4.1),
  L4→L5 −7.5 (5.7): the ladder's weight is in levels 4 and 5.
  On a 30-invoice mixed sample at 300 dpi: L1 79.0 %, L2 78.8 %, L3 76.5 %, L4 62.6 %,
  L5 51.5 % — monotonic, and within a point or two of the earlier 15-invoice run, so the
  curve is stable. By what the vendor printed: English 93 / 92 / 91 / 76 / 69 %, bilingual
  80 / 79 / 77 / 61 / 50 %, Arabic-first 58 / 64 / 59 / 50 / 36 %.
  Three findings worth keeping:
  1. A *clean* synthetic scan costs OCR almost nothing. The real step for a bot is between
     level 1 and level 2, where the text layer disappears, and again at level 4 where
     perspective and shadow start to bite.
  2. **It is not Arabic that costs recall — it is the numeral system.** An earlier reading of
     this, that Arabic costs about half the recall, was wrong: it averaged a bimodal
     population into one number. Splitting *all 105* Arabic-first invoices at level 1 by
     whether the vendor prints Eastern Arabic-Indic digits (٠١٢): with Western digits
     **91.4 %** overall and 87.5 % on numeric fields; with Eastern digits **27.2 %** overall
     and **2.9 %** on numeric fields. An Arabic-first document printed with Western digits
     reads as well as an English one (91.4 against 93). Tesseract with `ara+eng` essentially
     cannot read Eastern digits at all — 2.9 % is a floor, not a degradation, and the 27 %
     that remains is the Arabic *words* still being read around numbers that are lost.
     `pnpm ocr:ladder` now reports the two Arabic groups separately, because averaging them
     is what produced the wrong conclusion in the first place.
  3. So engine choice and configuration dominate the difficulty level, which is the judgement
     the exercise is meant to teach: a student who notices the digits and switches engine,
     adds a digit-aware pass, or folds the numerals before matching recovers almost
     everything, and one who blames "Arabic OCR" gets nowhere. Roughly two vendors in five
     printing Arabic-first use Eastern digits, and about three vendors in ten print
     Arabic-first, so this hits around one document in eight — a difficulty spike, not a
     wall, and the bilingual documents (about half the corpus) always print both scripts
     with the alternates recorded in ground truth.

---

## 7e. P5 — the public challenge — done in this repository

The lab was built for a cohort. P5 turns it into something a stranger can find, use and
prove they used: the same sandbox, wrapped in a scored, timed, verifiable challenge. It is
what a UiPath community chapter can run as a hackathon.

- **Self-service accounts** (`src/lib/identity/accounts.ts`). Email and password, hashed
  with scrypt (`scrypt$N$r$p$salt$hash`) and compared in constant time. No third-party
  sign-in: this is a public event for people who may not have — or want to use — a Google
  account, and one more consent screen between a participant and their first invoice is one
  too many. A profile carries a display name, a leaderboard alias and a location; the
  leaderboard shows the alias and the location, never the email. `accounts` is the
  production default; the fixture provider stays for development and runs *beside* it, so
  the smoke tests and the sign-up form both work without switching providers.
- **Four scenarios** (`src/lib/challenge/scenarios.ts`), each with its steps, the rules in
  scope, a par time per item, a queue and a target size: accounts payable
  (`invoice-processing`, 12 invoices, documents must be read), supplier onboarding
  (`vendor-onboarding`, 10 applications, documents must be read), warehouse
  (`goods-receipt`, 8 deliveries) and sourcing (`sourcing-award`, 6 requests). Slugs,
  weights and pass marks are a public contract: a certificate and a board entry both point
  at a scenario version, so a changed meaning invalidates them. Bump `version` instead.
- **Runs** (`src/lib/challenge/runs.ts`). A run is opened against a scenario in `practice`
  or `scored` mode, fixes its target references at that moment, starts a clock, and is
  closed or abandoned. One open run per participant; a second start answers `409`. Starting
  a scored run whose queue is too short answers `queue_short` rather than handing out a run
  that cannot be finished — which is why the sandbox generator now *guarantees* queue
  depths instead of leaving them to the seed.
- **Five judging parameters** (`src/lib/challenge/score.ts`): accuracy (values against
  ground truth), decisions (approve, reject, pay, hold, refuse), exceptions (the seeded
  problems, scored as an F1 over caught / missed / invented), coverage (how much of the
  queue) and time (against par). Weights are 40/20/25/10/5 where documents must be read and
  45/25/10/15/5 where they need not be, because a scenario with no reading in it should not
  award a quarter of its marks for catching document defects.
- **No oracle while the run is open.** During a scored run the application returns the
  business result and withholds the grade; only the first submission for a document counts.
  Without this a participant can brute-force an invoice by resubmitting until the score
  moves, which measures patience rather than automation.
- **The channel is observed, not declared.** Every audited action records whether it arrived
  through the screens or through a bearer token (`LabSession.channel`), and the run reads it
  back from its own audit trail. A UI board and an API board therefore mean something: a run
  cannot be entered on the wrong one by claiming.
- **Opt-in leaderboard** (`/leaderboard`). Nothing is published until its owner publishes it
  and unpublishing removes it again; only a participant's best run per scenario is shown.
  Ranking people who did not ask to be ranked is the fastest way to make a public event feel
  hostile.
- **Certificates** (`src/lib/challenge/certificate.ts`). A passing scored run mints a code in
  an alphabet without look-alike characters — idempotently, so re-closing never issues a
  second one. `/verify/{code}` is public and unauthenticated, names the holder, the scenario
  and the score, and serves a PDF; an invented code answers 404. The certificate is
  deliberately the one document in the lab that is *not* watermarked `SPECIMEN`: it is a real
  statement about a real run, and it is the artefact a chapter leader endorses.
- **Per-scenario documents.** `/challenges/{slug}/pdd.pdf` is generated from the same
  scenario definition the grader uses, so the process document cannot describe a process the
  grader does not measure. `/challenges/{slug}/sdd.docx` is a solution design skeleton with
  the facts filled in and the thinking left blank — handing over a finished design would
  remove the exercise.
- **A walkthrough bots can ignore.** The scenario page carries a side panel of steps with
  the endpoints and selectors for each. It never overlays the page and never intercepts
  pointer events, so a UI bot behaves identically whether it is open or closed.
- **The run API** (`/api/scenarios`, `/api/challenge/runs`, `/{id}`, `/close`, `/abandon`,
  `/api/leaderboard`). An unattended performer opens a run, receives the references it will
  be judged on, works them, and closes for the score. Polling a run reports status, items
  processed and elapsed time — enough to know it is being scored, nothing about how well.
- **Verified end to end.** `pnpm challenge:smoke` signs up through the sign-up form, waits
  for the sandbox, mints a token, opens a scored goods-receipt run, works the queue
  *correctly* over the API, closes it, and asserts it passes — a smoke test that only ever
  submits rubbish proves the grader rejects rubbish, not that it rewards good work. It then
  verifies the certificate publicly and checks the leaderboard opt-in and opt-out.

**Every scenario is proved winnable.** `pnpm scorer:proof` plays all four perfectly —
submitting the ground truth, making the decision the rules call for, catching every seeded
defect — and asserts each scores 100. It is not a formality: the first run found two real
faults in the flagship scenario, which had been sitting at 53.5 out of 100 for a flawless
performance. See section 7f.

Two things the scoring work surfaced that are worth remembering:

1. **A grader can contradict itself.** The first goods-receipt scorer paid decision points
   for refusing an over-delivery and took accuracy and coverage points away for the same
   act, so the correct play was to score badly on purpose. Accuracy now excludes refused
   notes from its denominator and coverage counts an item as covered when it was received
   *or* refused. Any new scenario needs the same check: play it perfectly on paper and
   confirm the perfect play scores 100.
2. **A scenario has to be possible.** Supplier onboarding was unplayable at first because the
   vendors in it came from the shared corpus, which is read-only through `TenantDb`. Vendor
   applications are now generated into the participant's own tenant and the queue only lists
   rows they can write. Check writability before a queue is a scenario.

---

## 7f. P6 — one master set, and ready to host — done in this repository

The lab was built for a cohort of thirty. The decision to run it as an open practice site —
"like ACME and RPA Challenge" — changed the economics, and this phase followed the change.

- **The transaction set is shared, not copied.** Every signup used to generate and render
  374 documents, taking 1.5 to 4 minutes before anyone could start and 32 MB at level 1
  alone. A full run of all four scenarios touches 36 of them. At a thousand participants
  that is 374,000 renders of what could be one corpus. It is now built once by
  `pnpm db:seed`: measured at 76 seconds for the corpus, the transaction set and 287
  rendered documents, for every participant there will ever be.
- **A participant's changes are patches, not copies** (`entity_overlays`, `src/db/tenant.ts`).
  The blocker was never storage, it was that a participant must be able to change what they
  see. They read the master rows directly and a change is stored as a delta merged back on
  read for them alone. A delta rather than a copy so ids never move, which means the lines,
  documents and ground truth hanging off a row keep resolving with nothing else to migrate.
  The part that needed proving was filtering: an invoice you approved must stop appearing in
  a query for pending invoices, and that filter is written by the query builder against the
  master row. Resolving reads through a CTE that shadows the table name makes the same
  `where "invoices"."status" = …` bind to the merged row, so all 28 call sites work
  untouched. Verified end to end: one participant posts eight goods receipts and scores 100,
  a second then finds the same eight deliveries untouched and also scores 100. Two full runs
  cost 32 overlay rows and moved total storage from 26 MB to 27 MB.
- **Document sets are versioned.** An event may change the data, so every result records
  which build it was scored against. Boards are per build; a certificate already issued keeps
  verifying and now names what it was earned on. Rebuilding also turned out to be *impossible*
  rather than merely disruptive, which only showed up by trying it: a participant's goods
  receipt references a delivery note in the master set, so replacing that set failed on a
  foreign key. Clearing everyone's in-flight work first makes the consequence explicit.
  Accounts, tokens and completed runs with their certificates survive.
- **Robot credentials.** Bearer tokens only ever worked for the REST API. Driving the
  *screens* meant putting your own password into a workflow you would screen-share or
  commit. Every account now gets its own login on a separate domain, created at sign-up,
  resolving to its owner's sandbox rather than getting one of its own. `personUserId()` is
  what identity means wherever the question is "whose is this?" rather than "who signed
  in?" — runs, scores, certificates.
- **Rate limiting that does not break the site.** An open site pointed at by robots needs
  limits that stop an attack without stopping the thing the site is for, and those pull in
  opposite directions. Tight where credentials are guessed (10 sign-ins per 15 minutes, 5
  sign-ups an hour, per address — counted by address rather than the email typed, or anyone
  could lock a participant out of their own account). Generous where the work happens (600
  a minute per account; a twelve-invoice run uses under a fifth). Counters are in Postgres,
  not memory, because serverless requests land in different instances. Enforced in
  `apiSession()`, which every API route already goes through, so a new endpoint is covered
  the day it is written.
- **No browser in production.** `pnpm db:seed --levels` produces difficulty levels 2 to 5
  up front. They used to be generated on first request, which would have meant Chromium
  inside a serverless function; now there is nothing left to render at request time.
  Measured on a full build: 1,334 documents at five levels is 6,750 files and **794 MB**,
  against a 43 MB database — the whole site, for every participant there will ever be. It
  takes about an hour and a half at roughly 55 files a minute, and is resumable, because it
  also renders the 1,000 vendor compliance documents that used to be produced only when
  someone opened one. Level 2 dominates the storage at 414 MB: a clean 300 dpi scan
  compresses worse than the photographs above it.
- **An S3-compatible blob store** (`createS3BlobStore`), written against the REST API with
  SigV4 signing rather than the AWS SDK, which is 15 MB of dependency for four verbs. Works
  with R2, B2, MinIO or S3. `BLOB_STORE=local` now refuses to start in production, because a
  serverless function's disk does not survive the request and it would serve 404s from
  another instance rather than failing honestly. `pnpm blob:check` proves a real bucket
  works in two seconds — the unit tests run against a stand-in server and cannot prove that
  AWS accepts the signature.
- **`docs/deploy.md`** — Vercel, Neon, R2, with the document set built locally and never on
  the server, and a list of the things that will bite.

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
- **A public event is a provisioning event.** Every sign-up provisions a sandbox and renders
  its documents. `SANDBOX_ACTIVE_POS` sizes the cycle down (default 60) and the challenge
  scenarios were sized to fit a small sandbox for exactly this reason; measure a burst of
  concurrent sign-ups before advertising a date.
- **Certificates are the one unwatermarked document.** Anything printed on one is a claim
  the lab is making in public. Keep the code alphabet, the idempotent issue and the public
  verification page as they are.

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
