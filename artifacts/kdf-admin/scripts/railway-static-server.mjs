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
const DEFAULT_BASE_PATH = "/admin/";

function viteBasePrefix() {
  const raw = process.env.BASE_PATH ?? DEFAULT_BASE_PATH;
  const s = String(raw).trim();
  if (!s || s === "/") return "";
  let b = s.startsWith("/") ? s : `/${s}`;
  if (b.length > 1 && b.endsWith("/")) b = b.slice(0, -1);
  return b;
}

const rootIndexPath = path.join(root, "index.html");

/**
 * Railway / spreadsheet copy-paste often produces values like:
 *   "Value: https://api.khanbabadryfruits.com"
 *   "https://Value: https://api...." (double scheme)
 * Extract a single valid origin (scheme + host [+ port], no path).
 */
function sanitizePublicApiOrigin(input) {
  let s = String(input ?? "").trim();
  if (!s) return "";
  /* Strip leading labels (case-insensitive) */
  s = s.replace(/^\s*(value|variable|url|api\s*url|env)\s*:\s*/i, "").trim();
  /* Remove embedded "Value:" / "Variable:" labels */
  s = s.replace(/\b(value|variable)\s*:\s*/gi, " ").replace(/\s+/g, " ").trim();
  /* Strip wrapping quotes */
  s = s.replace(/^["']+|["']+$/g, "").trim();

  const tokenRe = /https?:\/\/[^\s"'<>]+/gi;
  const tokens = [];
  let m;
  while ((m = tokenRe.exec(s)) !== null) {
    let t = m[0].replace(/["')]+$/g, "").trim();
    try {
      const u = new URL(t);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const host = u.hostname.toLowerCase();
      if (!host || host === "value") continue;
      tokens.push(`${u.protocol}//${u.host}`);
    } catch {
      /* skip malformed */
    }
  }
  let pick = "";
  const apiTok = tokens.find((x) => /\/\/api\./i.test(x));
  if (apiTok) pick = apiTok;
  else if (tokens.length) pick = tokens[tokens.length - 1];
  if (pick) {
    return pick.replace(/\/+$/, "").replace(/\/api\/?$/i, "");
  }
  /* Bare hostname, no scheme */
  const oneWord = s.replace(/\s+/g, "").replace(/^["']+|["']+$/g, "");
  if (oneWord && !/\s/.test(oneWord) && !/^https?:\/\//i.test(oneWord)) {
    const hostOnly = oneWord.replace(/\/api\/?$/i, "").replace(/\/+$/, "");
    if (hostOnly) return `https://${hostOnly}`;
  }
  return "";
}

/** Public API origin for split deploys — override on kdf-admin service via Railway env. */
function runtimePublicApiOrigin() {
  const merged = (
    process.env.PUBLIC_API_ORIGIN ||
    process.env.VITE_API_BASE_URL ||
    process.env.VITE_API_URL ||
    process.env.API_PUBLIC_ORIGIN ||
    process.env.API_BASE_URL ||
    ""
  ).trim();
  const cleaned = sanitizePublicApiOrigin(merged);
  const raw = (
    cleaned ||
    "https://api.khanbabadryfruits.com"
  )
    .replace(/\/+$/, "")
    .replace(/\/api\/?$/i, "");
  if (!raw) return "https://api.khanbabadryfruits.com";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

let spaIndexHtmlCache;

function spaIndexHtmlWithInjectedApiOrigin() {
  if (spaIndexHtmlCache) return spaIndexHtmlCache;
  const raw = fs.readFileSync(rootIndexPath, "utf8");
  const o = runtimePublicApiOrigin();
  const escaped = JSON.stringify(o);
  const block = `<meta name="kdf-api-public-origin" content="${String(o)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")}" /><script>try{window.__KDF_API_PUBLIC_ORIGIN__=${escaped};}catch(e){}</script>`;
  spaIndexHtmlCache = raw.includes("</head>")
    ? raw.replace("</head>", `${block}</head>`)
    : raw.replace("<head>", `<head>${block}`);
  return spaIndexHtmlCache;
}

function isRootSpaIndex(filePath) {
  try {
    return path.resolve(filePath) === path.resolve(rootIndexPath);
  } catch {
    return false;
  }
}

const basePrefix = viteBasePrefix();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
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

/**
 * Map URL pathname to path under dist/public, stripping Vite `base` when set.
 * Returns null when the request is outside the app base (SPA shell).
 */
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
    // fall through to SPA / .html
  }

  if (!path.extname(rel)) {
    const html = path.resolve(root, `${rel}.html`);
    if (isUnderRoot(html) && fs.existsSync(html) && fs.statSync(html).isFile()) {
      return html;
    }
  }

  return path.join(root, "index.html");
}

function isApiPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/admin/api" ||
    pathname.startsWith("/admin/api/")
  );
}

/**
 * When `api.*` is wrongly attached to this static service, browsers send OPTIONS preflight
 * and get 405 (this server only allowed GET/HEAD) → "CORS failed". Reply with real CORS
 * and JSON so operators see a clear Railway misconfiguration instead of opaque errors.
 */
function corsHeadersForApiMisroute(req) {
  const origin = req.headers.origin;
  const requestHdrs = req.headers["access-control-request-headers"];
  const headers = {
    "X-KDF-Backend": "kdf-admin-static",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Headers":
      requestHdrs || "Content-Type,Authorization,X-Requested-With,Accept",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers.Vary = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

function handler(req, res) {
  let pathname;
  let requestUrl;
  try {
    requestUrl = new URL(req.url || "/", `http://${req.headers.host || "local"}`);
    pathname = requestUrl.pathname;
  } catch {
    res.writeHead(400).end();
    return;
  }

  // GET/HEAD: redirect /api/widget.js and /api/chat-embed to PUBLIC_API_ORIGIN when this static host serves them (Railway misroute).
  if (req.method === "GET" || req.method === "HEAD") {
    if (pathname === "/api/widget.js" || pathname === "/api/chat-embed") {
      let apiOrigin = runtimePublicApiOrigin().replace(/\/+$/, "");
      try {
        const h = new URL(apiOrigin).hostname.toLowerCase();
        if (h.startsWith("admin.")) apiOrigin = "";
      } catch {
        apiOrigin = "";
      }
      if (apiOrigin) {
        const loc = `${apiOrigin}${requestUrl.pathname}${requestUrl.search}`;
        res.writeHead(307, {
          Location: loc,
          "Cache-Control": "no-store",
          "X-KDF-API-Redirect": "kdf-admin-static-to-api",
        });
        res.end();
        return;
      }
    }
  }

  if (isApiPath(pathname)) {
    if (req.method === "OPTIONS") {
      res.writeHead(200, { ...corsHeadersForApiMisroute(req), "Content-Length": "0" }).end();
      return;
    }
    res
      .writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...corsHeadersForApiMisroute(req),
      })
      .end(
        JSON.stringify({
          error: "api_not_served_here",
          message:
            "This response is from the kdf-admin STATIC server (Node), not Express @workspace/api-server. Fix Railway: (1) Remove custom domain api.* from the kdf-admin service; attach api.* only to the api-server service (Dockerfile.api-server). (2) GET /api/widget.js and GET /api/chat-embed on this host 307-redirect to PUBLIC_API_ORIGIN when set—use https://api.<domain>/api/widget.js in Shopify. Deploy logs should show \"Server listening\" (api), not \"[kdf-admin] static\".",
          service: "kdf-admin",
        }),
      );
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }

  /* Canonical URLs: app is built with base /admin/ — bare /dashboard or / breaks wouter routing (black screen). */
  if (basePrefix) {
    const search = requestUrl.search || "";
    if (pathname === "/" || pathname === "") {
      res.writeHead(302, {
        Location: `${basePrefix}/${search}`,
        "Cache-Control": "no-store",
      }).end();
      return;
    }
    const isAsset =
      /\.[a-z0-9]+$/i.test(pathname) ||
      pathname.startsWith("/assets/") ||
      pathname.includes("/assets/");
    if (!isAsset && !pathname.startsWith(basePrefix)) {
      res.writeHead(302, {
        Location: `${basePrefix}${pathname}${search}`,
        "Cache-Control": "no-store",
      }).end();
      return;
    }
  }

  if (pathname === "/healthz" || pathname === "/ready") {
    res
      .writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
      .end(JSON.stringify({ status: "ok", service: "kdf-admin" }));
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

  if (ext === ".html" && isRootSpaIndex(filePath)) {
    res.end(spaIndexHtmlWithInjectedApiOrigin());
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

if (!fs.existsSync(root)) {
  console.error(`[kdf-admin] missing build output: ${root}\nRun: pnpm --filter @workspace/kdf-admin run railway:build`);
  process.exit(1);
}

console.log(`[kdf-admin] boot cwd=${process.cwd()} pkgRoot=${pkgRoot} distExists=${fs.existsSync(root)}`);
console.log(`[kdf-admin] injected API origin for SPA shell: ${runtimePublicApiOrigin()}`);

const server = http.createServer(handler);
server.on("error", (err) => {
  console.error("[kdf-admin] listen error:", err);
  process.exit(1);
});
server.listen(port, "0.0.0.0", () => {
  console.log(
    `[kdf-admin] static ${listenKey}=${port} root=${root} base=${basePrefix || "/"}`,
  );
});
