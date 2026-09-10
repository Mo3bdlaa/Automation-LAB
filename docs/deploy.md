# Deploying Automation Lab

The short version: **Vercel for the app, Neon for the database, Cloudflare R2 for the
documents, and you build the document set on your own machine and never on the server.**

That last part is what makes this cheap and simple. The transaction set is shared by
everyone and fixed until you decide to change it, so all the heavy work — generating it,
rendering ~287 PDFs, producing difficulty levels 2 to 5 — happens once, wherever you are
sitting, and the deployed app only ever reads the result. Nothing on Vercel needs a
browser, a render queue, or a background worker.

---

## 1. What each piece is for

| Piece | Why | Cost at this size |
|---|---|---|
| **Vercel** | Runs the Next.js app. Matches mohammedshaker.com's platform and shares its apex domain. | Free tier is enough to start |
| **Neon Postgres** | The database. Serverless-friendly, and Vercel's own Postgres offering *is* Neon. | Free tier ≈ 0.5 GB, far more than needed |
| **Cloudflare R2** | The rendered PDFs. ~200 MB for every document at every level, for the whole site. | Free below 10 GB, **and no egress charge** |

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

## 4. Build the document set (on your machine)

This is the one step that needs Chromium, and it runs locally.

```bash
export DATABASE_URL="postgres://…-pooler…/db?sslmode=require"   # the production database
export BLOB_STORE=s3
export S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
export S3_BUCKET=automation-lab
export S3_REGION=auto
export S3_ACCESS_KEY_ID=…
export S3_SECRET_ACCESS_KEY=…

pnpm blob:check      # proves the bucket accepts writes before you spend 20 minutes
pnpm db:migrate
pnpm db:seed --levels
```

`pnpm blob:check` first, always. It writes one small object, reads it back, compares the
bytes and deletes it. Credentials that are wrong will fail in two seconds instead of
after the whole seed.

`--levels` produces difficulty levels 2 to 5 up front. Without it they are generated on
first request, which would mean Chromium on Vercel; with it there is nothing left to
render at request time. Expect roughly 20 minutes and ~200 MB.

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

`IDENTITY_PROVIDER` defaults to `accounts` in production; leave it unset.
Do **not** set `ALLOW_LOCAL_IDENTITY_IN_PROD` or `ALLOW_LOCAL_BLOBS_IN_PROD` — both exist
only to make a misconfiguration fail loudly instead of quietly.

3. Deploy.
4. Settings → **Domains** → add `automationlab.mohammedshaker.com`, and add the CNAME
   Vercel shows you at your DNS provider.

`vercel.json` already schedules `/api/jobs/run` every five minutes. With the documents
pre-built there is little for it to do beyond delivering webhooks, but leave it: it is
also what prunes expired rate-limit windows.

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
  which then tries to start Chromium in a serverless function.
- **Reusing the development `SESSION_SECRET`.** It is in the repository. Anyone could mint
  a session cookie.

## If you would rather not use Vercel

The repository has a `Dockerfile` that bundles Chromium and the fonts, so the whole thing
runs anywhere that takes a container, with `BLOB_STORE=local` on a persistent disk and
`pnpm worker` alongside it. That path is kept working but it is the fallback — see
`docs/handoff.md` section 4 for why the VPS was ruled out.
