/**
 * Whether the lab renders PDFs for documents a participant creates.
 *
 * The master set is rendered once, ahead of time, which is what lets the
 * deployed app run without a browser. But two participant actions also produce
 * a document: posting a goods receipt, and approving a purchase order they
 * awarded. Those cannot be rendered in advance, because they do not exist until
 * someone does the work.
 *
 * Rendering them on the request path puts Chromium back into production and
 * restores the per-participant cost the shared master set removed — eight
 * renders for every goods receipt run, which is thousands across an event.
 *
 * So in production this is off unless deliberately turned on. The receipt and
 * the order still exist, with their numbers, lines and status, and every API
 * and screen works; only the printed copy is absent, and the document card
 * already has a state for that. Turn it on with PARTICIPANT_DOCUMENT_PDFS=1
 * where a browser is genuinely available — a container running `pnpm worker`,
 * or a serverless Chromium package.
 */
export function participantPdfsEnabled(): boolean {
  const flag = process.env.PARTICIPANT_DOCUMENT_PDFS;
  if (flag !== undefined) return flag !== "0" && flag !== "false";
  return process.env.NODE_ENV !== "production";
}
