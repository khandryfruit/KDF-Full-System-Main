/**
 * Vite preview entry for Railway: reads PORT only at process start (runtime),
 * so Railpack does not see "${PORT}" in package.json and won't require a
 * BuildKit "secret PORT" during the image build.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, "..");
const port = String(process.env.PORT || "8080");

const viteCli = path.join(pkgRoot, "node_modules", "vite", "bin", "vite.js");
const child = spawn(
  process.execPath,
  [
    viteCli,
    "preview",
    "--config",
    path.join(pkgRoot, "vite.config.ts"),
    "--host",
    "0.0.0.0",
    "--port",
    port,
  ],
  { stdio: "inherit", cwd: pkgRoot, env: process.env },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
