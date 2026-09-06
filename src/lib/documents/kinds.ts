import type { DocumentKind } from "@/db/schema";

/**
 * Kinds rendered eagerly when a sandbox is provisioned. Everything else (the
 * vendor compliance documents, of which there are a thousand) renders on first
 * download, as a background job.
 */
export const EAGER_KINDS = new Set<DocumentKind>(["rfq", "quote", "purchase_order", "delivery_note", "grn", "invoice", "receipt"]);
