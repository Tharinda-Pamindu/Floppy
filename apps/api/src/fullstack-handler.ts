import type { RequestListener } from "node:http";

/** Dispatch before Express/Clerk so API auth and headers never affect pages. */
export function fullstackHandler(api: RequestListener, frontend: RequestListener): RequestListener {
  return (req, res) => {
    const url = req.url ?? "/";
    const path = url.split("?", 1)[0] ?? "/";
    // Keep existing public integration URLs compatible.
    if (path === "/health" || path === "/webhooks/clerk" || path === "/api/novu" || path.startsWith("/api/novu/")) {
      // Same-origin deployment must preserve the API's Bearer-only auth contract.
      delete req.headers.cookie;
      api(req, res);
    } else if (path === "/api" || path.startsWith("/api/")) {
      // Preserve query strings and raw bodies (including signed webhooks).
      req.url = url.slice(4) || "/";
      if (req.url.startsWith("?")) req.url = "/" + req.url;
      // Same-origin deployment must preserve the API's Bearer-only auth contract.
      delete req.headers.cookie;
      api(req, res);
    } else {
      frontend(req, res);
    }
  };
}
