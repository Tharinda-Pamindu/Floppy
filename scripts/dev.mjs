// Starts the API (port 4000) and the web app (port 3000) together.
// No extra dependencies: two child processes with prefixed output.
import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const apps = [
  ["api", "@floppy/api", "\x1b[36m"],
  ["web", "@floppy/web", "\x1b[35m"],
];
const children = apps.map(([name, workspace, color]) => {
  const child = spawn(isWin ? "npm.cmd" : "npm", ["run", "dev", "-w", workspace], { shell: isWin, env: process.env });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (chunk) => out.write(chunk.toString().split(/\r?\n/).filter(Boolean).map((l) => prefix + l).join("\n") + "\n"));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    for (const other of children) if (other !== child) other.kill();
    process.exit(code ?? 0);
  });
  return child;
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => children.forEach((c) => c.kill(sig)));
