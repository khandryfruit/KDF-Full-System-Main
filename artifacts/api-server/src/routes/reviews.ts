import { Router } from "express";
import { db } from "@workspace/db";
import { productReviewsTable, productsTable } from "@workspace/db/schema";
import { eq, and, avg, count, desc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/* ── Public: get approved reviews for a product ── */
router.get("/products/:id/reviews", async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ error: "Invalid product id" });

  const reviews = await db
    .select()
    .from(productReviewsTable)
    .where(and(eq(productReviewsTable.productId, productId), eq(productReviewsTable.approved, true)))
    .orderBy(desc(productReviewsTable.createdAt));

  return res.json(reviews);
});

/* ── Public: submit a review ── */
router.post("/products/:id/reviews", async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ error: "Invalid product id" });

  const { name, email, rating, comment, images } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length < 2)
    return res.status(400).json({ error: "Name must be at least 2 characters" });
  if (!comment || typeof comment !== "string" || comment.trim().length < 5)
    return res.status(400).json({ error: "Comment must be at least 5 characters" });
  const ratingNum = Number(rating);
  if (!ratingNum || ratingNum < 1 || ratingNum > 5 || !Number.isInteger(ratingNum))
    return res.status(400).json({ error: "Rating must be 1–5" });

  const imageList: string[] = Array.isArray(images)
    ? images.filter((i: unknown) => typeof i === "string").slice(0, 5)
    : [];

  const [review] = await db
    .insert(productReviewsTable)
    .values({ productId, name: name.trim(), email: email || null, rating: ratingNum, comment: comment.trim(), images: imageList, approved: false })
    .returning();

  return res.status(201).json({ ok: true, review });
});

/* ── Admin: list all reviews (with product name) ── */
router.get("/admin/reviews", adminMiddleware as any, async (req, res) => {
  const reviews = await db
    .select({
      id: productReviewsTable.id,
      productId: productReviewsTable.productId,
      productName: productsTable.name,
      name: productReviewsTable.name,
      email: productReviewsTable.email,
      rating: productReviewsTable.rating,
      comment: productReviewsTable.comment,
      approved: productReviewsTable.approved,
      createdAt: productReviewsTable.createdAt,
    })
    .from(productReviewsTable)
    .leftJoin(productsTable, eq(productReviewsTable.productId, productsTable.id))
    .orderBy(desc(productReviewsTable.createdAt));

  return res.json(reviews);
});

/* ── Admin: approve a review ── */
router.put("/admin/reviews/:id/approve", adminMiddleware as any, async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(productReviewsTable)
    .set({ approved: true })
    .where(eq(productReviewsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Review not found" });
  await recalculateProductRating(updated.productId);
  return res.json({ ok: true });
});

/* ── Admin: reject (unapprove) a review ── */
router.put("/admin/reviews/:id/reject", adminMiddleware as any, async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(productReviewsTable)
    .set({ approved: false })
    .where(eq(productReviewsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Review not found" });
  await recalculateProductRating(updated.productId);
  return res.json({ ok: true });
});

/* ── Admin: delete a review ── */
router.delete("/admin/reviews/:id", adminMiddleware as any, async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(productReviewsTable)
    .where(eq(productReviewsTable.id, id))
    .returning();

  if (!deleted) return res.status(404).json({ error: "Review not found" });
  await recalculateProductRating(deleted.productId);
  return res.json({ ok: true });
});

/* ── Helper: recompute product rating & reviewCount ── */
async function recalculateProductRating(productId: number) {
  const [stats] = await db
    .select({
      avgRating: avg(productReviewsTable.rating),
      total: count(productReviewsTable.id),
    })
    .from(productReviewsTable)
    .where(and(eq(productReviewsTable.productId, productId), eq(productReviewsTable.approved, true)));

  const newRating = stats?.avgRating ? Number(stats.avgRating).toFixed(1) : null;
  const newCount = Number(stats?.total ?? 0);

  await db
    .update(productsTable)
    .set({ rating: newRating, reviewCount: newCount })
    .where(eq(productsTable.id, productId));
}

export default router;
