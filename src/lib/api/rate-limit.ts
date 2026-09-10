/**
 * Rate limiting, aimed at abuse rather than at usage.
 *
 * The lab exists to be hammered by robots: a performer working a queue of
 * twelve invoices makes several hundred calls in a few minutes, and a
 * dispatcher polling for work makes more. A limit that treats that as suspect
 * would break the thing the site is for. So the policies split by what is
 * actually at risk:
 *
 *   - Credentials are guessable, so signing in and signing up are tight, and
 *     counted per address. This is the part that stops an attack.
 *   - Doing the exercise is not an attack, so an authenticated participant gets
 *     a ceiling high enough that only a runaway loop reaches it — and a runaway
 *     loop is exactly what should be stopped, for their sake as much as ours.
 *   - Anonymous traffic sits in between: enough to read the landing page,
 *     browse the leaderboard and check a certificate, not enough to enumerate
 *     certificate codes.
 *
 * Counters live in Postgres because this runs on serverless functions, where
 * consecutive requests land in different instances and an in-memory counter
 * protects nothing.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export interface Policy {
  /** Requests allowed inside one window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const POLICIES = {
  /**
   * Password guessing. Ten tries a quarter of an hour is plenty for someone who
   * genuinely mistypes and useless for someone working through a word list.
   */
  login: { limit: 10, windowSeconds: 900 },
  /** Account spam. A person creates one account, maybe two. */
  register: { limit: 5, windowSeconds: 3600 },
  /** Issuing a robot password: cheap for us, but it is a credential. */
  credential: { limit: 20, windowSeconds: 3600 },
  /**
   * A participant doing the exercise, counted per account rather than per
   * address so a classroom behind one NAT does not throttle itself. 600 a
   * minute is roughly ten calls a second sustained: far above working a queue
   * properly, far below a loop with no delay in it.
   */
  api: { limit: 600, windowSeconds: 60 },
  /** Anonymous browsing, per address. */
  anon: { limit: 120, windowSeconds: 60 },
  /** Certificate checks, per address: enough to verify, not to enumerate. */
  verify: { limit: 60, windowSeconds: 600 },
  /** Regenerating a sandbox is minutes of nothing for the person doing it. */
  reset: { limit: 10, windowSeconds: 3600 },
} as const satisfies Record<string, Policy>;

export type PolicyName = keyof typeof POLICIES;

export interface Decision {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window rolls over. Only meaningful when `ok` is false. */
  retryAfter: number;
}

/**
 * The client's address, as far as it can be known behind a proxy.
 *
 * Vercel sets x-forwarded-for; the leftmost entry is the client and the rest
 * are proxies. It is spoofable in general, which is why nothing that matters
 * for correctness depends on it — it only decides whose bucket an anonymous
 * request lands in.
 */
export function clientAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Count one request against a bucket and say whether it may proceed.
 *
 * A single statement so that two requests arriving together cannot both read
 * the old count: the upsert either starts a new window or increments the
 * current one, and returns what it settled on.
 */
export async function consume(policyName: PolicyName, subject: string): Promise<Decision> {
  const policy = POLICIES[policyName];
  const bucket = `${policyName}:${subject}`;
  const windowSeconds = policy.windowSeconds;

  const result = await db.execute(sql`
    insert into rate_limits (bucket, count, window_start)
    values (${bucket}, 1, now())
    on conflict (bucket) do update set
      count = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now()
        else rate_limits.window_start
      end
    returning count, extract(epoch from (window_start + make_interval(secs => ${windowSeconds}) - now()))::int as reset_in
  `);

  const row = result.rows[0] as { count: number; reset_in: number } | undefined;
  const count = Number(row?.count ?? 1);
  const retryAfter = Math.max(1, Number(row?.reset_in ?? windowSeconds));
  return {
    ok: count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - count),
    retryAfter,
  };
}

/** Headers describing the caller's standing, so a well-behaved bot can pace itself. */
export function rateLimitHeaders(d: Decision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(d.limit),
    "X-RateLimit-Remaining": String(d.remaining),
    ...(d.ok ? {} : { "Retry-After": String(d.retryAfter) }),
  };
}

/** The 429 to answer with, carrying enough for a caller to back off correctly. */
export function tooManyRequests(d: Decision): Response {
  return Response.json(
    {
      error: "rate_limited",
      message: `Too many requests. Try again in ${d.retryAfter} second${d.retryAfter === 1 ? "" : "s"}.`,
      retryAfter: d.retryAfter,
    },
    { status: 429, headers: { ...rateLimitHeaders(d), "Cache-Control": "no-store" } },
  );
}

/**
 * Rate limit an API request: per account when we know who it is, per address
 * when we do not.
 *
 * Returns a 429 to hand straight back, or null to carry on.
 */
export async function limitApiRequest(req: Request, userId: string | null): Promise<Response | null> {
  const decision = userId ? await consume("api", userId) : await consume("anon", clientAddress(req));
  return decision.ok ? null : tooManyRequests(decision);
}

/**
 * Old windows are dead weight once they have rolled over. Called from the job
 * runner rather than on the request path, where it would cost every caller to
 * benefit none of them.
 */
export async function pruneRateLimits(): Promise<number> {
  const result = await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  return result.rowCount ?? 0;
}
