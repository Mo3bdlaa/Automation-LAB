import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright-core", "pg"],
  // Ship the PDF templates/fonts and the dev user fixture with the standalone/serverless output.
  // playwright-core loads its driver bundle at runtime, so tracing has to be told about it.
  outputFileTracingIncludes: { "/**": ["./templates/**", "./config/**", "./node_modules/.pnpm/playwright-core*/**"] },
  async headers() {
    // Belt and braces: every response is noindex. Fake IBANs and tax IDs must
    // never be indexable or mistakable for real documents. See docs/spec.md.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        ],
      },
    ];
  },
};

export default nextConfig;
