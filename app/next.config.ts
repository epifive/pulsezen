import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets a second development server run from the same folder (NEXT_DIST_DIR=.next-test).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Native / server-only packages that must not be bundled.
  serverExternalPackages: ["mysql2", "nodemailer"],
  experimental: {
    serverActions: {
      // Logo / favicon uploads from the admin panel.
      bodySizeLimit: "5mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Everything except /embed/* and public shared dashboards may only be framed by this site.
      { source: "/:path((?!embed/|share/).*)", headers: securityHeaders },
      // Pages under /embed/ and shared dashboards (/share/<token>?embed=1) may be shown in iframes on other sites.
      {
        source: "/:dir(embed|share)/:path*",
        headers: [
          ...securityHeaders.filter((h) => h.key !== "X-Frame-Options"),
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
