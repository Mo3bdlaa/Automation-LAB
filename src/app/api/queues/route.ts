import { apiSession } from "@/lib/auth/server";
import { ok } from "@/lib/api/http";
import { QUEUE_DESCRIPTIONS, queueSources } from "@/lib/api/work-items";
import { WORK_ITEM_QUEUES } from "@/db/schema";
import { defaultLevel } from "@/lib/lab-settings";
import { LEVEL_SPECS } from "@/lib/documents/levels";

/** Discovery: every queue, what it holds and how many items are pending right now. */
export async function GET() {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const level = await defaultLevel();
  const queues = await Promise.all(
    WORK_ITEM_QUEUES.map(async (queue) => ({
      queue,
      description: QUEUE_DESCRIPTIONS[queue],
      pending: (await queueSources(s, queue, level)).length,
      workItemsUrl: `/api/work-items?queue=${queue}`,
      downloadUrl: queue === "invoices-pending" || queue === "pos-awaiting-invoice" || queue === "vendor-applications" ? `/api/queues/${queue}/download${level > 1 ? `?level=${level}` : ""}` : null,
    })),
  );
  // The difficulty level the instructor set for the cohort. Any level can still
  // be requested per call; this is what the queues hand out by default.
  return ok({ level, levels: Object.values(LEVEL_SPECS).map((l) => ({ level: l.level, label: l.label, description: l.description, dpi: l.dpi, textLayer: l.textLayer })), queues });
}
