import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync, statSync } from "fs";
import router from "./routes";
import publicInvoiceRouter from "./routes/public-invoice";
import { logger } from "./lib/logger";
import { generateSitemapXml } from "./lib/generateSitemap";
import { db } from "@workspace/db";
import { seoSettingsTable } from "@workspace/db/schema";

// Resolve static dist directories from project root
const adminDist   = path.resolve(process.cwd(), "artifacts/kdf-admin/dist/public");
const mainDist    = path.resolve(process.cwd(), "artifacts/kdf-plus/dist/public");
const nutsDist    = path.resolve(process.cwd(), "artifacts/kdf-nuts/dist/public");
const apiPublicDir = path.resolve(process.cwd(), "artifacts/api-server/public");

const adminStatic = express.static(adminDist,    { index: false });
const mainStatic  = express.static(mainDist,     { index: false });
const nutsStatic  = express.static(nutsDist,     { index: false });

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
 * Hostname-based static file serving (production only, catch-all — must be last).
 *
 * admin.*                  → serve kdf-admin build (built with BASE_PATH="/")
 * khanbabadryfruits.com    → serve kdf-nuts  build (built with BASE_PATH="/")
 * everything else          → serve kdf-plus  build (built with BASE_PATH="/")
 *
 * In development the individual Vite dev servers handle static serving via
 * the proxy's path routing, so this middleware is skipped entirely.
 */
if (process.env.NODE_ENV === "production") {
  app.use((req: Request, res: Response) => {
    // x-forwarded-host may be a comma-separated list; use the first entry.
    const rawHost = req.headers["x-forwarded-host"];
    const forwardedHost = Array.isArray(rawHost)
      ? rawHost[0]
      : typeof rawHost === "string"
        ? rawHost.split(",")[0].trim()
        : undefined;
    const hostname = forwardedHost ?? req.hostname ?? "";
    const isAdmin = hostname.startsWith("admin.");
    const isKhanbaba = hostname === "khanbabadryfruits.com" || hostname === "www.khanbabadryfruits.com";

    const staticMw = isAdmin ? adminStatic : isKhanbaba ? nutsStatic : mainStatic;
    const distPath = isAdmin ? adminDist   : isKhanbaba ? nutsDist   : mainDist;

    staticMw(req, res, () => {
      const indexHtml = path.join(distPath, "index.html");
      if (existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res
          .status(503)
          .send(
            `Static build not found at ${distPath}. Ensure the frontend is built before deployment.`,
          );
      }
    });
  });
}

export default app;
