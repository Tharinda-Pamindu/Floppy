import type { NextConfig } from "next";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const apiWs = api.replace(/^http/, "ws");
const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Clerk (auth UI + Cloudflare bot check), Novu
 * (Inbox API + websocket) and our own API are the only third parties.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://*.clerk.accounts.dev https://clerk.*.* https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.clerk.com https://*.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${api} ${apiWs} https://*.clerk.accounts.dev https://clerk.*.* https://api.novu.co https://eu.api.novu.co wss://socket.novu.co wss://eu.socket.novu.co wss://ws.novu.co https://ws.novu.co`,
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@floppy/shared"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp.replace(/\s{2,}/g, " ") },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
