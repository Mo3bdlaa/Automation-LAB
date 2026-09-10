<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Automation Lab — project notes

- Read `docs/handoff.md` (decisions and rationale) and `docs/spec.md` (design) before changing architecture.
- Every interactive element gets both `id` and `data-testid` per `docs/selectors.md`. Rule IDs in `src/lib/validation/rules.ts` and `src/lib/validation/matching.ts` are a public contract: never rename one.
- Never import `@/db/client` from pages, components or route handlers. Use `TenantDb` (`src/db/tenant.ts`); `src/db/scoping.test.ts` enforces this.
- The transaction set is shared by everyone and never copied per participant. A change to a master row is a patch in `entity_overlays`, merged on read by `TenantDb`. Two consequences: never write code that copies master rows into a participant's tenant, and never bypass `TenantDb` for a read of an overlaid table — a raw query returns the master value and will show an invoice you approved as still pending.
- `personUserId(principal)` is what identity means wherever the question is "whose is this?" rather than "who signed in?" — runs, scores, certificates, tenant lookup. A robot credential shares its owner's sandbox and must never be treated as a separate participant.
- Rendering happens at seed time, never at request time in production. Nothing on the request path may start Chromium: `pnpm db:seed --levels` produces every difficulty level up front so the deployed app needs no browser.
- Business logic lives in `src/lib/services/`. UI server actions and API routes are thin wrappers over it: never implement a rule in one path only.
- Every API route needs a path in `src/lib/api/openapi.ts`; `src/lib/api/openapi.test.ts` fails when the two drift.
- Nothing reachable from a page or route module may import `playwright-core` statically. The renderer and the job handlers load it dynamically; a static import breaks the standalone build.
- Generation must stay deterministic: use `Rng` from `src/lib/generator/rng.ts`, never `Math.random`.
- PDFs are HTML/CSS rendered by Chromium in a background job. Do not add `@react-pdf/renderer`.
- Degraded levels (2 to 5) are produced in the same Chromium with pdf.js, SVG filters and CSS transforms. Do not add `sharp` or another native image library, and keep every parameter seeded from `(document id, level)` so a level stays reproducible.
- Difficulty levels are a public contract like rule IDs: never renumber them or change what a level means.
- So are the challenge scenarios in `src/lib/challenge/scenarios.ts`. Slugs appear in URLs, in the API and on issued certificates; weights and pass marks are printed in each scenario's PDD and stand behind every leaderboard entry. Never rename a slug or silently change a weight — bump `version` and leave the old meaning intact.
- A scored run must not leak its grade. Anything that reports how well a submission did is gated by `inScoredRun` (`src/lib/challenge/runs.ts`); the business result still comes back, the score does not. Adding a new endpoint that returns a grade means adding that gate.
- The challenge walkthrough is a side panel: it must never overlay the page or intercept pointer events, because a bot driving the screens has to behave identically whether it is open or closed.
- A template element that carries a graded value needs `data-gt-field="<ground truth path>"`; that is what the renderer measures to store field positions.
- Nothing in this repo touches mohammedshaker.com or the share-know.com VPS.
- The PDD is generated: edit `scripts/build-pdd.ts`, never `docs/pdd.md`. Its screenshots come from `pnpm pdd:figures` against a running dev server; `pnpm pdd` then rebuilds the Markdown, Word and PDF.
- Checks before pushing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. CI runs the same set plus the migrations.
