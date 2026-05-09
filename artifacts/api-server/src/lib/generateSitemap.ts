import { db } from "@workspace/db";
import { productsTable, categoriesTable, blogPostsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateSlugFromName } from "./slugify";

export async function generateSitemapXml(domain: string): Promise<string> {
  const base = domain.replace(/\/$/, "");

  const [products, categories, posts] = await Promise.all([
    db
      .select({ id: productsTable.id, slug: productsTable.slug, updatedAt: productsTable.updatedAt })
      .from(productsTable)
      .where(eq(productsTable.active, true)),
    db
      .select({ id: categoriesTable.id, slug: categoriesTable.slug, createdAt: categoriesTable.createdAt })
      .from(categoriesTable)
      .where(eq(categoriesTable.active, true)),
    db
      .select({ id: blogPostsTable.id, slug: blogPostsTable.slug, updatedAt: blogPostsTable.updatedAt })
      .from(blogPostsTable)
      .where(eq(blogPostsTable.status, "published")),
  ]);

  const today = new Date().toISOString().split("T")[0];

  const urls: string[] = [
    `  <url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority><lastmod>${today}</lastmod></url>`,
    `  <url><loc>${base}/products</loc><changefreq>daily</changefreq><priority>0.9</priority><lastmod>${today}</lastmod></url>`,
    `  <url><loc>${base}/blog</loc><changefreq>weekly</changefreq><priority>0.8</priority><lastmod>${today}</lastmod></url>`,
  ];

  for (const cat of categories) {
    const lastmod = cat.createdAt
      ? new Date(cat.createdAt).toISOString().split("T")[0]
      : today;
    const cleanSlug = generateSlugFromName(cat.slug) || String(cat.id);
    urls.push(
      `  <url><loc>${base}/category/${cleanSlug}</loc><changefreq>weekly</changefreq><priority>0.7</priority><lastmod>${lastmod}</lastmod></url>`
    );
  }

  for (const product of products) {
    const lastmod = product.updatedAt
      ? new Date(product.updatedAt).toISOString().split("T")[0]
      : today;
    const cleanSlug = generateSlugFromName(product.slug) || String(product.id);
    urls.push(
      `  <url><loc>${base}/products/${cleanSlug}</loc><changefreq>weekly</changefreq><priority>0.8</priority><lastmod>${lastmod}</lastmod></url>`
    );
  }

  for (const post of posts) {
    const lastmod = post.updatedAt
      ? new Date(post.updatedAt).toISOString().split("T")[0]
      : today;
    const cleanSlug = generateSlugFromName(post.slug) || String(post.id);
    urls.push(
      `  <url><loc>${base}/blog/${cleanSlug}</loc><changefreq>monthly</changefreq><priority>0.7</priority><lastmod>${lastmod}</lastmod></url>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}
