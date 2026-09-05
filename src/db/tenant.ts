/**
 * Tenant scoping, enforced at the query layer.
 *
 * A `TenantDb` is bound to one *writable* tenant (the student's own sandbox)
 * and a set of *readable* tenants (their sandbox plus the shared corpus).
 * Every read adds `tenant_id IN (readable)`; every write forces
 * `tenant_id = writable`. Rows in the shared corpus can therefore be seen
 * but never modified through this API. Callers cannot forget the guard
 * because they never see a raw query builder.
 */
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { db, type Db } from "./client";

export interface TenantContext {
  /** The tenant this context writes to. */
  tenantId: string;
  /** Tenants this context may read from. Always includes `tenantId`. */
  readableTenantIds: readonly string[];
  /** The shared corpus tenant id, for "is this row read-only?" checks. */
  sharedTenantId: string;
}

type TenantTable = PgTable & { tenantId: PgColumn };

export interface ListOptions {
  where?: SQL;
  orderBy?: { column: PgColumn; direction?: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
}

export class TenantDb {
  constructor(
    readonly ctx: TenantContext,
    private readonly conn: Db = db,
  ) {
    if (!ctx.readableTenantIds.includes(ctx.tenantId)) {
      throw new Error("TenantContext.readableTenantIds must include tenantId");
    }
  }

  get tenantId() {
    return this.ctx.tenantId;
  }

  /** Guard for reads: tenant_id IN (readable) AND extra. */
  readGuard<T extends TenantTable>(table: T, extra?: SQL): SQL {
    const guard = inArray(table.tenantId, [...this.ctx.readableTenantIds]);
    return extra ? and(guard, extra)! : guard;
  }

  /** Guard for writes: tenant_id = writable AND extra. */
  writeGuard<T extends TenantTable>(table: T, extra?: SQL): SQL {
    const guard = eq(table.tenantId, this.ctx.tenantId);
    return extra ? and(guard, extra)! : guard;
  }

  isReadOnlyRow(row: { tenantId: string }): boolean {
    return row.tenantId !== this.ctx.tenantId;
  }

  async list<T extends TenantTable>(table: T, opts: ListOptions = {}): Promise<T["$inferSelect"][]> {
    const order = (opts.orderBy ?? []).map((o) => (o.direction === "desc" ? desc(o.column) : asc(o.column)));
    let q = this.conn.select().from(table as PgTable).where(this.readGuard(table, opts.where)).$dynamic();
    if (order.length) q = q.orderBy(...order);
    if (opts.limit !== undefined) q = q.limit(opts.limit);
    if (opts.offset !== undefined) q = q.offset(opts.offset);
    return (await q) as T["$inferSelect"][];
  }

  async one<T extends TenantTable>(table: T, where: SQL): Promise<T["$inferSelect"] | null> {
    const rows = await this.list(table, { where, limit: 1 });
    return rows[0] ?? null;
  }

  async count<T extends TenantTable>(table: T, where?: SQL): Promise<number> {
    const [row] = await this.conn
      .select({ n: count() })
      .from(table as PgTable)
      .where(this.readGuard(table, where));
    return Number(row?.n ?? 0);
  }

  /** Insert into the writable tenant. Any tenantId on the values is overridden. */
  async insert<T extends TenantTable>(
    table: T,
    values: Omit<T["$inferInsert"], "tenantId"> | Omit<T["$inferInsert"], "tenantId">[],
  ): Promise<T["$inferSelect"][]> {
    const list = Array.isArray(values) ? values : [values];
    if (list.length === 0) return [];
    const stamped = list.map((v) => ({ ...(v as object), tenantId: this.ctx.tenantId }));
    return (await this.conn
      .insert(table as PgTable)
      .values(stamped as never)
      .returning()) as T["$inferSelect"][];
  }

  /** Update rows in the writable tenant only. Shared-corpus rows are untouchable. */
  async update<T extends TenantTable>(
    table: T,
    set: Partial<Omit<T["$inferInsert"], "tenantId" | "id">>,
    where: SQL,
  ): Promise<T["$inferSelect"][]> {
    return (await this.conn
      .update(table as PgTable)
      .set(set as never)
      .where(this.writeGuard(table, where))
      .returning()) as T["$inferSelect"][];
  }

  async delete<T extends TenantTable>(table: T, where: SQL): Promise<number> {
    const rows = await this.conn
      .delete(table as PgTable)
      .where(this.writeGuard(table, where))
      .returning();
    return rows.length;
  }

  /** Run a callback inside a transaction with the same scoping. */
  async transaction<R>(fn: (tx: TenantDb) => Promise<R>): Promise<R> {
    return this.conn.transaction(async (tx) => fn(new TenantDb(this.ctx, tx as unknown as Db)));
  }
}

export function forTenant(ctx: TenantContext, conn: Db = db): TenantDb {
  return new TenantDb(ctx, conn);
}
