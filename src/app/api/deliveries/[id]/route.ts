import { eq } from "drizzle-orm";
import { deliveryNotes } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { badRequest, notFound, ok } from "@/lib/api/http";
import { serialiseDeliveryNote } from "@/lib/api/serialise";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return badRequest("Delivery note id must be a UUID.");
  const dn = await s.tdb.one(deliveryNotes, eq(deliveryNotes.id, id));
  if (!dn) return notFound("Delivery note");
  return ok({ deliveryNote: await serialiseDeliveryNote(s, dn) });
}
