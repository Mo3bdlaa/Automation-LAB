/**
 * Guardrail: pages, components and route handlers must never import the raw
 * database client. They go through TenantDb (src/db/tenant.ts) or the lib
 * modules that own tenant lifecycle. This test greps for violations.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ALLOWED = [
  "src/db/tenant.ts",
  "src/lib/corpus/",
  "src/lib/sandbox/",
  "src/lib/jobs/",
  "src/lib/auth/server.ts",
  "src/lib/documents/service.ts",
  // Infrastructure that owns its own scoping: tokens are per user, queues and
  // webhooks are written with an explicit tenant id from the session.
  "src/lib/api/tokens.ts",
  "src/lib/api/work-items.ts",
  "src/lib/webhooks/emit.ts",
  // The instructor views read across every student tenant on purpose. They are
  // gated on the staff role, which the test below asserts.
  "src/app/instructor/",
  "src/app/api/health/route.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const STAFF_GATED = ["src/app/instructor/page.tsx", "src/app/instructor/export.csv/route.ts"];

describe("tenant scoping", () => {
  it("only whitelisted modules import the raw db client", () => {
    const root = path.resolve(__dirname, "../..");
    const files = walk(path.join(root, "src"));
    const offenders = files
      .map((f) => path.relative(root, f).replace(/\\/g, "/"))
      .filter((rel) => !ALLOWED.some((a) => rel.startsWith(a)))
      .filter((rel) => /from\s+["'](@\/db\/client|\.{1,2}\/(?:\.\.\/)*db\/client|\.\/client)["']/.test(readFileSync(path.join(root, rel), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("every cross-tenant view checks for the staff role", () => {
    const root = path.resolve(__dirname, "../..");
    for (const rel of STAFF_GATED) {
      const src = readFileSync(path.join(root, rel), "utf8");
      expect(src, `${rel} must gate on isStaff`).toContain("isStaff(");
    }
  });
});
