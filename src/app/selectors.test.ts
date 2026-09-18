/**
 * The selectors the lab publishes are a contract, and this is what holds us to it.
 *
 * Every id below is printed in the process documents participants write their
 * bots against, quoted in the scenario catalogue as a step's handle, or listed
 * in docs/selectors.md. A redesign that drops one breaks every bot written
 * against it — silently, because nothing else in the suite renders a page.
 *
 * That is not hypothetical: the dashboard was rewritten from tiles to a ranked
 * queue and took `#sandbox-status` and four `tile-*` ids with it. Five scripts
 * broke and the build stayed green.
 *
 * This is a grep, not a render, so it cannot prove the element reaches the
 * page. It does prove nobody deleted or renamed one without meaning to, which
 * is the failure that actually happened.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Every .ts/.tsx under src, concatenated — a handle may be rendered anywhere. */
function everySource(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(read(rel));
    }
  };
  walk("src");
  return out.join("\n");
}

/** Published selector → the file that must carry it. */
const PUBLISHED: Record<string, string> = {
  // A bot waits on this before it starts. api-smoke, e2e-smoke,
  // challenge-smoke, bot-credential-smoke and capture-pdd-figures all use it.
  "sandbox-status": "src/app/page.tsx",
  "sandbox-status-message": "src/app/page.tsx",
  "sandbox-seed": "src/app/page.tsx",
  // The queues, named in docs/selectors.md as `tile-{queue}` with data-count,
  // and quoted in src/lib/challenge/scenarios.ts as the handle for a step.
  "tile-invoices-pending": "src/app/page.tsx",
  "tile-invoices-exception": "src/app/page.tsx",
  "tile-invoices-approved": "src/app/page.tsx",
  "tile-pos-awaiting-invoice": "src/app/page.tsx",
  "tile-deliveries-pending": "src/app/page.tsx",
  "tile-vendors-pending": "src/app/page.tsx",
  "tile-rfqs-open": "src/app/page.tsx",
  // The shell. A bot that signs itself in needs the form and the way out.
  "nav-home": "src/components/shell/public-header.tsx",
  "nav-user": "src/components/shell/topbar.tsx",
  "nav-logout": "src/components/shell/topbar.tsx",
  "nav-main": "src/components/shell/sidebar.tsx",
  "nav-invoices": "src/components/shell/nav-model.ts",
  "nav-vendors": "src/components/shell/nav-model.ts",
  "active-run": "src/app/challenges/run-banner.tsx",
};

describe("published selectors", () => {
  for (const [id, file] of Object.entries(PUBLISHED)) {
    it(`${id} is still rendered by ${file}`, () => {
      expect(read(file)).toContain(id);
    });
  }

  it("every DOM handle the scenario catalogue promises is rendered somewhere", () => {
    // The catalogue quotes selectors at participants as the handle for a step
    // ("#grn-submit"). If a step names one the app no longer renders, the
    // instructions are wrong and the run cannot be completed as written.
    const handles = [...read("src/lib/challenge/scenarios.ts").matchAll(/"#([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(handles.length).toBeGreaterThan(0);
    expect(handles.filter((h) => !everySource().includes(h))).toEqual([]);
  });
});
