// Deploy the repository to two Heroku apps: FLOPPY_APP=web (default) or api.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.FLOPPY_APP ?? "web";
const action = process.argv[2];
if (!["web", "api"].includes(target)) {
  throw new Error("FLOPPY_APP must be web or api.");
}
if (!["build", "start", "release"].includes(action)) {
  throw new Error("Usage: node scripts/heroku.mjs <build|start|release>");
}
const cwd = fileURLToPath(new URL("../apps/" + target + "/", import.meta.url));
const require = createRequire(new URL("../apps/" + target + "/package.json", import.meta.url));
let args;
let childCwd = cwd;

if (action === "build") {
  // Use npm's CLI directly so builds also work on Windows.
  if (!process.env.npm_execpath) {
    throw new Error("Run builds with npm run heroku-postbuild.");
  }
  // Each app's prebuild hook builds @floppy/shared first.
  args = [process.env.npm_execpath, "run", "build", "-w", "@floppy/" + target];
  childCwd = root;
} else if (action === "release") {
  if (target === "web") {
    console.log("Web release: no database migrations.");
    process.exit(0);
  }
  // Compiled migrations use production dependencies, not tsx/drizzle-kit.
  args = ["dist/scripts/migrate.js"];
} else {
  args = target === "api"
    ? ["dist/src/index.js"]
    : [require.resolve("next/dist/bin/next"), "start", "--hostname", "0.0.0.0"];
}
const child = spawn(process.execPath, args, { cwd: childCwd, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error("Unable to " + action + " " + target + ": " + error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
});
