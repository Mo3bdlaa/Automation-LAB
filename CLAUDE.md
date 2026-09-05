@AGENTS.md

# Automation Lab — project notes

- Read `docs/handoff.md` (decisions and rationale) and `docs/spec.md` (design) before changing architecture.
- Every interactive element gets both `id` and `data-testid` per `docs/selectors.md`. Rule IDs in `src/lib/validation/rules.ts` are a public contract: never rename one.
- Never import `@/db/client` from pages, components or route handlers. Use `TenantDb` (`src/db/tenant.ts`); `src/db/scoping.test.ts` enforces this.
- Generation must stay deterministic: use `Rng` from `src/lib/generator/rng.ts`, never `Math.random`.
- PDFs are HTML/CSS rendered by Chromium in a background job. Do not add `@react-pdf/renderer`.
- Nothing in this repo touches mohammedshaker.com or the share-know.com VPS.
- Checks before pushing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
