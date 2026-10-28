// One Heroku app builds and serves both workspaces. FLOPPY_APP is obsolete.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const action = process.argv[2];
if (!["build", "start", "release"].includes(action)) {
  throw new Error("Usage: node scripts/heroku.mjs <build|start|release>");
}
let args;
let cwd = root;
if (action === "build") {
  if (!process.env.npm_execpath) throw new Error("Run builds with npm run heroku-postbuild.");
  console.log("Heroku build: API + web (single app).");
  args = [process.env.npm_execpath, "run", "build"];
} else if (action === "release") {
  cwd = fileURLToPath(new URL("../apps/api/", import.meta.url));
  args = ["dist/scripts/migrate.js"];
} else {
  args = ["scripts/start-fullstack.mjs"];
}
const child = spawn(process.execPath, args, { cwd, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error("Unable to " + action + ": " + error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
});
