import { and, eq } from "drizzle-orm";
import { documentFiles, documents } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { badRequest, notFound, ok } from "@/lib/api/http";
import { EAGER_KINDS } from "@/lib/documents/kinds";

/** Document metadata: kind, number, and whether the PDF is ready to download. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return badRequest("Document id must be a UUID.");
  const doc = await s.tdb.one(documents, eq(documents.id, id));
  if (!doc) return notFound("Document");
  const file = await s.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, 1))!);
  return ok({
    document: {
      id: doc.id, kind: doc.kind, number: doc.number, language: doc.language, createdAt: doc.createdAt.toISOString(),
      rendered: Boolean(file), rendersOnDemand: !EAGER_KINDS.has(doc.kind),
      file: file ? { filename: file.filename, mime: file.mime, pages: file.pages, sizeBytes: file.sizeBytes, level: file.level } : null,
      downloadUrl: `/api/documents/${doc.id}/file`,
    },
  });
}
