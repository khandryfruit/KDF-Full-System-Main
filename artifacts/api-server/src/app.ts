import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import publicInvoiceRouter from "./routes/public-invoice";
import { logger } from "./lib/logger";
import { generateSitemapXml } from "./lib/generateSitemap";
import { generateSlugFromName } from "./lib/slugify";
import { resolveApiPublicDir, resolveSpaDistDir, spaDistReady } from "./lib/resolveStaticDist";
import { db } from "@workspace/db";
import { seoSettingsTable, productsTable, blogPostsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

function escapeXml(str: string): string {
  return (str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getBase(req: Request, canonicalDomain?: string | null): string {
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return (canonicalDomain ?? `${proto}://${host}`).replace(/\/$/, "");
}

// Resolve static dist directories: works when CWD is monorepo root OR
// `artifacts/api-server` (Railway "Root Directory"). See resolveStaticDist.ts.
const adminDist = resolveSpaDistDir("kdf-admin");
const adminAppDist = resolveSpaDistDir("kdf-admin-app");
const mainDist = resolveSpaDistDir("kdf-plus");
const apiPublicDir = resolveApiPublicDir();

if (process.env.NODE_ENV === "production") {
  logger.info(
    {
      cwd: process.cwd(),
      kdfPlus: mainDist,
      kdfPlusReady: spaDistReady(mainDist),
      kdfAdmin: adminDist,
      kdfAdminReady: spaDistReady(adminDist),
      kdfAdminApp: adminAppDist,
      kdfAdminAppReady: spaDistReady(adminAppDist),
      apiPublic: apiPublicDir,
    },
    "Static SPA / public paths resolved (503 on storefront usually means kdfPlusReady is false or wrong CWD)",
  );
}

const prodStaticMaxAge = process.env.NODE_ENV === "production" ? 31_536_000_000 : 0; /* 365d */
const staticOpts = { index: false as const, maxAge: prodStaticMaxAge, immutable: prodStaticMaxAge > 0 };
const adminStatic    = express.static(adminDist,    staticOpts);
const adminAppStatic = express.static(adminAppDist, staticOpts);
const mainStatic     = express.static(mainDist,     staticOpts);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Explicit CORS — allow all origins but require credentials support.
// In production, admin.khanbabadryfruits.com is same-origin with the API,
// so CORS is a no-op for admin traffic. For storefront/mobile cross-origin
// requests we still need permissive headers.
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      // and any browser origin. We rely on JWT auth, not cookies, so wildcard
      // origins are safe.
      cb(null, true);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "X-Request-Id",
      "If-None-Match",
      "If-Modified-Since",
      /* DevTools / tracing (preflight fails if browser sends these but list is fixed) */
      "Baggage",
      "Sentry-Trace",
      "Traceparent",
      "Tracestate",
    ],
    optionsSuccessStatus: 204,
    maxAge: 86400, // preflight cache 24 h
  })
);
// Tell Express it sits behind Railway's TLS-terminating proxy so that
// req.secure / req.ip / X-Forwarded-* work correctly.
app.set("trust proxy", 1);
/* gzip/brotli-compatible compression for JSON + API payloads (Railway-friendly). */
app.use(compression({ threshold: 1024 }));
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

/**
 * ── /admin/api/* → /api/* rewrite ──────────────────────────────────────────
 *
 * On admin.khanbabadryfruits.com (or any hostname where /admin/* serves the
 * kdf-admin SPA), the browser is at /admin/login.  Because the Vite build sets
 * base="/admin/", older code or misconfigured proxies may send API requests to
 * /admin/api/… instead of /api/….
 *
 * This middleware strips the /admin prefix from any path that begins with
 * /admin/api so the existing Express route handlers at /api/* handle them.
 * It MUST run before any /api/* route registrations so the rewrite is visible
 * to those handlers.
 *
 * Examples:
 *   GET  /admin/api/healthz           →  GET  /api/healthz
 *   POST /admin/api/admin-auth/login  →  POST /api/admin-auth/login
 */
app.use((req: Request, _res: Response, next: () => void) => {
  if (req.url.startsWith("/admin/api/") || req.url === "/admin/api") {
    req.url = req.url.slice("/admin".length); // strip leading /admin
  }
  next();
});

