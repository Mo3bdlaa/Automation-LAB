/** The public origin, for links printed on documents and certificates. */
export function appOrigin(req?: Request): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, "");
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      /* fall through */
    }
  }
  return "http://localhost:3000";
}
