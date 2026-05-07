import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router: IRouter = Router();

const q = (text: string, values?: any[]) => db.execute(sql.raw(text.replace(/\$(\d+)/g, (_, i) => `$${i}`), values as any));

/** GET /api/blog-ads — public, returns active ad slots */
router.get("/blog-ads", async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM blog_ads ORDER BY id`);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/** GET /api/admin/blog-ads — admin, all slots */
router.get("/admin/blog-ads", adminMiddleware as any, async (_req: Request, res: Response) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM blog_ads ORDER BY id`);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/** PUT /api/admin/blog-ads/:id — admin, update slot */
router.put("/admin/blog-ads/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  const { name, ad_code, is_active } = req.body;
  try {
    const rows = await db.execute(sql`
      UPDATE blog_ads
      SET name=${name}, ad_code=${ad_code}, is_active=${is_active}, updated_at=NOW()
      WHERE id=${id}
      RETURNING *
    `);
    res.json(rows.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/** GET /api/blog-comments?postId=X — public, approved only */
router.get("/blog-comments", async (req: Request, res: Response) => {
  const postId = parseInt(req.query["postId"] as string);
  if (!postId) { res.json([]); return; }
  try {
    const rows = await db.execute(sql`
      SELECT * FROM blog_comments
      WHERE post_id=${postId} AND is_approved=true
      ORDER BY created_at ASC
    `);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/** POST /api/blog-comments — public, submit comment */
router.post("/blog-comments", async (req: Request, res: Response) => {
  const { postId, parentId, name, email, content } = req.body;
  if (!postId || !name?.trim() || !content?.trim()) {
    res.status(400).json({ error: "postId, name, content required" });
    return;
  }
  if (content.length > 2000) { res.status(400).json({ error: "Too long" }); return; }
  try {
    const rows = await db.execute(sql`
      INSERT INTO blog_comments (post_id, parent_id, name, email, content, is_approved)
      VALUES (${postId}, ${parentId || null}, ${name.trim()}, ${email?.trim() || null}, ${content.trim()}, false)
      RETURNING *
    `);
    res.status(201).json({ ...rows.rows[0], pending: true });
  } catch {
    res.status(500).json({ error: "Failed to post comment" });
  }
});

/** POST /api/blog-comments/:id/like — public */
router.post("/blog-comments/:id/like", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.execute(sql`UPDATE blog_comments SET likes=likes+1 WHERE id=${id} AND is_approved=true`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/** GET /api/admin/blog-comments — admin, all comments */
router.get("/admin/blog-comments", adminMiddleware as any, async (req: Request, res: Response) => {
  const postId = req.query["postId"] ? parseInt(req.query["postId"] as string) : null;
  try {
    const rows = postId
      ? await db.execute(sql`SELECT * FROM blog_comments WHERE post_id=${postId} ORDER BY created_at DESC`)
      : await db.execute(sql`SELECT * FROM blog_comments ORDER BY created_at DESC LIMIT 100`);
    res.json(rows.rows);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/** PUT /api/admin/blog-comments/:id/approve */
router.put("/admin/blog-comments/:id/approve", adminMiddleware as any, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.execute(sql`UPDATE blog_comments SET is_approved=true WHERE id=${id}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/** DELETE /api/admin/blog-comments/:id */
router.delete("/admin/blog-comments/:id", adminMiddleware as any, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.execute(sql`DELETE FROM blog_comments WHERE id=${id}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
