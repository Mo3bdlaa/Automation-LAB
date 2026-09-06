/** Shared list-endpoint plumbing: paging, counting, ETag and serialisation. */
import type { SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { LabSession } from "@/lib/auth/server";
import { etagFor, notModified, ok, page, pageParams } from "./http";

type TenantTable = PgTable & { tenantId: PgColumn };

export async function listRoute<T extends TenantTable>(
  req: Request,
  session: LabSession,
  table: T,
  opts: { where?: SQL; orderBy: { column: PgColumn; direction?: "asc" | "desc" }[]; serialise: (row: T["$inferSelect"]) => unknown | Promise<unknown> },
): Promise<Response> {
  const params = pageParams(new URL(req.url));
  const total = await session.tdb.count(table, opts.where);
  const rows = await session.tdb.list(table, { where: opts.where, orderBy: opts.orderBy, limit: params.limit, offset: params.offset });
  const items = await Promise.all(rows.map((r) => opts.serialise(r)));
  const body = page(items, params, total);
  const etag = etagFor(body);
  return notModified(req, etag) ?? ok(body, { headers: { ETag: etag } });
}

/** Applies `?field=value` filters that are limited to a known set of values. */
export function enumParam<T extends string>(url: URL, name: string, allowed: readonly T[]): T | undefined {
  const v = url.searchParams.get(name);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}
