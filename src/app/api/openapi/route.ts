import { openApiDocument } from "@/lib/api/openapi";

/** The OpenAPI 3.1 description. Public so a bot can generate a client before signing in. */
export function GET(req: Request) {
  const origin = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  return Response.json(openApiDocument(origin), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } });
}
