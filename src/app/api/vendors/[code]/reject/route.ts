import { eq } from "drizzle-orm";
import { vendors } from "@/db/schema";
import { apiSession } from "@/lib/auth/server";
import { conflict, notFound, ok, problem } from "@/lib/api/http";
import { decideVendorApplication } from "@/lib/services/vendor-applications";
import { serialiseVendor } from "@/lib/api/serialise";

/** Refuses a supplier application: the record is blocked and never used. */
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const s = await apiSession();
  if (s instanceof Response) return s;
  const { code } = await ctx.params;
  const result = await decideVendorApplication(s, decodeURIComponent(code), "reject");
  if (!result.ok) {
    if (result.error === "not_found") return notFound("Vendor");
    if (result.error === "read_only") return problem(403, "read_only", result.message);
    return conflict(result.message);
  }
  const v = await s.tdb.one(vendors, eq(vendors.id, result.vendor.id));
  return ok({ vendor: serialiseVendor(v!, false), violations: result.violations });
}
