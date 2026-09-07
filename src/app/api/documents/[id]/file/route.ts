import { and, eq } from "drizzle-orm";
import { documentFiles, documents } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { blobStore } from "@/lib/blob";
import { EAGER_KINDS } from "@/lib/documents/kinds";
import { isLevel, LEVELS, LEVEL_SPECS } from "@/lib/documents/levels";
import { enqueue } from "@/lib/jobs/queue";
import { kickJobs } from "@/lib/jobs/runner";

/**
 * Download a rendered document. `Content-Disposition: attachment` with a
 * predictable filename so UiPath's download-and-wait pattern works.
 * `?level=N` selects the difficulty level (P1 renders level 1).
 * Vendor compliance documents are rendered on first request: the download
 * answers 409 with Retry-After while the job runs, then serves the cached PDF.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  const url = new URL(req.url);
  const level = Number(url.searchParams.get("level") ?? "1") || 1;
  if (!isLevel(level)) return Response.json({ error: "bad_level", message: `Level must be one of ${LEVELS.join(", ")}.`, levels: LEVELS }, { status: 400 });
  // The validation station embeds the PDF, so it asks for an inline disposition.
  const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";
  const doc = await s.tdb.one(documents, eq(documents.id, id));
  if (!doc) return Response.json({ error: "not_found" }, { status: 404 });
  const file = await s.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, level))!);
  if (!file) {
    // Level 1 is rendered at provisioning time for most kinds; vendor
    // compliance documents and every degraded level are produced on demand.
    if (level === 1 && !EAGER_KINDS.has(doc.kind)) {
      await enqueue("render_document", { documentId: doc.id }, { tenantId: doc.tenantId, priority: 8 });
      kickJobs();
    } else if (level > 1) {
      await enqueue("degrade_document", { documentId: doc.id, level }, { tenantId: doc.tenantId, priority: 8 });
      kickJobs();
    }
    return Response.json(
      { error: "not_rendered", documentId: doc.id, level, message: `The ${LEVEL_SPECS[level].label} is being produced. Retry after a few seconds.` },
      { status: 409, headers: { "Retry-After": level > 1 ? "10" : "5" } },
    );
  }
  const bytes = await blobStore().get(file.blobKey);
  if (!bytes) return Response.json({ error: "blob_missing" }, { status: 500 });
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Document-Number": doc.number,
      "X-Document-Kind": doc.kind,
      "X-Document-Level": String(level),
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
