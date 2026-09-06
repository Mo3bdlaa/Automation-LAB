/**
 * Orchestrator-like work queues.
 *
 * Items are materialised from the current domain state whenever a dispatcher
 * reads a queue, keyed by (tenant, queue, reference). Re-running a dispatcher
 * therefore never creates duplicates, and an item a performer already completed
 * stays completed even though its source row still matches the query.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { LabSession } from "@/lib/auth/server";
import type { WorkItem, WorkItemQueue } from "@/db/schema";
import { deliveryNotes, documents, invoices, purchaseOrders, rfqs, vendors, workItems } from "@/db/schema";

export const QUEUE_DESCRIPTIONS: Record<WorkItemQueue, string> = {
  "invoices-pending": "Invoices registered in the AP inbox and awaiting extraction.",
  "pos-awaiting-invoice": "Purchase orders with goods received and no invoice matched yet.",
  "vendor-applications": "Vendor records pending approval, with their compliance documents.",
  "deliveries-awaiting-grn": "Delivery notes marked delivered with no goods receipt posted.",
  "rfqs-open": "Requests for quotation with quotations received and no award yet.",
};

export interface QueueSource {
  reference: string;
  specificContent: Record<string, unknown>;
  priority?: "low" | "normal" | "high";
}

/** Reads the current domain state for one queue. */
export async function queueSources(session: LabSession, queue: WorkItemQueue): Promise<QueueSource[]> {
  const tdb = session.tdb;
  switch (queue) {
    case "invoices-pending": {
      const rows = await tdb.list(invoices, { where: eq(invoices.status, "pending_extraction"), orderBy: [{ column: invoices.receivedDate }] });
      const docs = rows.length ? await tdb.list(documents, { where: and(eq(documents.kind, "invoice"), inArray(documents.sourceId, rows.map((r) => r.id)))! }) : [];
      return rows.map((r) => {
        const doc = docs.find((d) => d.sourceId === r.id);
        return {
          reference: r.internalNumber,
          specificContent: { invoiceId: r.id, internalNumber: r.internalNumber, receivedDate: r.receivedDate, documentId: doc?.id ?? null, downloadUrl: doc ? `/api/documents/${doc.id}/file` : null, uiUrl: `/invoices/${r.internalNumber}` },
        };
      });
    }
    case "pos-awaiting-invoice": {
      const pos = await tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.historical, false), inArray(purchaseOrders.status, ["received", "partially_received"]))!, orderBy: [{ column: purchaseOrders.orderDate }] });
      const invoiced = pos.length ? await tdb.list(invoices, { where: inArray(invoices.purchaseOrderId, pos.map((p) => p.id)) }) : [];
      const vendorRows = pos.length ? await tdb.list(vendors, { where: inArray(vendors.id, [...new Set(pos.map((p) => p.vendorId))]) }) : [];
      return pos
        .filter((p) => !invoiced.some((i) => i.purchaseOrderId === p.id))
        .map((p) => ({
          reference: p.number,
          specificContent: { purchaseOrderId: p.id, number: p.number, vendorCode: vendorRows.find((v) => v.id === p.vendorId)?.code ?? null, orderDate: p.orderDate, grandTotal: p.grandTotal, currency: p.currency, uiUrl: `/purchase-orders/${p.number}` },
        }));
    }
    case "vendor-applications": {
      const rows = await tdb.list(vendors, { where: eq(vendors.status, "pending"), orderBy: [{ column: vendors.code }] });
      const docs = rows.length ? await tdb.list(documents, { where: and(inArray(documents.vendorId, rows.map((r) => r.id)), sql`${documents.kind} like 'vendor_%'`)! }) : [];
      return rows.map((v) => ({
        reference: v.code,
        specificContent: {
          vendorId: v.id, code: v.code, name: v.name, uiUrl: `/vendors/${v.code}`,
          documents: Object.fromEntries(docs.filter((d) => d.vendorId === v.id).map((d) => [d.kind, { documentId: d.id, downloadUrl: `/api/documents/${d.id}/file` }])),
        },
      }));
    }
    case "deliveries-awaiting-grn": {
      const rows = await tdb.list(deliveryNotes, { where: eq(deliveryNotes.status, "delivered"), orderBy: [{ column: deliveryNotes.deliveryDate }] });
      return rows.map((d) => ({ reference: d.number, specificContent: { deliveryNoteId: d.id, number: d.number, purchaseOrderId: d.purchaseOrderId, deliveryDate: d.deliveryDate, uiUrl: `/deliveries/${d.id}` } }));
    }
    case "rfqs-open": {
      const rows = await tdb.list(rfqs, { where: inArray(rfqs.status, ["open", "quoted"]), orderBy: [{ column: rfqs.dueDate }] });
      return rows.map((r) => ({ reference: r.number, specificContent: { rfqId: r.id, number: r.number, dueDate: r.dueDate, uiUrl: `/rfqs/${r.number}` } }));
    }
  }
}

