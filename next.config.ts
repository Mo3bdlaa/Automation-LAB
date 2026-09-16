import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for running the app ourselves - the Dockerfile, or any
  // host where we start the server. Vercel builds differently: it traces the
  // server itself and expects .nft.json files, which standalone mode does not
  // produce, so leaving this on there fails the build at the very last step
  // with a missing next-server.js.nft.json.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  serverExternalPackages: ["playwright-core", "pg", "@sparticuz/chromium"],
  // The fonts are read off disk when a PDF is rendered, so tracing has to be
  // told about them: they are reached by path, not by import.
  //
  // The node_modules entries are for the self-hosted build only. playwright's
  // driver and pdf.js are reached by path too, but under pnpm those paths run
  // through the store's symlinks, and asking Vercel to package them produces
  // "an invalid deployment package for a Serverless Function". They are only
  // needed by the document pipeline - generating the set and degrading it to
  // levels 2 to 5 - which on Vercel has already happened before anything is
  // deployed.
  outputFileTracingIncludes: {
    // Only the two routes that print a PDF inside the request. The browser this
    // package carries is 67 MB read off disk rather than imported, so tracing
    // has to be told about it - but told once, here, and not for all ninety-odd
    // routes, which would put it inside every function.
    // Matched with a wildcard rather than the literal route: the square
    // brackets of a dynamic segment are glob syntax, so "/verify/[code]/..."
    // matches nothing at all.
    "**/certificate.pdf/route": ["./node_modules/@sparticuz/chromium/bin/**"],
    "**/pdd.pdf/route": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/**": [
      "./templates/**",
      ...(process.env.VERCEL
        ? []
        : [
            "./config/**",
            "./node_modules/.pnpm/playwright-core*/**",
            "./node_modules/pdfjs-dist/legacy/build/pdf.min.mjs",
            "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          ]),
    ],
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
