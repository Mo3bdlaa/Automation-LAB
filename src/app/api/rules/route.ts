import { describeRules } from "@/lib/validation/engine";
import { ALL_RULES } from "@/lib/validation/rules";

export function GET() {
  return Response.json({ rules: describeRules(ALL_RULES) }, { headers: { "Cache-Control": "no-store" } });
}
