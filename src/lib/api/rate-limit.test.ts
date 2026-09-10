/**
 * Rate limiting has to hold two things at once: stop someone working through a
 * password list, and stay out of the way of a robot doing the exercise. Those
 * pull in opposite directions, so both are asserted here — a limit nobody can
 * reach protects nothing, and a limit a working bot reaches breaks the site.
 *
 * Skipped when no database is reachable; the counters live in Postgres because
 * this runs on serverless functions where an in-memory counter protects nothing.
 */
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { clientAddress, consume, POLICIES, rateLimitHeaders, tooManyRequests } from "./rate-limit";

const reachable = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

describe("rate limit policies", () => {
  it("is tight where credentials are guessed and generous where work happens", () => {
    // Signing in is the attack surface; a wordlist run should die immediately.
    expect(POLICIES.login.limit).toBeLessThanOrEqual(10);
    expect(POLICIES.register.limit).toBeLessThanOrEqual(5);

    // A performer working a 12-invoice queue makes several hundred calls in a
    // few minutes. The ceiling has to sit well above that or the lab breaks at
    // exactly the thing it exists for.
    const callsPerItem = 8;
    const itemsInTheBiggestScenario = 12;
    const worstCaseBurst = callsPerItem * itemsInTheBiggestScenario;
    expect(POLICIES.api.limit).toBeGreaterThan(worstCaseBurst * 3);

    // ...and still low enough that a loop with no delay is caught.
    expect(POLICIES.api.limit / POLICIES.api.windowSeconds).toBeLessThan(20);
  });

  it("reads the client address from the proxy header, leftmost first", () => {
    const req = (h: Record<string, string>) => new Request("https://lab.invalid", { headers: h });
    expect(clientAddress(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.9");
    expect(clientAddress(req({ "x-real-ip": "203.0.113.10" }))).toBe("203.0.113.10");
    expect(clientAddress(req({}))).toBe("unknown");
  });

  it("tells a caller how long to wait, in the body and the header", () => {
    const res = tooManyRequests({ ok: false, limit: 10, remaining: 0, retryAfter: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(rateLimitHeaders({ ok: true, limit: 10, remaining: 3, retryAfter: 0 })["Retry-After"]).toBeUndefined();
  });
});

const suite = reachable ? describe : describe.skip;

suite("rate limit counters", () => {
  const subjects: string[] = [];
  const subject = (name: string) => {
    const s = `test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    subjects.push(s);
    return s;
  };

  afterAll(async () => {
    for (const s of subjects) await db.execute(sql`delete from rate_limits where bucket like ${"%" + s}`);
    await pool.end();
  });

  it("allows up to the limit and refuses after it", async () => {
    const who = subject("login");
    const seen: boolean[] = [];
    for (let i = 0; i < POLICIES.login.limit + 2; i++) seen.push((await consume("login", who)).ok);
    expect(seen.slice(0, POLICIES.login.limit).every(Boolean)).toBe(true);
    expect(seen.slice(POLICIES.login.limit)).toEqual([false, false]);
  });

  it("counts each subject separately, so one attacker cannot lock out everyone", async () => {
    const attacker = subject("attacker");
    const bystander = subject("bystander");
    for (let i = 0; i < POLICIES.login.limit + 1; i++) await consume("login", attacker);
    expect((await consume("login", attacker)).ok).toBe(false);
    expect((await consume("login", bystander)).ok).toBe(true);
  });

  it("reports what is left and when the window rolls over", async () => {
    const who = subject("headroom");
    const first = await consume("api", who);
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(POLICIES.api.limit - 1);
    expect(first.retryAfter).toBeGreaterThan(0);
    expect(first.retryAfter).toBeLessThanOrEqual(POLICIES.api.windowSeconds);
  });

  it("does not throttle a robot working a queue at a realistic pace", async () => {
    // Eight calls an item across twelve items, the largest scenario, in one
    // window. This must pass, or the limit is set wrong.
    const who = subject("performer");
    let refused = 0;
    for (let i = 0; i < 8 * 12; i++) if (!(await consume("api", who)).ok) refused++;
    expect(refused).toBe(0);
  });
});
