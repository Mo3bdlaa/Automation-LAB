import { and, eq, inArray } from "drizzle-orm";
import { documentFiles, documents, invoices, purchaseOrders, vendors, type DocumentKind } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { blobStore } from "@/lib/blob";
import { buildZip } from "@/lib/zip";

/**
 * Bulk ZIP of a work queue's PDFs, for offline extraction training.
 *   invoices-pending      invoices awaiting extraction
 *   pos-awaiting-invoice  purchase orders received but not yet invoiced
 *   vendor-applications   commercial licences of vendors pending approval
 *   kind:<document kind>  every rendered document of a kind (e.g. kind:quote)
 */
export async function GET(_req: Request, ctx: { params: Promise<{ queue: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { queue } = await ctx.params;
  let docIds: string[] = [];
  if (queue === "invoices-pending") {
    const inv = await s.tdb.list(invoices, { where: eq(invoices.status, "pending_extraction") });
    const docs = inv.length ? await s.tdb.list(documents, { where: and(eq(documents.kind, "invoice"), inArray(documents.sourceId, inv.map((i) => i.id)))! }) : [];
    docIds = docs.map((d) => d.id);
  } else if (queue === "pos-awaiting-invoice") {
    const pos = await s.tdb.list(purchaseOrders, { where: and(eq(purchaseOrders.historical, false), inArray(purchaseOrders.status, ["received", "partially_received"]))! });
    const invoiced = pos.length ? await s.tdb.list(invoices, { where: inArray(invoices.purchaseOrderId, pos.map((p) => p.id)) }) : [];
    const open = pos.filter((p) => !invoiced.some((i) => i.purchaseOrderId === p.id));
    const docs = open.length ? await s.tdb.list(documents, { where: and(eq(documents.kind, "purchase_order"), inArray(documents.sourceId, open.map((p) => p.id)))! }) : [];
    docIds = docs.map((d) => d.id);
  } else if (queue === "vendor-applications") {
    const pending = await s.tdb.list(vendors, { where: eq(vendors.status, "pending") });
    const docs = pending.length ? await s.tdb.list(documents, { where: and(eq(documents.kind, "vendor_licence"), inArray(documents.vendorId, pending.map((v) => v.id)))! }) : [];
    docIds = docs.map((d) => d.id);
  } else if (queue.startsWith("kind:")) {
    const kind = queue.slice(5) as DocumentKind;
    const docs = await s.tdb.list(documents, { where: eq(documents.kind, kind), limit: 500 });
    docIds = docs.map((d) => d.id);
  } else {
    return Response.json({ error: "unknown_queue" }, { status: 404 });
  }
  if (docIds.length === 0) return Response.json({ error: "empty_queue" }, { status: 404 });
  const files = await s.tdb.list(documentFiles, { where: and(inArray(documentFiles.documentId, docIds), eq(documentFiles.level, 1))! });
  const store = blobStore();
  const entries: { name: string; data: Uint8Array }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const data = await store.get(f.blobKey);
    if (!data) continue;
    let name = f.filename;
    if (seen.has(name)) name = name.replace(/\.pdf$/, `_${f.documentId.slice(0, 6)}.pdf`);
    seen.add(name);
    entries.push({ name, data });
  }
  if (entries.length === 0) return Response.json({ error: "not_rendered", documents: docIds.length }, { status: 409, headers: { "Retry-After": "10" } });
  const zip = buildZip(entries);
  return new Response(zip as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.byteLength),
      "Content-Disposition": `attachment; filename="${queue.replace(/[^\w-]+/g, "-")}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Document-Count": String(entries.length),
    },
  });
}
