/**
 * Publishes the code-first workflows (src/notifications/workflows.ts) to Novu
 * Cloud. Novu fetches them from the API's bridge, so the API must be reachable
 * at API_PUBLIC_URL (deployed, or exposed with a tunnel such as `npm run novu:dev`).
 */
import { spawnSync } from "node:child_process";

const secret = process.env.NOVU_SECRET_KEY;
const bridge = `${process.env.API_PUBLIC_URL ?? "http://localhost:4000"}/api/novu`;
if (!secret) {
  console.error("NOVU_SECRET_KEY is empty in apps/api/.env.");
  process.exit(1);
}
const args = ["novu@latest", "sync", "--bridge-url", bridge, "--secret-key", secret];
if (process.env.NOVU_API_URL) args.push("--api-url", process.env.NOVU_API_URL);
console.log(`Syncing workflows from ${bridge} …`);
const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
