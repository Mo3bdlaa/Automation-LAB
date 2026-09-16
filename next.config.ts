import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for running the app ourselves - the Dockerfile, or any
  // host where we start the server. Vercel builds differently: it traces the
  // server itself and expects .nft.json files, which standalone mode does not
  // produce, so leaving this on there fails the build at the very last step
  // with a missing next-server.js.nft.json.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  serverExternalPackages: ["playwright-core", "pg"],
  // Ship the PDF templates/fonts and the dev user fixture with the standalone or
  // serverless output.
  // playwright-core loads its driver bundle at runtime, and the degradation
  // pipeline reads pdf.js off disk to inject it into the page, so tracing has to
  // be told about both: neither is reachable through an import.
  outputFileTracingIncludes: {
    "/**": ["./templates/**", "./config/**", "./node_modules/.pnpm/playwright-core*/**", "./node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"],
  },
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
