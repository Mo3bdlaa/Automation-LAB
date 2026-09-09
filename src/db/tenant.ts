/**
 * Tenant scoping and master-set overlays, enforced at the query layer.
 *
 * A `TenantDb` is bound to one *writable* tenant (the participant's own rows)
 * and a set of *readable* tenants (their own plus the shared master set).
 * Every read adds `tenant_id IN (readable)`; every write forces
 * `tenant_id = writable`. Callers cannot forget the guard because they never
 * see a raw query builder.
 *
 * The master set is not copied per participant. Everyone reads the same
 * vendors, orders, deliveries and invoices, and a change to one of those rows
 * is stored as a patch in `entity_overlays` and merged back on read for that
 * participant alone. Two consequences worth knowing:
 *
 *   - Ids never change. The lines, documents and ground truth hanging off a
 *     master row keep resolving, because nothing was duplicated.
 *   - A filter has to run against the *resolved* row, not the master row.
 *     Otherwise an invoice you approved would still come back from a query for
 *     pending invoices. That is what `resolvedIds` is for: it builds a CTE that
 *     shadows the table name, so a `WHERE "invoices"."status" = …` written by
 *     the query builder filters on the merged value without the caller doing
 *     anything differently.
 */
import { and, asc, count, desc, eq, getTableColumns, getTableName, inArray, sql, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { db, schema, type Db } from "./client";

export interface TenantContext {
  /** The tenant this context writes to. */
  tenantId: string;
  /** Tenants this context may read from. Always includes `tenantId`. */
  readableTenantIds: readonly string[];
  /** The shared master tenant id, for "is this row mine or everyone's?" checks. */
  sharedTenantId: string;
}

type TenantTable = PgTable & { tenantId: PgColumn };

export interface ListOptions {
  where?: SQL;
  orderBy?: { column: PgColumn; direction?: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
}

/**
 * Tables a participant may change in place. A row of one of these in the shared
 * master set is theirs to edit; the edit is stored as a patch and seen only by
 * them. Everything else in the master set — documents, ground truth, seeded
 * defects — is genuinely read-only, because editing it would mean editing the
 * answer key.
 */
const OVERLAID_TABLES = new Set([
  "vendors",
  "items",
  "purchase_orders",
  "rfqs",
  "quotes",
  "delivery_notes",
  "invoices",
]);

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

  /** The overlay entity name for a table, or null when it cannot be changed. */
  private overlaid<T extends TenantTable>(table: T): string | null {
    const name = getTableName(table);
    return OVERLAID_TABLES.has(name) ? name : null;
  }

  /**
   * Can this participant change this row?
   *
   * A row of theirs always. A row of the master set only where the table is
   * overlaid — their change is then recorded as a patch nobody else sees.
   * Answering this needs the table, because "shared" and "read-only" stopped
   * meaning the same thing when the master set became everyone's to work on.
   */
  isReadOnlyRow<T extends TenantTable>(table: T, row: { tenantId: string }): boolean {
    if (row.tenantId === this.ctx.tenantId) return false;
    return this.overlaid(table) === null;
  }

  /**
   * Ids matching `opts`, resolved through this participant's overlay and in the
   * order asked for. The CTE deliberately shadows the table name so that a
   * `where`/`orderBy` built against the table's columns binds to the merged
   * row instead of the master row.
   */
  private async resolvedIds<T extends TenantTable>(table: T, entity: string, opts: ListOptions): Promise<string[]> {
    const name = sql.identifier(entity);
    const order = (opts.orderBy ?? []).map((o) => (o.direction === "desc" ? desc(o.column) : asc(o.column)));
    const parts = [
      sql`with ${name} as (select (jsonb_populate_record(null::${name}, to_jsonb(t) || coalesce(o.patch, '{}'::jsonb))).*
          from ${name} t
          left join ${schema.entityOverlays} o
            on o.entity = ${entity} and o.entity_id = t.id and o.tenant_id = ${this.ctx.tenantId})
        select id from ${name} where ${this.readGuard(table, opts.where)}`,
    ];
    if (order.length) parts.push(sql` order by ${sql.join(order, sql`, `)}`);
    if (opts.limit !== undefined) parts.push(sql` limit ${opts.limit}`);
    if (opts.offset !== undefined) parts.push(sql` offset ${opts.offset}`);
    const res = await this.conn.execute(sql.join(parts, sql``));
    return (res.rows as { id: string }[]).map((r) => r.id);
  }

  /** This participant's patches for a set of master rows. */
  private async patchesFor(entity: string, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
    if (!ids.length) return new Map();
    const rows = await this.conn
      .select({ entityId: schema.entityOverlays.entityId, patch: schema.entityOverlays.patch })
      .from(schema.entityOverlays)
      .where(
        and(
          eq(schema.entityOverlays.tenantId, this.ctx.tenantId),
          eq(schema.entityOverlays.entity, entity),
          inArray(schema.entityOverlays.entityId, ids),
        )!,
      );
    return new Map(rows.map((r) => [r.entityId, r.patch]));
  }

  /**
   * Merge a stored patch back onto a row. The patch went to the database as
   * JSON, so a timestamp came back as a string and has to become a Date again
   * for the row to look exactly like one the query builder returned.
   */
  private applyPatch<T extends TenantTable>(table: T, row: Record<string, unknown>, patch: Record<string, unknown>) {
    const columns = getTableColumns(table) as Record<string, PgColumn>;
    const merged = { ...row };
    for (const [key, value] of Object.entries(patch)) {
      const column = Object.entries(columns).find(([, c]) => c.name === key || c.name === key.toLowerCase());
      if (!column) continue;
      const [jsKey, col] = column;
      merged[jsKey] = value !== null && col.dataType === "date" ? new Date(value as string) : value;
    }
    return merged;
  }

  async list<T extends TenantTable>(table: T, opts: ListOptions = {}): Promise<T["$inferSelect"][]> {
    const entity = this.overlaid(table);
    if (!entity) {
      const order = (opts.orderBy ?? []).map((o) => (o.direction === "desc" ? desc(o.column) : asc(o.column)));
      let q = this.conn.select().from(table as PgTable).where(this.readGuard(table, opts.where)).$dynamic();
      if (order.length) q = q.orderBy(...order);
      if (opts.limit !== undefined) q = q.limit(opts.limit);
      if (opts.offset !== undefined) q = q.offset(opts.offset);
      return (await q) as T["$inferSelect"][];
    }

    const ids = await this.resolvedIds(table, entity, opts);
    if (!ids.length) return [];
    const idColumn = (getTableColumns(table) as Record<string, PgColumn>).id;
    const rows = (await this.conn.select().from(table as PgTable).where(inArray(idColumn, ids))) as Record<string, unknown>[];
    const patches = await this.patchesFor(entity, ids);
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    // resolvedIds already applied the ordering; keep it.
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is Record<string, unknown> => Boolean(r))
      .map((r) => this.applyPatch(table, r, patches.get(r.id as string) ?? {})) as T["$inferSelect"][];
  }

  async one<T extends TenantTable>(table: T, where: SQL): Promise<T["$inferSelect"] | null> {
    const rows = await this.list(table, { where, limit: 1 });
    return rows[0] ?? null;
  }

  async count<T extends TenantTable>(table: T, where?: SQL): Promise<number> {
    const entity = this.overlaid(table);
    if (entity) return (await this.resolvedIds(table, entity, { where })).length;
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

  /**
   * Update rows this participant may change.
   *
   * Their own rows are updated in place. A row of the master set is left alone
   * and the change is recorded as a patch, so the same call works whichever it
   * is and the caller never has to know which it was.
   */
  async update<T extends TenantTable>(
    table: T,
    set: Partial<Omit<T["$inferInsert"], "tenantId" | "id">>,
    where: SQL,
  ): Promise<T["$inferSelect"][]> {
    const entity = this.overlaid(table);
    if (!entity) {
      return (await this.conn
        .update(table as PgTable)
        .set(set as never)
        .where(this.writeGuard(table, where))
        .returning()) as T["$inferSelect"][];
    }

    const matches = (await this.list(table, { where })) as Record<string, unknown>[];
    const mine = matches.filter((r) => r.tenantId === this.ctx.tenantId);
    const master = matches.filter((r) => r.tenantId !== this.ctx.tenantId);
    const idColumn = (getTableColumns(table) as Record<string, PgColumn>).id;
    const out: Record<string, unknown>[] = [];

    if (mine.length) {
      const updated = (await this.conn
        .update(table as PgTable)
        .set(set as never)
        .where(this.writeGuard(table, inArray(idColumn, mine.map((r) => r.id as string))))
        .returning()) as Record<string, unknown>[];
      out.push(...updated);
    }

    if (master.length) {
      const patch = this.toPatch(table, set as Record<string, unknown>);
      for (const row of master) {
        await this.conn
          .insert(schema.entityOverlays)
          .values({ tenantId: this.ctx.tenantId, entity, entityId: row.id as string, patch })
          .onConflictDoUpdate({
            target: [schema.entityOverlays.tenantId, schema.entityOverlays.entity, schema.entityOverlays.entityId],
            set: { patch: sql`${schema.entityOverlays.patch} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() },
          });
        out.push(this.applyPatch(table, row, patch));
      }
    }
    return out as T["$inferSelect"][];
  }

  /** A `set` keyed by SQL column name, which is what the stored patch must be. */
  private toPatch<T extends TenantTable>(table: T, set: Record<string, unknown>): Record<string, unknown> {
    const columns = getTableColumns(table) as Record<string, PgColumn>;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(set)) {
      const column = columns[key];
      if (!column) continue;
      patch[column.name] = value instanceof Date ? value.toISOString() : value;
    }
    return patch;
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
