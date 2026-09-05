<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Automation Lab — project notes

- Read `docs/handoff.md` (decisions and rationale) and `docs/spec.md` (design) before changing architecture.
- Every interactive element gets both `id` and `data-testid` per `docs/selectors.md`. Rule IDs in `src/lib/validation/rules.ts` and `src/lib/validation/matching.ts` are a public contract: never rename one.
- Never import `@/db/client` from pages, components or route handlers. Use `TenantDb` (`src/db/tenant.ts`); `src/db/scoping.test.ts` enforces this.
- Generation must stay deterministic: use `Rng` from `src/lib/generator/rng.ts`, never `Math.random`.
- PDFs are HTML/CSS rendered by Chromium in a background job. Do not add `@react-pdf/renderer`.
- Nothing in this repo touches mohammedshaker.com or the share-know.com VPS.
- Checks before pushing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
