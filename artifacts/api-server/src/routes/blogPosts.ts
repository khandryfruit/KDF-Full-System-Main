import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, sql, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { blogPostsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";

const router: IRouter = Router();

/** GET /blog-posts — public (defaults to published only) */
router.get("/blog-posts", async (req: Request, res: Response) => {
  const { status, tag, page = "1", limit = "10" } = req.query as {
    status?: string;
    tag?: string;
    page?: string;
    limit?: string;
  };

  try {
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;

    const conditions: any[] = [];

    const effectiveStatus = status ?? "published";
    conditions.push(eq(blogPostsTable.status, effectiveStatus));

    if (tag) {
      conditions.push(ilike(blogPostsTable.tags, `%${tag}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [posts, [{ count }]] = await Promise.all([
      db
        .select()
        .from(blogPostsTable)
        .where(where)
        .orderBy(desc(blogPostsTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(blogPostsTable)
        .where(where),
    ]);

    res.json({
      posts,
      total: count,
      page: pageNum,
      totalPages: Math.ceil(count / pageSize),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

/** GET /blog-posts/slug/:slug — public, by slug */
router.get("/blog-posts/slug/:slug", async (req: Request, res: Response) => {
  const slug = req.params['slug'] as string;
  try {
    const [post] = await db
      .select()
      .from(blogPostsTable)
      .where(
        and(
          eq(blogPostsTable.slug, slug),
          eq(blogPostsTable.status, "published")
        )
      )
      .limit(1);

    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    await db
      .update(blogPostsTable)
      .set({ views: sql`${blogPostsTable.views} + 1` })
      .where(eq(blogPostsTable.id, post.id));

    res.json({ ...post, views: post.views + 1 });
  } catch {
    res.status(500).json({ error: "Failed to fetch blog post" });
  }
});

/** GET /blog-posts/:id — admin */
router.get(
  "/blog-posts/:id",
  adminMiddleware as any,
  async (req: Request, res: Response) => {
    const id = parseInt(req.params['id'] as string);
    try {
      const [post] = await db
        .select()
        .from(blogPostsTable)
        .where(eq(blogPostsTable.id, id))
        .limit(1);

      if (!post) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      res.json(post);
    } catch {
      res.status(500).json({ error: "Failed to fetch blog post" });
    }
  }
);

/** POST /blog-posts — admin */
router.post(
  "/blog-posts",
  adminMiddleware as any,
  async (req: Request, res: Response) => {
    const {
      title,
      slug,
      content,
      excerpt,
      featuredImagePath,
      metaTitle,
      metaDescription,
      keywords,
      tags,
      status,
    } = req.body;

    try {
      const [post] = await db
        .insert(blogPostsTable)
        .values({
          title,
          slug,
          content: content ?? "",
          excerpt,
          featuredImagePath,
          metaTitle,
          metaDescription,
          keywords,
          tags,
          status: status ?? "draft",
        })
        .returning();
      res.status(201).json(post);
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(409).json({ error: "A post with this slug already exists" });
        return;
      }
      res.status(500).json({ error: "Failed to create blog post" });
    }
  }
);

/** PUT /blog-posts/:id — admin */
router.put(
  "/blog-posts/:id",
  adminMiddleware as any,
  async (req: Request, res: Response) => {
    const id = parseInt(req.params['id'] as string);
    const {
      title,
      slug,
      content,
      excerpt,
      featuredImagePath,
      metaTitle,
      metaDescription,
      keywords,
      tags,
      status,
    } = req.body;

    try {
      const [post] = await db
        .update(blogPostsTable)
        .set({
          ...(title !== undefined && { title }),
          ...(slug !== undefined && { slug }),
          ...(content !== undefined && { content }),
          ...(excerpt !== undefined && { excerpt }),
          ...(featuredImagePath !== undefined && { featuredImagePath }),
          ...(metaTitle !== undefined && { metaTitle }),
          ...(metaDescription !== undefined && { metaDescription }),
          ...(keywords !== undefined && { keywords }),
          ...(tags !== undefined && { tags }),
          ...(status !== undefined && { status }),
          updatedAt: new Date(),
        })
        .where(eq(blogPostsTable.id, id))
        .returning();

      if (!post) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      res.json(post);
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(409).json({ error: "A post with this slug already exists" });
        return;
      }
      res.status(500).json({ error: "Failed to update blog post" });
    }
  }
);

/** DELETE /blog-posts/:id — admin */
router.delete(
  "/blog-posts/:id",
  adminMiddleware as any,
  async (req: Request, res: Response) => {
    const id = parseInt(req.params['id'] as string);
    try {
      await db
        .delete(blogPostsTable)
        .where(eq(blogPostsTable.id, id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete blog post" });
    }
  }
);

export default router;