/** Serve API server's own public assets (logo, etc.) at /api/static */
app.use("/api/static", express.static(apiPublicDir, { maxAge: 86_400_000, index: false }));

/** Public invoice — also at /api/invoice (must be BEFORE /api router so it isn't swallowed) */
app.use("/api/invoice", publicInvoiceRouter);

app.use("/api", router);

/** Public invoice — clean SEO-friendly URL, no token required */
app.use("/invoice", publicInvoiceRouter);

/** Serve /sitemap.xml directly at root level */
app.get("/sitemap.xml", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(seoSettingsTable).limit(1);
    const settings = rows[0];

    if (settings && !settings.sitemapEnabled) {
      res.status(404).send("Sitemap disabled");
      return;
    }

    const proto = req.headers["x-forwarded-proto"] ?? "https";
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
    const canonical = settings?.canonicalDomain ?? `${proto}://${host}`;

    const xml = await generateSitemapXml(canonical);
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch {
    res.status(500).send("Failed to generate sitemap");
  }
});

/** Serve /sitemap-index.xml — master sitemap */
app.get("/sitemap-index.xml", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(seoSettingsTable).limit(1);
    const base = getBase(req, (rows[0] as any)?.canonicalDomain);
    const today = new Date().toISOString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap.xml</loc><lastmod>${today}</lastmod></sitemap>
  <sitemap><loc>${base}/sitemap-images.xml</loc><lastmod>${today}</lastmod></sitemap>
  <sitemap><loc>${base}/sitemap-news.xml</loc><lastmod>${today}</lastmod></sitemap>
</sitemapindex>`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch { res.status(500).send("Failed to generate sitemap index"); }
});

/** Serve /sitemap-images.xml — image sitemap for Google Image Search */
app.get("/sitemap-images.xml", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(seoSettingsTable).limit(1);
    const base = getBase(req, (rows[0] as any)?.canonicalDomain);
    const products = await db
      .select({ slug: productsTable.slug, name: productsTable.name, images: productsTable.images, altText: productsTable.altText })
      .from(productsTable)
      .where(eq(productsTable.active, true))
      .limit(1000);
    const urls = products.filter(p => p.images && (p.images as string[]).length > 0).map(p => {
      const rawImg = (p.images as string[])[0];
      const imgUrl = rawImg.startsWith("http") ? rawImg : `${base}${rawImg}`;
      return `  <url>
    <loc>${escapeXml(`${base}/products/${p.slug ?? p.name}`)}</loc>
    <image:image>
      <image:loc>${escapeXml(imgUrl)}</image:loc>
      <image:title>${escapeXml(p.name ?? "")}</image:title>
      ${p.altText ? `<image:caption>${escapeXml(p.altText)}</image:caption>` : ""}
    </image:image>
  </url>`;
    }).join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch { res.status(500).send("Failed to generate image sitemap"); }
});

/** Serve /sitemap-news.xml — Google News sitemap for blog posts */
app.get("/sitemap-news.xml", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(seoSettingsTable).limit(1);
    const base = getBase(req, (rows[0] as any)?.canonicalDomain);
    const orgName = (rows[0] as any)?.orgName ?? "KDF NUTS";
    const posts = await db
      .select({ slug: blogPostsTable.slug, title: blogPostsTable.title, updatedAt: blogPostsTable.updatedAt })
      .from(blogPostsTable)
      .where(eq(blogPostsTable.status, "published"))
      .orderBy(desc(blogPostsTable.updatedAt))
      .limit(50);
    const urls = posts.map(p => `  <url>
    <loc>${escapeXml(`${base}/blog/${p.slug}`)}</loc>
    <news:news>
      <news:publication><news:name>${escapeXml(orgName)}</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${new Date(p.updatedAt ?? new Date()).toISOString()}</news:publication_date>
      <news:title>${escapeXml(p.title ?? "")}</news:title>
    </news:news>
  </url>`).join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=1800");
    res.send(xml);
  } catch { res.status(500).send("Failed to generate news sitemap"); }
});

/** Serve /feeds/rss.xml — Blog RSS feed */
app.get("/feeds/rss.xml", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(seoSettingsTable).limit(1);
    const base = getBase(req, (rows[0] as any)?.canonicalDomain);
    const orgName = (rows[0] as any)?.orgName ?? "KDF NUTS";
    const orgEmail = (rows[0] as any)?.orgEmail ?? "";
    const posts = await db
      .select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.status, "published"))
      .orderBy(desc(blogPostsTable.updatedAt))
      .limit(20);
    const items = posts.map(p => `    <item>
      <title>${escapeXml(p.title ?? "")}</title>
      <link>${escapeXml(`${base}/blog/${p.slug}`)}</link>
      <description>${escapeXml((p as any).excerpt ?? p.metaDescription ?? "")}</description>
      <pubDate>${new Date(p.updatedAt ?? new Date()).toUTCString()}</pubDate>
      <guid>${escapeXml(`${base}/blog/${p.slug}`)}</guid>
      ${(p as any).featuredImage ? `<enclosure url="${escapeXml((p as any).featuredImage)}" type="image/jpeg" />` : ""}
    </item>`).join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(orgName)} Blog</title>
    <link>${escapeXml(base)}</link>
    <description>Premium Dry Fruits &amp; Nuts — Tips, Health Benefits, Recipes</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${base}/feeds/rss.xml`)}" rel="self" type="application/rss+xml" />
    ${orgEmail ? `<managingEditor>${escapeXml(orgEmail)}</managingEditor>` : ""}
