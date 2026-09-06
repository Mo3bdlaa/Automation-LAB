/**
 * Guardrail: every API route must be described in the OpenAPI document, and
 * every documented path must exist as a route. Without this the published
 * contract drifts away from the code.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { openApiDocument } from "./openapi";

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

/** `src/app/api/invoices/[internalNumber]/match/route.ts` -> `/api/invoices/{internalNumber}/match`. */
function urlFor(root: string, file: string): string {
  return `/${path.relative(root, path.dirname(file)).split(path.sep).map((seg) => (seg.startsWith("[") ? `{${seg.slice(1, -1)}}` : seg)).join("/")}`;
}

describe("OpenAPI document", () => {
  const root = path.resolve(__dirname, "../../app");
  const apiDir = path.join(root, "api");
  const doc = openApiDocument("http://localhost:3000");
  const documented = new Set(Object.keys(doc.paths));
  const implemented = routeFiles(apiDir).map((f) => urlFor(root, f));

  it("documents every implemented route", () => {
    expect(implemented.filter((u) => !documented.has(u))).toEqual([]);
  });

  it("implements every documented path", () => {
    const impl = new Set(implemented);
    expect([...documented].filter((u) => !impl.has(u))).toEqual([]);
  });

  it("is a valid-looking OpenAPI 3.1 document", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBeTruthy();
    expect(Object.keys(doc.components.schemas).length).toBeGreaterThan(5);
    for (const [url, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops as Record<string, { summary?: string; responses?: object }>)) {
        expect(op.summary, `${method.toUpperCase()} ${url} needs a summary`).toBeTruthy();
        expect(Object.keys(op.responses ?? {}).length, `${method.toUpperCase()} ${url} needs responses`).toBeGreaterThan(0);
      }
    }
  });
});
