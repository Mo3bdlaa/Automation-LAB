# Deploying Automation Lab

The short version: **Vercel for the app, Neon for the database, Cloudflare R2 for the
documents, and the document set is built once, elsewhere, and never on the server.**

That last part is what makes this cheap and simple. The document set is shared by everyone
and fixed until you decide to change it, so all the heavy work — generating it, rendering
the PDFs, producing difficulty levels 2 to 5 — happens once, on a machine with a browser,
and the deployed app only ever reads the result. No render queue and no background worker
on Vercel.

Two qualifications.

**Two documents are printed on demand**, because they cannot exist in advance: a
certificate, which names a particular person and score, and a scenario's process document,
which carries the site's own address. Those render inside the request, so the deployment
does carry a browser — `@sparticuz/chromium`, a Chromium packaged for serverless that
unpacks itself into `/tmp`. It is traced into exactly those two functions and nowhere else;
see *Things that will bite*.

**Two participant actions create a document of their own** — posting a goods receipt, and
approving a purchase order they awarded. In production the lab does not print those (see
`PARTICIPANT_DOCUMENT_PDFS` below): the receipt and the order exist with their numbers,
lines and status, every screen and endpoint works, and only the printed copy is missing.
Nothing in any scenario reads it. This is a cost decision rather than a capability one —
eight renders for every goods-receipt run is the per-participant work the shared document
set was built to remove.

Measured on the build now deployed: **1,335 documents × 5 difficulty levels = 6,675 files,
745 MB**, and a **46 MB** database. That is the whole site, for every participant there
will ever be.

---

## 1. What each piece is for

| Piece | Why | Cost at this size |
|---|---|---|
| **Vercel** | Runs the Next.js app. Matches mohammedshaker.com's platform and shares its apex domain. | Free tier is enough to start |
| **Neon Postgres** | The database. Serverless-friendly, and Vercel's own Postgres offering *is* Neon. | Free tier ≈ 0.5 GB; the seeded database is 46 MB |
| **Cloudflare R2** | The rendered PDFs: 745 MB measured, for the whole site. | Free below 10 GB, **and no egress charge** |

R2 rather than S3 specifically because this site's job is handing people PDFs, and S3
bills for every byte leaving the bucket. R2 does not. Any S3-compatible store works —
Backblaze B2, MinIO, S3 itself — the code speaks plain S3.

---

## 2. Database

1. Create a project at **neon.tech** (or Vercel → Storage → Postgres, which is the same thing).
2. Copy the **pooled** connection string. It looks like
   `postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require`.
   The word `pooler` matters: serverless functions open a lot of short-lived connections
   and the unpooled endpoint will run out.
3. Keep it as `DATABASE_URL`.

## 3. Object storage

1. Cloudflare dashboard → **R2** → create a bucket, e.g. `automation-lab`.
2. **R2 → Manage API Tokens** → create a token with *Object Read & Write* on that bucket.
3. Note the account-scoped endpoint: `https://<account-id>.r2.cloudflarestorage.com`.

Keep the bucket **private**. Documents are served through the app, which checks the
session first — a public bucket would hand out every invoice to anyone with the URL.

## 4. Build the document set

This is the one step that needs Chromium, and the one step that cannot run on
Vercel: it renders thousands of PDFs over about two hours, which fits in no
serverless function's time limit. It needs a machine with Node, a browser and
network access — and the easiest one is GitHub's.

### The easy way: the Seed workflow

Put the credentials in **Settings → Secrets and variables → Actions → New repository secret**, five of them:

