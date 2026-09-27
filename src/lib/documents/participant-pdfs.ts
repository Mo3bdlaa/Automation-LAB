/**
 * Whether — and when — the lab prints the documents a participant creates.
 *
 * The master set is rendered once, ahead of time, which is what lets the
 * deployed app run without a browser. But two participant actions also produce
 * a document: posting a goods receipt, and approving a purchase order they
 * awarded. Those cannot be rendered in advance, because they do not exist until
 * someone does the work.
 *
 * They are printed on first download instead, as a background job, exactly the
 * way the thousand vendor compliance documents are. That keeps Chromium off the
 * request path and makes the cost follow the downloads people actually make
 * rather than every action they take — most participants never open the PDF of
 * a goods receipt they just posted, and the ones who do are the point of the
 * exercise. `PARTICIPANT_DOCUMENT_PDFS=0` switches it off for an event that
 * would rather not pay for it at all: the record, its lines and its status are
 * all still there, and the document card says plainly that this instance does
 * not print them.
 */
export function participantPdfsEnabled(): boolean {
  const flag = process.env.PARTICIPANT_DOCUMENT_PDFS;
  if (flag !== undefined) return flag !== "0" && flag !== "false";
  return true;
}

/**
 * Whether to print them the moment they are created rather than waiting for
 * someone to ask.
 *
 * On a development machine, yes: the browser is right there, and a file that
 * is already on disk makes the screens and the smoke scripts behave the way a
 * seeded document does. On a deployed lab, no — that is the per-participant
 * render cost the shared master set was built to remove.
 */
export function participantPdfsEager(): boolean {
  const flag = process.env.PARTICIPANT_DOCUMENT_PDFS_EAGER;
  if (flag !== undefined) return flag !== "0" && flag !== "false";
  return participantPdfsEnabled() && process.env.NODE_ENV !== "production";
}
