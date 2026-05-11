/**
 * Express SSR middleware for kdf-nuts product pages.
 *
 * In production (after `vite build --ssr`), loads the built SSR entry module,
 * pre-fetches product data from the DB, renders to HTML, injects meta tags,
 * and sends the fully-formed page for Googlebot to crawl.
 *
 * In development, falls through to the Vite dev server (CSR only).
 *
 * Routes handled:
 *   GET /products/:slug  → full SSR with product schema + OG tags
 *   GET /products        → product listing SSR
 *
 * All other routes → pass-through (CSR SPA shell).
 */

import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "./logger";

const STOREFRONT_DIST = path.resolve(process.cwd(), "dist/kdf-nuts/public");
const SSR_DIST        = path.resolve(process.cwd(), "dist/kdf-nuts/server");

let ssrModule: any = null;
let htmlTemplate: string = "";

async function loadSsrModule() {
  if (ssrModule) return ssrModule;
  const entryPath = path.join(SSR_DIST, "entry-server.js");
  if (!fs.existsSync(entryPath)) return null;
  try {
    ssrModule = await import(entryPath);
    return ssrModule;
  } catch (err: any) {
    logger.warn({ err: err.message }, "SSR module load failed — falling back to CSR");
    return null;
  }
}

function loadHtmlTemplate(): string {
  if (htmlTemplate) return htmlTemplate;
  const p = path.join(STOREFRONT_DIST, "index.html");
  if (!fs.existsSync(p)) return "";
  htmlTemplate = fs.readFileSync(p, "utf-8");
  return htmlTemplate;
}

function injectMeta(template: string, meta: {
  title: string; description: string; ogImage?: string; canonical: string;
}, appHtml: string, dehydrated: any, schema?: Record<string, any>): string {
  const og = meta.ogImage
    ? `<meta property="og:image" content="${meta.ogImage}" />`
    : "";
  const schemaTag = schema
    ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
    : "";
  const dehydratedTag = `<script>window.__REACT_QUERY_STATE__ = ${JSON.stringify(dehydrated)};</script>`;

  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${meta.description.replace(/"/g, "&quot;")}" />`
    )
    .replace("</head>",
      `<link rel="canonical" href="${meta.canonical}" />`
      + `<meta property="og:title" content="${meta.title}" />`
      + `<meta property="og:description" content="${meta.description.replace(/"/g, "&quot;")}" />`
      + `<meta property="og:url" content="${meta.canonical}" />`
      + `<meta property="og:type" content="website" />`
      + og
      + schemaTag
      + dehydratedTag
      + "</head>"
    )
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
}

/** Fetch product from DB by slug or numeric ID */
async function fetchProductForSsr(slugOrId: string): Promise<any | null> {
  try {
    const id = parseInt(slugOrId);
    const conditions: any[] = [eq(productsTable.slug, slugOrId)];
    if (!isNaN(id)) conditions.push(eq(productsTable.id, id));

    const rows = await db.select({
      id:          productsTable.id,
      name:        productsTable.name,
      slug:        productsTable.slug,
      description: productsTable.description,
      price:       productsTable.price,
      images:      productsTable.images,
      stock:       productsTable.stock,
      categoryId:  productsTable.categoryId,
    }).from(productsTable).where(or(...conditions)).limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Express middleware — attach to the storefront Express app before its static file handler.
 * Only activates for GET requests matching SSR routes. Falls through in dev mode.
 */
export async function ssrMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  /* Only handle GET requests to product routes */
  if (req.method !== "GET") { next(); return; }
  if (!req.path.startsWith("/products")) { next(); return; }

  /* Dev mode — no SSR bundle available, fall through to Vite dev server */
  if (process.env.NODE_ENV !== "production") { next(); return; }

  const mod = await loadSsrModule();
  if (!mod) { next(); return; }

  const template = loadHtmlTemplate();
  if (!template) { next(); return; }

  try {
    /* Prefetch data for product detail pages */
    const productSlugMatch = req.path.match(/^\/products\/([^/?]+)/);
    let prefetchedData: Record<string, any> | undefined;

    if (productSlugMatch) {
      const product = await fetchProductForSsr(productSlugMatch[1]);
      if (product) {
        /* Key matches what TanStack Query uses on the client */
        const qKey = JSON.stringify(["/api/products", product.slug]);
        prefetchedData = { [qKey]: product };
      }
    }

    const { html, meta, dehydrated } = await mod.render(req.path, prefetchedData);
    const product = prefetchedData ? Object.values(prefetchedData)[0] as any : null;

    const finalHtml = injectMeta(template, meta, html, dehydrated, product ? (await mod.render(req.path, prefetchedData)).meta.schema : undefined);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.send(finalHtml);
  } catch (err: any) {
    logger.warn({ err: err.message, path: req.path }, "SSR render failed — falling back to CSR shell");
    const template2 = loadHtmlTemplate();
    if (template2) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(template2);
    } else {
      next();
    }
  }
}
