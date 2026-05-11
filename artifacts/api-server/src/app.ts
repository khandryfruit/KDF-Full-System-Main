import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import publicInvoiceRouter from "./routes/public-invoice";
import { logger } from "./lib/logger";
import { generateSitemapXml } from "./lib/generateSitemap";
import { generateSlugFromName } from "./lib/slugify";
import { db } from "@workspace/db";
import { seoSettingsTable } from "@workspace/db/schema";

// Resolve static dist directories from project root
const adminDist    = path.resolve(process.cwd(), "artifacts/kdf-admin/dist/public");
const adminAppDist = path.resolve(process.cwd(), "artifacts/kdf-admin-app/dist/public");
const mainDist     = path.resolve(process.cwd(), "artifacts/kdf-plus/dist/public");
const apiPublicDir = path.resolve(process.cwd(), "artifacts/api-server/public");

const adminStatic    = express.static(adminDist,    { index: false });
const adminAppStatic = express.static(adminAppDist, { index: false });
const mainStatic     = express.static(mainDist,     { index: false });

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
app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

/** Serve API server's own public assets (logo, etc.) at /api/static */
app.use("/api/static", express.static(apiPublicDir));

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
      content = `User-agent: *\nAllow: /\n\nSitemap: ${canonical}/sitemap.xml\n`;
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
  app.use("/admin", express.static(adminDist, { index: false }));
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
   * ── Storefront catch-all: hostname-based ──
   *
   * khanbabadryfruits.com / www.khanbabadryfruits.com  →  kdf-plus  (primary customer storefront)
   * app.khanbabadryfruits.com                          →  kdf-admin-app
   * admin.khanbabadryfruits.com                        →  kdf-admin  (subdomain alias)
   * everything else (*.replit.app, etc.)               →  kdf-plus
   *
   * kdf-plus is built with BASE_PATH="/" so it serves correctly from domain root.
   * By the time a request reaches this middleware, /admin/* has already been
   * handled above — so this only serves non-admin paths.
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

export default app;
