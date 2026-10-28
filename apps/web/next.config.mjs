const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const apiWs = api.replace(/^http/, "ws");
const isDev = process.env.NODE_ENV !== "production";

// Clerk publishable keys encode "<frontend-api-host>$". Use the selected
// instance's exact host for both development and production CSPs.
function clerkOriginFromKey(key) {
  if (!key) return "";
  const encoded = /^pk_(?:test|live)_([A-Za-z0-9+/]+={0,2})$/.exec(key)?.[1];
  const host = encoded
    ? /^([a-z0-9-]+(?:\.[a-z0-9-]+)+)\$$/i.exec(Buffer.from(encoded, "base64").toString("utf8"))?.[1]
    : undefined;
  if (!host) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is invalid. Copy it from the Clerk dashboard.");
  }
  return `https://${host}`;
}

const clerkOrigin = clerkOriginFromKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Content Security Policy. Clerk (auth UI + Cloudflare bot check), Novu
 * (Inbox API + websocket) and our own API are the only third parties.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} ${clerkOrigin} https://challenges.cloudflare.com https://*.protect.clerk.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.clerk.com https://*.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${api} ${apiWs} ${clerkOrigin} https://*.protect.clerk.com:* https://api.novu.co https://eu.api.novu.co wss://socket.novu.co wss://eu.socket.novu.co wss://ws.novu.co https://ws.novu.co`,
  "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import("next").NextConfig} */
const nextConfig = {
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
