import path from "node:path";
import { existsSync } from "node:fs";

const INDEX = "index.html";

/** Absolute path to a Vite `dist/public` folder (must contain index.html). */
export type SpaDistKind = "kdf-plus" | "kdf-admin" | "kdf-admin-app";

const ENV_BY_KIND: Record<SpaDistKind, string> = {
  "kdf-plus": "KDF_PLUS_DIST",
  "kdf-admin": "KDF_ADMIN_DIST",
  "kdf-admin-app": "KDF_ADMIN_APP_DIST",
};

const DIR_SEGMENT: Record<SpaDistKind, string> = {
  "kdf-plus": "kdf-plus",
  "kdf-admin": "kdf-admin",
  "kdf-admin-app": "kdf-admin-app",
};

/**
 * Resolve SPA static roots for both layouts:
 * - CWD = monorepo root → `artifacts/<app>/dist/public`
 * - CWD = `artifacts/api-server` (common Railway "Root Directory") → `../<app>/dist/public`
 * - CWD = `artifacts` → `<app>/dist/public`
 *
 * Optional env override: `KDF_PLUS_DIST`, `KDF_ADMIN_DIST`, `KDF_ADMIN_APP_DIST`
 * (each must be an absolute or relative path to the folder that contains index.html).
 */
export function resolveSpaDistDir(kind: SpaDistKind): string {
  const envName = ENV_BY_KIND[kind];
  const raw = process.env[envName]?.trim();
  if (raw) {
    const abs = path.resolve(raw);
    if (existsSync(path.join(abs, INDEX))) return abs;
  }

  const cwd = process.cwd();
  const seg = DIR_SEGMENT[kind];
  const candidates = [
    path.join(cwd, "artifacts", seg, "dist", "public"),
    path.join(cwd, "..", seg, "dist", "public"),
    path.join(cwd, seg, "dist", "public"),
  ];

  for (const c of candidates) {
    const abs = path.resolve(c);
    if (existsSync(path.join(abs, INDEX))) return abs;
  }

  /* Prefer workspace-style path for error messages / prod checks */
  return path.resolve(candidates[0]!);
}

/**
 * `/api/static` files (logos, etc.). Tries monorepo layout then package-local `public/`.
 * Override: `API_SERVER_PUBLIC_DIR`.
 */
export function resolveApiPublicDir(): string {
  const raw = process.env.API_SERVER_PUBLIC_DIR?.trim();
  if (raw) {
    const abs = path.resolve(raw);
    if (existsSync(abs)) return abs;
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "artifacts", "api-server", "public"),
    path.join(cwd, "public"),
    path.join(cwd, "..", "api-server", "public"),
  ];
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (existsSync(abs)) return abs;
  }
  return path.resolve(candidates[0]!);
}

export function spaDistReady(absDir: string): boolean {
  return existsSync(path.join(absDir, INDEX));
}
