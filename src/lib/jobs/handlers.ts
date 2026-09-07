import type { Job, JobKind } from "@/db/schema";

export type Handler = (job: Job, log: (m: string) => void) => Promise<void>;

/**
 * Job handlers load their dependencies lazily. Provisioning and rendering pull
 * in heavy modules (the generators, and Chromium through playwright-core); a
 * static import here would drag them into every page's server bundle.
 */
export const handlers: Partial<Record<JobKind, Handler>> = {
  provision_sandbox: async (job, log) => {
    const { provisionSandbox } = await import("../sandbox/provision");
    await provisionSandbox(job.tenantId!, log);
  },
  reset_sandbox: async (job, log) => {
    const { resetSandbox } = await import("../sandbox/provision");
    await resetSandbox(job.tenantId!, log);
  },
  deliver_webhook: async (job, log) => {
    const deliveryId = String(job.payload.deliveryId ?? "");
    if (!deliveryId) throw new Error("deliver_webhook needs payload.deliveryId");
    const { deliverWebhook } = await import("../webhooks/emit");
    await deliverWebhook(deliveryId, log);
  },
  render_document: async (job, log) => {
    const documentId = String(job.payload.documentId ?? "");
    if (!documentId) throw new Error("render_document needs payload.documentId");
    const { renderDocument } = await import("../documents/service");
    await renderDocument(documentId, log);
  },
  degrade_document: async (job, log) => {
    const documentId = String(job.payload.documentId ?? "");
    const level = Number(job.payload.level ?? 0);
    if (!documentId) throw new Error("degrade_document needs payload.documentId");
    const { degradeDocument } = await import("../documents/service");
    await degradeDocument(documentId, level, log);
  },
};
