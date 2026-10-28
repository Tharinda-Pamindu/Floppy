import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const next = require("next");
// Import the API first: validate environment before Next loads any local .env files.
const { startApi } = await import("../apps/api/dist/src/runtime.js");
const web = next({
  dev: false,
  dir: fileURLToPath(new URL("../apps/web/", import.meta.url)),
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
});
await web.prepare();
const handle = web.getRequestHandler();
startApi({
  frontend: (req, res) => {
    void handle(req, res).catch(() => {
      // Do not log request URLs, headers, or auth tokens.
      console.error("Frontend request failed.");
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal server error");
      } else {
        res.destroy();
      }
    });
  },
  onClose: () => web.close(),
});
