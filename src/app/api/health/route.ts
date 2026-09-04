import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, app: "automation-lab", db: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
