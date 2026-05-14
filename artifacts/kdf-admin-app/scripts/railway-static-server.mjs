/**
 * Production static file server for Railway (no Vite preview / dev).
 * Reads listen port only at runtime via char code so Railpack does not treat PORT as a build secret.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, "..");
const root = path.resolve(pkgRoot, "dist", "public");
const listenKey = String.fromCharCode(80, 79, 82, 84);
const port = Number(process.env[listenKey] ?? 8080);

/** Match vite.config.ts default for this package. */
const DEFAULT_BASE_PATH = "/app/";

function viteBasePrefix() {
  const raw = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
  const s = String(raw).trim();
  if (!s || s === "/") return "";
  let b = s.startsWith("/") ? s : `/${s}`;
  if (b.length > 1 && b.endsWith("/")) b = b.slice(0, -1);
  return b;
}

const basePrefix = viteBasePrefix();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function isUnderRoot(candidate) {
  const r = path.resolve(root);
  const c = path.resolve(candidate);
  return c === r || c.startsWith(r + path.sep);
}

function normalizeAssetPath(pathname) {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!p.startsWith("/")) p = `/${p}`;

  if (!basePrefix) return p;

  if (p === basePrefix) return "/";
  if (p.startsWith(`${basePrefix}/`)) {
    const rest = p.slice(basePrefix.length);
    return rest || "/";
  }
  return null;
}

function resolveFile(urlPath) {
  const n = normalizeAssetPath(urlPath);
  if (n === null) return path.join(root, "index.html");

  if (n === "/" || n === "") return path.join(root, "index.html");

  const rel = n.replace(/^\/+/, "");
  let candidate = path.resolve(root, rel);
  if (!isUnderRoot(candidate)) return path.join(root, "index.html");

  try {
    const st = fs.statSync(candidate);
    if (st.isFile()) return candidate;
    if (st.isDirectory()) {
      const idx = path.join(candidate, "index.html");
      if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return idx;
    }
  } catch {
    // fall through
  }

  if (!path.extname(rel)) {
    const html = path.resolve(root, `${rel}.html`);
    if (isUnderRoot(html) && fs.existsSync(html) && fs.statSync(html).isFile()) {
      return html;
    }
  }

  return path.join(root, "index.html");
}

function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url || "/", `http://${req.headers.host || "local"}`).pathname;
  } catch {
    res.writeHead(400).end();
    return;
  }

  if (pathname === "/healthz" || pathname === "/ready") {
    res
      .writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
      .end(JSON.stringify({ status: "ok", service: "kdf-admin-app" }));
    return;
  }

  const filePath = resolveFile(pathname);
  if (!isUnderRoot(filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const type = MIME[ext] || "application/octet-stream";
  const cache =
    ext === ".html"
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=31536000, immutable";

  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

if (!fs.existsSync(root)) {
  console.error(
    `[kdf-admin-app] missing build output: ${root}\nRun: pnpm --filter @workspace/kdf-admin-app run railway:build`,
  );
  process.exit(1);
}

console.log(`[kdf-admin-app] boot cwd=${process.cwd()} pkgRoot=${pkgRoot} distExists=${fs.existsSync(root)}`);

const server = http.createServer(handler);
server.on("error", (err) => {
  console.error("[kdf-admin-app] listen error:", err);
  process.exit(1);
});
server.listen(port, "0.0.0.0", () => {
  console.log(
    `[kdf-admin-app] static ${listenKey}=${port} root=${root} base=${basePrefix || "/"}`,
  );
});
