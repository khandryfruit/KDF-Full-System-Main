import { Router } from "express";
import { db, bannersTable } from "@workspace/db";
import { eq, asc, or, and, isNull } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/** Only columns clients may set — avoids Drizzle rejecting unknown JSON keys. */
const BANNER_WRITABLE_KEYS = new Set([
  "subtitle",
  "imageUrl",
  "mobileImageUrl",
  "linkUrl",
  "targetType",
  "targetId",
  "bgColor",
  "textColor",
  "label",
  "cta",
  "platform",
  "sortOrder",
  "active",
  "countdownEndAt",
  "startDate",
  "endDate",
  "offerProductIds",
  "videoUrl",
  "mobileVideoUrl",
  "videoAutoplay",
  "videoMuted",
  "videoLoop",
]);

function pickWritableBannerFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of BANNER_WRITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  /* Empty string would otherwise be coalesced away and the DB default tailwind
     gradient would apply — hero banners would then be classified as "promo"
     in the admin UI and disappear from the Hero tab. */
  if (out.bgColor === "") {
    out.bgColor = null;
  }
  return out;
}

router.get("/banners", async (req, res) => {
  try {
    const { platform } = req.query;
    const activeFilter = eq(bannersTable.active, true);
    const whereClause = platform
      ? and(
          activeFilter,
          or(
            eq(bannersTable.platform, platform as string),
            eq(bannersTable.platform, "both"),
            isNull(bannersTable.platform)
          )
        )
      : activeFilter;
    const banners = await db
      .select()
      .from(bannersTable)
      .where(whereClause)
      .orderBy(asc(bannersTable.sortOrder));
    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/banners", adminMiddleware as any, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = body.title;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const picked = pickWritableBannerFields(body);
    const [banner] = await db
      .insert(bannersTable)
      .values({ title, ...(picked as any) })
      .returning();
    req.log.info({ bannerId: banner?.id, hasImage: !!picked.imageUrl }, "banner created");
    res.status(201).json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create banner" });
  }
});

router.put("/banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const picked = pickWritableBannerFields(body);
    const [banner] = await db
      .update(bannersTable)
      .set(picked as any)
      .where(eq(bannersTable.id, parseInt(req.params.id)))
      .returning();
    if (!banner) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    req.log.info({ bannerId: banner.id }, "banner updated");
    res.json(banner);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/banners/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(bannersTable).where(eq(bannersTable.id, parseInt(req.params.id)));
    res.json({ success: true, message: "Banner deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