/**
 * Upserts the queue from the domain state and retires anything that no longer
 * belongs in it.
 *
 * Items a performer already took keep their status, so re-running a dispatcher
 * never duplicates or resurrects work. Items that are still `new` but whose
 * source condition has gone (someone posted the goods receipt by hand, say) are
 * abandoned rather than handed out, which is what an Orchestrator dispatcher
 * would do on its next pass.
 */
export async function refreshQueue(session: LabSession, queue: WorkItemQueue): Promise<{ current: number; abandoned: number }> {
  const sources = await queueSources(session, queue);
  if (sources.length > 0) {
    await db
      .insert(workItems)
      .values(sources.map((s) => ({ tenantId: session.tenant.id, queue, reference: s.reference, specificContent: s.specificContent, priority: s.priority ?? ("normal" as const) })))
      .onConflictDoUpdate({
        target: [workItems.tenantId, workItems.queue, workItems.reference],
        // Refresh the payload only; status, attempts and outcome belong to the performer.
        set: { specificContent: sql`excluded.specific_content`, updatedAt: new Date() },
      });
  }
  const references = sources.map((s) => s.reference);
  const stale = await db
    .update(workItems)
    .set({ status: "abandoned", completedAt: new Date(), updatedAt: new Date(), lastError: "No longer in the queue: the underlying record changed." })
    .where(
      and(
        eq(workItems.tenantId, session.tenant.id),
        eq(workItems.queue, queue),
        eq(workItems.status, "new"),
        references.length ? notInArray(workItems.reference, references) : undefined,
      ),
    )
    .returning({ id: workItems.id });
  return { current: sources.length, abandoned: stale.length };
}

export async function listWorkItems(session: LabSession, queue: WorkItemQueue, opts: { status?: WorkItem["status"]; limit: number; offset: number }) {
  const where = and(eq(workItems.queue, queue), opts.status ? eq(workItems.status, opts.status) : undefined);
  const total = await session.tdb.count(workItems, where);
  const items = await session.tdb.list(workItems, { where, orderBy: [{ column: workItems.priority, direction: "desc" }, { column: workItems.createdAt }], limit: opts.limit, offset: opts.offset });
  return { items, total };
}

export const DEFAULT_LEASE_SECONDS = 900;

/**
 * Atomically claims the next runnable item, the way a performer takes a
 * transaction from an Orchestrator queue. A lease expires so that a robot that
 * dies does not block the queue.
 */
export async function claimNext(session: LabSession, queue: WorkItemQueue, owner: string, leaseSeconds = DEFAULT_LEASE_SECONDS): Promise<WorkItem | null> {
  const res = await db.execute(sql`
    UPDATE work_items SET status = 'in_progress', attempts = attempts + 1, lease_until = now() + ${`${leaseSeconds} seconds`}::interval, lease_owner = ${owner}, updated_at = now()
    WHERE id = (
      SELECT id FROM work_items
      WHERE tenant_id = ${session.tenant.id} AND queue = ${queue}
        AND (status = 'new' OR (status = 'in_progress' AND lease_until < now()))
        AND (defer_until IS NULL OR defer_until <= now())
      ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`);
  const rows = (res as unknown as { rows?: Record<string, unknown>[] }).rows ?? (res as unknown as Record<string, unknown>[]);
  return rows[0] ? rowToWorkItem(rows[0]) : null;
}

function rowToWorkItem(row: Record<string, unknown>): WorkItem {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    queue: row.queue as WorkItemQueue,
    reference: row.reference as string,
    specificContent: row.specific_content as Record<string, unknown>,
    status: row.status as WorkItem["status"],
    priority: row.priority as WorkItem["priority"],
    attempts: row.attempts as number,
    leaseUntil: row.lease_until ? new Date(row.lease_until as string) : null,
    leaseOwner: (row.lease_owner as string) ?? null,
    deferUntil: row.defer_until ? new Date(row.defer_until as string) : null,
    lastError: (row.last_error as string) ?? null,
    outcome: (row.outcome as Record<string, unknown>) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
  };
}

export function serialiseWorkItem(w: WorkItem) {
  return {
    id: w.id,
    queue: w.queue,
    reference: w.reference,
    status: w.status,
    priority: w.priority,
    attempts: w.attempts,
    specificContent: w.specificContent,
    leaseUntil: w.leaseUntil?.toISOString() ?? null,
    deferUntil: w.deferUntil?.toISOString() ?? null,
    lastError: w.lastError,
    outcome: w.outcome,
    createdAt: w.createdAt.toISOString(),
    completedAt: w.completedAt?.toISOString() ?? null,
  };
}
