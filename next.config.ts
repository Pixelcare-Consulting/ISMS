import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile runner
  // stage). Harmless on Vercel, which ignores it.
  // On Windows, standalone finalization needs symlink privileges (Developer
  // Mode or admin); skip locally so `pnpm run build` can succeed. Docker/Linux
  // builds always keep standalone. Set NEXT_STANDALONE=1 to force it on Windows.
  ...(process.platform !== "win32" || process.env.NEXT_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
  // Let Node resolve @better-auth/infra's own Zod 4 dep (z.url) instead of
  // Turbopack bundling the app's Zod 3 into the plugin.
  // Do NOT externalize isomorphic-dompurify/jsdom: Vercel Node hits
  // ERR_REQUIRE_ESM on html-encoding-sniffer → @exodus/bytes. Announcement
  // HTML is sanitized with sanitize-html instead (no jsdom).
  serverExternalPackages: ["@better-auth/infra"],
  experimental: {
    serverActions: {
      // Must be >= POLICY_ATTACHMENT_MAX_BYTES (10 MB) or valid uploads are
      // rejected by Next before the app-level size check runs.
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: "/planning",
        destination: "/settings/planning/runs",
        permanent: false,
      },
      {
        source: "/planning/runs/new",
        destination: "/settings/planning/runs?new=1",
        permanent: false,
      },
      {
        source: "/planning/runs/:runId",
        destination: "/settings/planning/runs?run=:runId",
        permanent: false,
      },
      {
        source: "/planning/suggested-orders",
        destination: "/settings/planning/runs",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