${items}
  </channel>
</rss>`;
    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch { res.status(500).send("Failed to generate RSS feed"); }
});

/** Serve /robots.txt directly at root level */
app.get("/robots.txt", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(seoSettingsTable).limit(1);
    const settings = rows[0];

    let content: string;

    if (settings?.siteNoindex) {
      content = "User-agent: *\nDisallow: /\n";
    } else if (settings?.robotsTxtContent) {
      content = settings.robotsTxtContent;
    } else {
      const proto = req.headers["x-forwarded-proto"] ?? "https";
      const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
      const canonical = settings?.canonicalDomain ?? `${proto}://${host}`;
      content = `User-agent: *\nAllow: /\n\nSitemap: ${canonical}/sitemap-index.xml\nSitemap: ${canonical}/sitemap.xml\nSitemap: ${canonical}/sitemap-images.xml\n`;
    }

    res.set("Content-Type", "text/plain; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(content);
  } catch {
    res.status(500).send("Failed to generate robots.txt");
  }
});

/**
 * Server-side 301 redirect for unclean product URLs.
 * Handles: /products/Cashews%20nuts%20250g  →  /products/cashews-nuts-250g
 * Works for both KDF NUTS and KDF Plus storefronts (hostname-routed in production,
 * Vite-served in development so this middleware is effectively a no-op in dev).
 * Must come BEFORE the static file catch-all.
 */
app.use((req: Request, res: Response, next: () => void) => {
  // Match only a single slug segment — no slashes allowed inside the slug.
  const match = req.path.match(/^\/products\/([^/]+)$/);
  if (match) {
    let rawSegment: string;
    try {
      rawSegment = decodeURIComponent(match[1]);
    } catch {
      // Malformed percent-encoding — pass through and let the route handler deal with it.
      next();
      return;
    }
    const cleanSlug = generateSlugFromName(rawSegment);
    if (cleanSlug && cleanSlug !== rawSegment) {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      res.redirect(301, `/products/${cleanSlug}${qs}`);
      return;
    }
  }
  next();
});

