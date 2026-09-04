import type { Job, JobKind } from "@/db/schema";
import { provisionSandbox, resetSandbox } from "../sandbox/lifecycle";
import { renderDocument } from "../documents/service";

export type Handler = (job: Job, log: (m: string) => void) => Promise<void>;

export const handlers: Partial<Record<JobKind, Handler>> = {
  provision_sandbox: async (job, log) => {
    await provisionSandbox(job.tenantId!, log);
  },
  reset_sandbox: async (job, log) => {
    await resetSandbox(job.tenantId!, log);
  },
  render_document: async (job, log) => {
    const documentId = String(job.payload.documentId ?? "");
    if (!documentId) throw new Error("render_document needs payload.documentId");
    await renderDocument(documentId, log);
  },
};
