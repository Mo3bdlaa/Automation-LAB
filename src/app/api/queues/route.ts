import { apiSession } from "@/lib/auth/server";
import { ok } from "@/lib/api/http";
import { QUEUE_DESCRIPTIONS, queueSources } from "@/lib/api/work-items";
import { WORK_ITEM_QUEUES } from "@/db/schema";

/** Discovery: every queue, what it holds and how many items are pending right now. */
export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const queues = await Promise.all(
    WORK_ITEM_QUEUES.map(async (queue) => ({
      queue,
      description: QUEUE_DESCRIPTIONS[queue],
      pending: (await queueSources(s, queue)).length,
      workItemsUrl: `/api/work-items?queue=${queue}`,
      downloadUrl: queue === "invoices-pending" || queue === "pos-awaiting-invoice" || queue === "vendor-applications" ? `/api/queues/${queue}/download` : null,
    })),
  );
  return ok({ queues });
}
