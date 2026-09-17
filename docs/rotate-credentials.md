# Rotating the credentials

Everything the deployment holds was created while the site was empty and was
handed around while it was being set up. Before it carries anyone's real work,
replace all of it. The order below is deliberate: each step either has no
downtime or has a window you choose.

There are five secrets, in three places (Neon, Cloudflare, Vercel) plus a copy
of two of them in GitHub Actions.

| Secret | Where it lives | What breaks while it is wrong |
|---|---|---|
| `DATABASE_URL` | Neon → Vercel, GitHub | everything |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Cloudflare R2 → Vercel, GitHub | every document |
| `SESSION_SECRET` | Vercel only | everyone is signed out |
| `CRON_SECRET` | Vercel only | the daily job run |

---

## 1. The database password

Neon rotates by resetting the role's password, and the old one stops working the
moment you do — so change it in Vercel in the same sitting.

1. Neon → your project → **Roles** → the role in the connection string →
   **Reset password**. Copy the new **pooled** string (it must still contain
   `-pooler`).
2. Vercel → the project → **Settings → Environment Variables** → edit
   `DATABASE_URL` → paste → save.
3. GitHub → **Settings → Secrets and variables → Actions** → update
   `DATABASE_URL` there too, or the next seed run fails at its first step.
4. Vercel → **Deployments** → the latest → **Redeploy**. Environment variables
   are read at build and at boot, so the running deployment keeps the old value
   until it is replaced.
5. Check: `curl https://<your-domain>/api/health` → `{"ok":true,"db":"ok"}`.

The gap between steps 1 and 4 is real downtime — a minute or two. Do it when
nobody is working.

## 2. The R2 keys

R2 lets two tokens exist at once, so this one has no downtime if you do it in
this order.

1. Cloudflare → **R2 → Manage API Tokens** → create a *second* token with
   *Object Read & Write* on the same bucket. Copy both halves.
2. Vercel → update `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` → **Redeploy**.
3. GitHub → update the same two Actions secrets.
4. Prove the new keys work before destroying the old ones:

   ```bash
   export BLOB_STORE=s3 S3_ENDPOINT=… S3_BUCKET=… S3_REGION=auto
   export S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=…
   pnpm blob:check
   ```

   It writes one object, reads it back, compares the bytes and deletes it.
5. Open any document on the site, then Cloudflare → **delete the old token**.

Do not skip step 5. A token you stopped using but did not delete is a key
somebody still has.

## 3. The session secret

Changing it invalidates every signed-in session: everyone is signed out and
signs in again. Nothing else is lost — accounts, runs, scores and certificates
are in the database, not the cookie.

```bash
openssl rand -hex 32
```

Vercel → `SESSION_SECRET` → paste → **Redeploy**.

If the value currently deployed is the one in `.env.example`, treat this as
urgent rather than housekeeping: that string is in the repository, and anyone
who has read it can mint a session cookie for any account.

## 4. The cron secret

```bash
openssl rand -hex 32
```

Vercel → `CRON_SECRET` → **Redeploy**. Vercel signs its own scheduled calls with
whatever the deployment holds, so there is nothing else to update. Check the
next day's run under **Deployments → Functions → /api/jobs/run**, or force one:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/jobs/run
```

## 5. What is left over

- **This conversation, and any chat where a connection string was pasted.**
  Once the steps above are done those strings are inert, which is the point of
  doing them.
- **Shell history**, if you ever exported the values in a terminal:
  `history -c` clears the current one; `~/.bash_history` holds the rest.
- **`.env.local` on any machine** that ran a seed against production. Delete it;
  the file is git-ignored, so nothing else points at it.
- **Old Neon branches.** A branch made from the project before the rotation
  carries the data as it was and its own connection string. Neon → **Branches** →
  delete what you are not using.

## 6. Afterwards

```bash
curl https://<your-domain>/api/health
BASE_URL=https://<your-domain> pnpm challenge:smoke
```

The smoke test signs up, opens a run, works it through the API, and checks the
score, the certificate, its public verification and the leaderboard. It touches
the database, the object store and the session cookie in one pass, which is
every secret above except the cron one.
