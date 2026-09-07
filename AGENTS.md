<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Automation Lab — project notes

- Read `docs/handoff.md` (decisions and rationale) and `docs/spec.md` (design) before changing architecture.
- Every interactive element gets both `id` and `data-testid` per `docs/selectors.md`. Rule IDs in `src/lib/validation/rules.ts` and `src/lib/validation/matching.ts` are a public contract: never rename one.
- Never import `@/db/client` from pages, components or route handlers. Use `TenantDb` (`src/db/tenant.ts`); `src/db/scoping.test.ts` enforces this.
- Business logic lives in `src/lib/services/`. UI server actions and API routes are thin wrappers over it: never implement a rule in one path only.
- Every API route needs a path in `src/lib/api/openapi.ts`; `src/lib/api/openapi.test.ts` fails when the two drift.
- Nothing reachable from a page or route module may import `playwright-core` statically. The renderer and the job handlers load it dynamically; a static import breaks the standalone build.
- Generation must stay deterministic: use `Rng` from `src/lib/generator/rng.ts`, never `Math.random`.
- PDFs are HTML/CSS rendered by Chromium in a background job. Do not add `@react-pdf/renderer`.
- Degraded levels (2 to 5) are produced in the same Chromium with pdf.js, SVG filters and CSS transforms. Do not add `sharp` or another native image library, and keep every parameter seeded from `(document id, level)` so a level stays reproducible.
- Difficulty levels are a public contract like rule IDs: never renumber them or change what a level means.
- A template element that carries a graded value needs `data-gt-field="<ground truth path>"`; that is what the renderer measures to store field positions.
- Nothing in this repo touches mohammedshaker.com or the share-know.com VPS.
- The PDD is generated: edit `scripts/build-pdd.ts`, never `docs/pdd.md`. Its screenshots come from `pnpm pdd:figures` against a running dev server; `pnpm pdd` then rebuilds the Markdown, Word and PDF.
- Checks before pushing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. CI runs the same set plus the migrations.
