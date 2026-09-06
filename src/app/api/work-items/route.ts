import { apiSession } from "@/lib/auth/server";
import { badRequest, ok, page, pageParams } from "@/lib/api/http";
import { listWorkItems, refreshQueue, serialiseWorkItem } from "@/lib/api/work-items";
import { WORK_ITEM_QUEUES, WORK_ITEM_STATUSES, type WorkItemQueue, type WorkItemStatus } from "@/db/schema";

/**
 * Dispatcher endpoint. Materialises the queue from the current domain state,
 * then returns its items. Re-running it never duplicates work: items are keyed
 * by (tenant, queue, reference) and keep the status a performer gave them.
 */
export async function GET(req: Request) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const queue = url.searchParams.get("queue") as WorkItemQueue | null;
  if (!queue || !(WORK_ITEM_QUEUES as readonly string[]).includes(queue)) {
    return badRequest(`Unknown queue. Use one of: ${WORK_ITEM_QUEUES.join(", ")}.`, { queues: WORK_ITEM_QUEUES });
  }
  const statusParam = url.searchParams.get("status");
  if (statusParam && !(WORK_ITEM_STATUSES as readonly string[]).includes(statusParam)) {
    return badRequest(`Unknown status. Use one of: ${WORK_ITEM_STATUSES.join(", ")}.`);
  }
  // `refresh` reports what the materialisation did, so a dispatcher can log how
  // many items are current and how many it retired.
  const refresh = url.searchParams.get("refresh") === "0" ? null : await refreshQueue(s, queue);
  const params = pageParams(url);
  const { items, total } = await listWorkItems(s, queue, { status: (statusParam as WorkItemStatus) ?? undefined, limit: params.limit, offset: params.offset });
  return ok({ queue, refresh, ...page(items.map(serialiseWorkItem), params, total) });
}
