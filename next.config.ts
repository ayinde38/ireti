import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
/**
 * No third-party scripts, no framing, forms post only to us. Inline scripts
 * stay allowed: Next's prerendered pages rely on them, and per-request nonces
 * would turn off static prerendering for every page.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // The e2e suite builds into .next/e2e so it never touches the dev server's files.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite loads its WebAssembly build from disk at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read at runtime on first database connection.
  outputFileTracingIncludes: { "/**": ["./db/migrations/*.sql"] },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // receipt uploads
  },
  async headers() {
    return [
      // Pages get the site policy; receipt files set a stricter one of their own.
      { source: "/((?!api/files/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        // Only our own CSS; keep the loader off Next's generated font CSS.
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