if (process.env.NODE_ENV === "production") {
  /**
   * ── Admin Panel: PATH-based routing (highest priority, hostname-agnostic) ──
   *
   * khanbabadryfruits.com/admin/*  →  kdf-admin SPA (built with BASE_PATH="/admin/")
   * admin.khanbabadryfruits.com/*  →  kdf-admin SPA (hostname-based, same build)
   *
   * kdf-admin is built with BASE_PATH="/admin/" so all its asset URLs are
   * prefixed with /admin/. Mounting express.static at "/admin" makes Express
   * strip that prefix when looking up files in adminDist:
   *   GET /admin/assets/main.js  →  adminDist/assets/main.js  ✓
   */
  app.use("/admin", adminStatic);
  app.get(["/admin", "/admin/*path"], (req: Request, res: Response) => {
    const indexHtml = path.join(adminDist, "index.html");
    if (existsSync(indexHtml)) {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.sendFile(indexHtml);
    } else {
      res.status(503).send(
        `Admin build not found at ${adminDist}. Ensure kdf-admin is built before deployment.`,
      );
    }
  });

  /**
   * ── kdf-admin-app assets at /app/ prefix ──
   *
   * kdf-admin-app is built with BASE_PATH="/app/" so its HTML references
   * /app/assets/main.js etc. When app.khanbabadryfruits.com loads, the
   * browser requests those assets at /app/...; mounting express.static here
   * makes Express strip the /app prefix and serve from adminAppDist directly:
   *   GET /app/assets/main.js  →  adminAppDist/assets/main.js  ✓
   */
  app.use("/app", adminAppStatic);

  /**
   * ── Storefront catch-all: hostname-based ──
   *
   * khanbabadryfruits.com / www.khanbabadryfruits.com  →  kdf-nuts  (customer storefront)
   * app.khanbabadryfruits.com                          →  kdf-admin-app (built at /app/)
   * admin.khanbabadryfruits.com                        →  kdf-admin  (subdomain alias)
   * everything else (*.replit.app, etc.)               →  kdf-nuts
   *
   * kdf-nuts is built with BASE_PATH="/" so it serves correctly from the root domain.
   * kdf-admin-app is built with BASE_PATH="/app/"; its assets are served above at /app/.
   * By the time a request reaches this middleware, /admin/* and /app/* asset requests
   * have already been handled — this catch-all only serves index.html for SPA routing.
   */
  app.use((req: Request, res: Response) => {
    const rawHost = req.headers["x-forwarded-host"];
    const forwardedHost = Array.isArray(rawHost)
      ? rawHost[0]
      : typeof rawHost === "string"
        ? rawHost.split(",")[0].trim()
        : undefined;
    const hostname = forwardedHost ?? req.hostname ?? "";

    const isAdminSubdomain = hostname.startsWith("admin.");
    const isAdminApp       = hostname === "app.khanbabadryfruits.com";

    const staticMw = isAdminSubdomain ? adminStatic : isAdminApp ? adminAppStatic : mainStatic;
    const distPath = isAdminSubdomain ? adminDist   : isAdminApp ? adminAppDist   : mainDist;

    staticMw(req, res, () => {
      const indexHtml = path.join(distPath, "index.html");
      if (existsSync(indexHtml)) {
        res.set("Cache-Control", "no-cache, no-store, must-revalidate");
        res.set("Pragma", "no-cache");
        res.set("Expires", "0");
        res.sendFile(indexHtml);
      } else {
        res.status(503).send(
          `Static build not found at ${distPath}. Ensure the frontend is built before deployment.`,
        );
      }
    });
  });
}

/**
 * Global JSON error handler — must be the LAST middleware registered.
 *
 * Express's default error handler returns HTML (or an empty body on Railway)
 * when an unhandled error reaches it. This replaces that behaviour with a
 * JSON response so the admin frontend always gets a parseable error object
 * instead of an empty 500 that shows up as "Server returned 500".
 */
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  /* Multer (multipart) — otherwise Express default / empty body confuses the admin UI */
  if (err && err.name === "MulterError" && typeof err.code === "string") {
    if (!res.headersSent) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: "File too large",
          detail: err.message ?? "Reduce file size or raise the server limit.",
        });
        return;
      }
      res.status(400).json({
        error: "Upload rejected",
        detail: err.message ?? String(err),
      });
    }
    return;
  }

  const status = typeof err?.status === "number" ? err.status :
                 typeof err?.statusCode === "number" ? err.statusCode : 500;
  const message = err?.message ?? "Internal server error";

  /* Log at appropriate level — 5xx as error, 4xx as warn */
  if (status >= 500) {
    (req as any).log?.error({ err, status }, "Unhandled error");
  } else {
    (req as any).log?.warn({ err, status }, "Request error");
  }

  if (!res.headersSent) {
    res.status(status).json({ ok: false, error: message });
  }
});

export default app;
