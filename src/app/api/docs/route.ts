/** Swagger UI over /api/openapi. Kept as a route so it needs no client bundle. */
const SWAGGER_VERSION = "5.17.14";

export function GET() {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Automation Lab API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css">
<style>
  body { margin: 0; background: #f5f6f7; }
  .topbar { display: none; }
  .al-bar { background: #354a5f; color: #fff; padding: .6rem 1rem; font: 600 14px/1.4 "Segoe UI", system-ui, sans-serif; display: flex; gap: 1rem; align-items: center; }
  .al-bar a { color: #7fc4ff; text-decoration: none; }
  .al-note { background: #fff3cd; color: #7a4b00; border-bottom: 1px solid #f1d78a; font: 12px/1.5 system-ui, sans-serif; padding: .4rem 1rem; }
</style>
</head>
<body>
<div class="al-bar"><span>Automation Lab API</span><a href="/">Back to the lab</a><a href="/api/openapi">openapi.json</a><a href="/sandbox">Create an API token</a></div>
<div class="al-note">All data is fictitious. Authenticate with <code>Authorization: Bearer al_...</code>, or simply stay signed in: this page sends your session cookie.</div>
<div id="swagger"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js" crossorigin></script>
<script>
  window.ui = SwaggerUIBundle({
    url: "/api/openapi",
    dom_id: "#swagger",
    deepLinking: true,
    withCredentials: true,
    persistAuthorization: true,
    docExpansion: "list",
    defaultModelsExpandDepth: 0,
    tryItOutEnabled: true,
  });
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
