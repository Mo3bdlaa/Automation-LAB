/**
 * Shared helpers for the REST API: consistent JSON shapes, opaque cursors and
 * error responses. Errors always carry a machine-readable `error` code so a bot
 * can branch on it, mirroring how validation findings carry rule IDs.
 */
import { createHash } from "node:crypto";
import { ZodError, type ZodType } from "zod";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function ok<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...(init.headers ?? {}) } });
}

export function created<T>(data: T, location?: string): Response {
  return Response.json(data, { status: 201, headers: { ...NO_STORE, ...(location ? { Location: location } : {}) } });
}

export interface ApiErrorBody {
  error: string;
  message: string;
  [key: string]: unknown;
}

export function problem(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, message, ...extra } satisfies ApiErrorBody, { status, headers: NO_STORE });
}

export const notFound = (what: string) => problem(404, "not_found", `${what} not found.`);
export const conflict = (message: string, extra: Record<string, unknown> = {}) => problem(409, "conflict", message, extra);
export const badRequest = (message: string, extra: Record<string, unknown> = {}) => problem(400, "bad_request", message, extra);

/** Parses and validates a JSON body, or returns a 400 describing the problem. */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: badRequest("Request body must be valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: badRequest("Request body failed validation.", { issues: fieldIssues(parsed.error) }) };
  }
  return { data: parsed.data };
}

export function fieldIssues(e: ZodError): { path: string; message: string }[] {
  return e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

// --- pagination -------------------------------------------------------------

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** Opaque cursor. It currently encodes an offset; treat it as a token, not a number. */
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

export function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const { o } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o: number };
    return Number.isInteger(o) && o >= 0 ? o : 0;
  } catch {
    return 0;
  }
}

export interface PageParams {
  limit: number;
  offset: number;
  cursor: string | null;
}

export function pageParams(url: URL): PageParams {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
  const cursor = url.searchParams.get("cursor");
  return { limit, offset: decodeCursor(cursor), cursor };
}

export function page<T>(items: T[], params: PageParams, total: number) {
  const next = params.offset + items.length;
  return { items, page: { limit: params.limit, total, nextCursor: next < total ? encodeCursor(next) : null } };
}

// --- caching ----------------------------------------------------------------

export function etagFor(value: unknown): string {
  return `W/"${createHash("sha1").update(JSON.stringify(value)).digest("base64url")}"`;
}

/** Returns a 304 when the client's If-None-Match matches, otherwise null. */
export function notModified(req: Request, etag: string): Response | null {
  const inm = req.headers.get("if-none-match");
  return inm && inm.split(/,\s*/).includes(etag) ? new Response(null, { status: 304, headers: { ETag: etag, ...NO_STORE } }) : null;
}