| Secret | Value |
|---|---|
| `DATABASE_URL` | the pooled Neon string |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` — the host only, no bucket |
| `S3_BUCKET` | your bucket name |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from the R2 API token |
| `S3_REGION` | optional; defaults to `auto` |

Then **Actions → Seed the document set → Run workflow**, with *levels* ticked.
It checks the credentials first, migrates, builds, and prints what it produced.
It never runs on a push: replacing the documents everyone is working on is a
decision, not a side effect of merging.

This is also how you change the documents between events — the same button with
*force* ticked.

The secrets then live in exactly two places, GitHub and Vercel, and never in a
shell history.

### The manual way: on your own machine

Same thing, if you would rather watch it run:

```bash
export DATABASE_URL="postgres://…-pooler…/db?sslmode=require"   # the production database
export BLOB_STORE=s3
export S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
export S3_BUCKET=automation-lab
export S3_REGION=auto
export S3_ACCESS_KEY_ID=…
export S3_SECRET_ACCESS_KEY=…

pnpm blob:check      # proves the bucket accepts writes before you spend an hour rendering
pnpm db:migrate
pnpm db:seed --levels
```

`pnpm blob:check` first, always. It writes one small object, reads it back, compares the
bytes and deletes it. Credentials that are wrong will fail in two seconds instead of
after the whole seed.

`--levels` produces difficulty levels 2 to 5 up front. Without it they are generated on
first request, which would mean Chromium on Vercel; with it there is nothing left to render
at request time.

Budget **about an hour and a half** for it and let it run — roughly 55 files a minute,
5,336 of them, and it includes the 1,000 vendor compliance documents that were previously
only rendered when someone opened them. It is resumable: anything already produced is
skipped, so if it stops you can simply run it again. Level 2 is by far the largest at
414 MB, because a clean 300 dpi scan compresses worse than the photographs above it.

## 5. Vercel project

1. Vercel → **Add New → Project** → import the repository. Framework detects as Next.js;
   accept the defaults.
2. Settings → **Environment Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooled Neon string |
| `SESSION_SECRET` | `openssl rand -hex 32` — a fresh one, not the dev value |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `APP_ORIGIN` | `https://automationlab.mohammedshaker.com` |
| `BLOB_STORE` | `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | as above |
| `STAFF_EMAILS` | your address, comma-separated — this grants the instructor screens |

`PARTICIPANT_DOCUMENT_PDFS` is off in production by default. The deployment does have a
browser, so turning it on would work — the reason to leave it off is cost, not capability:
eight renders for every goods-receipt run, thousands across an event.

`IDENTITY_PROVIDER` defaults to `accounts` in production; leave it unset.
Do **not** set `ALLOW_LOCAL_IDENTITY_IN_PROD` or `ALLOW_LOCAL_BLOBS_IN_PROD` — both exist
only to make a misconfiguration fail loudly instead of quietly.

3. Deploy.
4. Settings → **Domains** → add `automationlab.mohammedshaker.com`, and add the CNAME
   Vercel shows you at your DNS provider.

`vercel.json` schedules `/api/jobs/run` once a day, which is all the Hobby plan allows —
anything more frequent is rejected at import with *"Hobby accounts are limited to daily
cron jobs"*.

Daily is enough, because the cron is a safety net rather than the main path: jobs are run
in-process immediately after they are enqueued (`kickJobs`), and with the document set
pre-built the only things left in the queue are webhook deliveries and pruning expired
rate-limit windows. The cron exists to retry a webhook whose endpoint was down and to take
out the rate-limit rubbish. On a Pro plan you can lower it if you want failed webhooks
retried sooner.

## 6. Check it

```bash
curl https://automationlab.mohammedshaker.com/api/health          # {"ok":true,"db":"ok"}
curl -I https://automationlab.mohammedshaker.com/                  # X-Robots-Tag: noindex
BASE_URL=https://automationlab.mohammedshaker.com pnpm challenge:smoke
```

The smoke test is the real check. It signs up as a new participant, confirms the sandbox
is ready with no wait, opens a scored run, works it correctly through the API, and
asserts the score, the certificate, its public verification and the leaderboard opt-in.
If that passes against production, production works.

---

## Changing the documents later

Between events, when you want fresh data:

Either **Actions → Seed the document set** with *force* ticked, or locally:

```bash
pnpm db:seed --force --levels
```

This bumps the document set's build number. Boards are per build, so the leaderboard
starts clean, and every certificate already issued keeps verifying and now names the build
it was earned on. Participants' in-flight work is cleared — their accounts, runs, scores
and certificates are not.

Do it deliberately, and not while an event is running.

---

## Things that will bite

- **`BLOB_STORE=local` on Vercel.** A function's disk does not survive the request, so it
  would appear to work and then serve 404s from a different instance. The app refuses to
  start this way in production.
- **The unpooled Neon string.** Works fine under test, exhausts connections under load.
- **A public R2 bucket.** Every generated invoice becomes world-readable. Keep it private
  and let the app serve documents.
- **Forgetting `--levels`.** Everything works until someone requests a level-3 document,
  which then tries to degrade it inside a serverless function — a browser-driven pipeline
  that is nothing like printing one page, and will time out. It is not only the invoices:
  a vendor's commercial licence at level 3 goes down the same path.
- **Turning on `PARTICIPANT_DOCUMENT_PDFS` without a browser.** Goods receipts would queue
  render jobs that never run, and their document card would wait for ever.
- **Reusing the development `SESSION_SECRET`.** It is in the repository. Anyone could mint
  a session cookie.
- **`output: "standalone"` on Vercel.** It is set for the Dockerfile and is switched off
  when `VERCEL` is present. Forcing it back on fails the build at the last step with a
  missing `next-server.js.nft.json`: standalone mode produces its own server directory
  instead of the trace files Vercel's builder reads.
- **Touching how the browser reaches the two PDF routes.** Three separate things have to
  hold, and each one has already broken this in production once:
  - `@sparticuz/chromium` is listed in `serverExternalPackages`, or Next bundles it and
    the 67 MB payload it reads *by path* is left behind.
  - `outputFileTracingIncludes` copies `node_modules/@sparticuz/chromium/bin/**` into the
    two functions that print. Those keys are **globs**, so `**/certificate.pdf/route`
    matches and a literal `/verify/[code]/certificate.pdf/route` matches nothing at all —
    silently, with a green build.
  - the same list also carries `node_modules/playwright-core/browsers.json`. That one
    cost four deployments: playwright-core reads it off disk as it loads, the read is not
    an import so tracing cannot see it, and `serverExternalPackages` copies a package's
    code and not its data. The import threw before any browser work started, so it
    presented as a missing browser and was twice taken for one. **Anything either package
    reads by path has to be listed here** — that is the rule, not these two files.
  - `.npmrc` sets `node-linker=hoisted`. With pnpm's default store the package directory
    is a symlink, and Vercel rejects the bundle with *"invalid deployment package"*.

  `pnpm pdf:proof` is the check: it removes every local browser from the lookup path and
  prints all four process documents and a certificate through the serverless one. CI runs
  it. It is the only test that exercises what production does — though note what it cannot
  see: it runs against a full `node_modules`, so a file that tracing failed to package
  is still on disk. For that, build with `VERCEL=1` and read the two traces:

  ```bash
  VERCEL=1 pnpm build
  grep -c browsers.json '.next/server/app/challenges/[slug]/pdd.pdf/route.js.nft.json'
  ```
- **A 500 from either printing route names its own cause** in the response body, on
  purpose: `curl https://<your-domain>/challenges/invoice-processing/pdd.pdf`. The
  alternative was another blind deployment, and there is nothing here to leak — the
  repository is public and the data is generated. If you would rather it did not, the
  message is produced in one place, `src/lib/documents/print-route.ts`.

## Replacing the credentials afterwards

Everything above was set up with secrets created while the site was empty and
passed around while it was being wired together. Before the lab carries anyone's
real work, replace all five: **[`docs/rotate-credentials.md`](rotate-credentials.md)**.

## If you would rather not use Vercel

The repository has a `Dockerfile` that bundles Chromium and the fonts, so the whole thing
runs anywhere that takes a container, with `BLOB_STORE=local` on a persistent disk and
`pnpm worker` alongside it. That path is kept working but it is the fallback — see
`docs/handoff.md` section 4 for why the VPS was ruled out.
