/**
 * One-shot production build for Railway when the service "Root Directory" is
 * `artifacts/api-server`: installs from the monorepo root, builds storefronts,
 * then builds the API bundle.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: repoRoot,
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log("[railway-build] repo root:", repoRoot);

run("corepack", ["enable"]);
run("corepack", ["prepare", "pnpm@9.15.0", "--activate"]);
run("pnpm", ["install", "--frozen-lockfile"]);

const prod = { env: { NODE_ENV: "production" } };
run("pnpm", ["--filter", "@workspace/kdf-plus", "run", "build"], prod);
run("pnpm", ["--filter", "@workspace/kdf-admin", "run", "build"], prod);
run("pnpm", ["--filter", "@workspace/kdf-admin-app", "run", "build"], prod);
run("pnpm", ["--filter", "@workspace/api-server", "run", "build"], prod);

console.log("[railway-build] done.");
