import { and, eq } from "drizzle-orm";
import { documentFieldBoxes, documentFiles, documents } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { badRequest, notFound, ok } from "@/lib/api/http";
import { EAGER_KINDS } from "@/lib/documents/kinds";
import { isLevel, LEVELS, LEVEL_SPECS } from "@/lib/documents/levels";

/** Document metadata: kind, number, and whether the PDF is ready to download. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return badRequest("Document id must be a UUID.");
  const doc = await s.tdb.one(documents, eq(documents.id, id));
  if (!doc) return notFound("Document");
  const url = new URL(req.url);
  const level = Number(url.searchParams.get("level") ?? "1") || 1;
  if (!isLevel(level)) return badRequest(`Level must be one of ${LEVELS.join(", ")}.`, { levels: LEVELS });
  const file = await s.tdb.one(documentFiles, and(eq(documentFiles.documentId, doc.id), eq(documentFiles.level, level))!);
  const files = await s.tdb.list(documentFiles, { where: eq(documentFiles.documentId, doc.id) });
  // Field positions, for a Document Understanding taxonomy that wants them.
  // Positions are not values: a pending invoice still hides what it says.
  const boxes = url.searchParams.get("boxes") === "1" ? await s.tdb.list(documentFieldBoxes, { where: and(eq(documentFieldBoxes.documentId, doc.id), eq(documentFieldBoxes.level, level))! }) : null;
  return ok({
    document: {
      id: doc.id, kind: doc.kind, number: doc.number, language: doc.language, createdAt: doc.createdAt.toISOString(),
      level, levelLabel: LEVEL_SPECS[level].label, textLayer: LEVEL_SPECS[level].textLayer,
      rendered: Boolean(file), rendersOnDemand: !EAGER_KINDS.has(doc.kind) || level > 1,
      file: file ? { filename: file.filename, mime: file.mime, pages: file.pages, sizeBytes: file.sizeBytes, level: file.level } : null,
      levelsAvailable: files.map((f) => f.level).sort((a, b) => a - b),
      downloadUrl: `/api/documents/${doc.id}/file${level > 1 ? `?level=${level}` : ""}`,
      fieldBoxes: boxes ? boxes.map((b) => ({ field: b.field, page: b.page, x: Number(b.x), y: Number(b.y), w: Number(b.w), h: Number(b.h) })) : undefined,
    },
  });
}
