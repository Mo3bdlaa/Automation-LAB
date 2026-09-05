import { and, eq } from "drizzle-orm";
import { documentFiles, documents } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { blobStore } from "@/lib/blob";
import { EAGER_KINDS, ensureRendered } from "@/lib/documents/service";

/**
 * Download a rendered document. `Content-Disposition: attachment` with a
 * predictable filename so UiPath's download-and-wait pattern works.
 * `?level=N` selects the difficulty level (P1 renders level 1).
 * Vendor compliance documents render on first download and are then cached.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  const level = Number(new URL(req.url).searchParams.get("level") ?? "1") || 1;
  const doc = await s.tdb.one(documents, eq(documents.id, id));
  if (!doc) return Response.json({ error: "not_found" }, { status: 404 });
  let file = await s.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, level))!);
  if (!file && !EAGER_KINDS.has(doc.kind) && level === 1) {
    try {
      file = await ensureRendered(doc.id, level);
    } catch (e) {
      return Response.json({ error: "render_failed", message: e instanceof Error ? e.message : String(e) }, { status: 503, headers: { "Retry-After": "10" } });
    }
  }
  if (!file) return Response.json({ error: "not_rendered", documentId: doc.id, level }, { status: 409, headers: { "Retry-After": "5" } });
  const bytes = await blobStore().get(file.blobKey);
  if (!bytes) return Response.json({ error: "blob_missing" }, { status: 500 });
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Document-Number": doc.number,
      "X-Document-Kind": doc.kind,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
