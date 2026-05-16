import { Router } from "express";
import { db, bannersTable } from "@workspace/db";
import { eq, ne, asc, or, and, isNull, sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/** Only columns clients may set — avoids Drizzle rejecting unknown JSON keys. */
const BANNER_WRITABLE_KEYS = new Set([
  "title",
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
  "offerCategoryIds",
  "offerMode",
  "offerDisplayCount",
  "offerSort",
  "showTimer",
  "buttonBgColor",
  "buttonTextColor",
  "videoUrl",
  "mobileVideoUrl",
  "videoAutoplay",
  "videoMuted",
  "videoLoop",
  "placement",
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

let countdownColumnsReady = false;
async function ensureCountdownBannerColumns(): Promise<void> {
  if (countdownColumnsReady) return;
  const statements = [
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_category_ids" jsonb DEFAULT '[]'::jsonb`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_mode" text NOT NULL DEFAULT 'discount_products'`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_display_count" integer NOT NULL DEFAULT 8`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "offer_sort" text NOT NULL DEFAULT 'featured'`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "show_timer" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "button_bg_color" text`,
    `ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "button_text_color" text`,
  ];
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
  countdownColumnsReady = true;
}

function needsCountdownColumns(payload: Record<string, unknown>): boolean {
  return payload.placement === "countdown_deal"
    || "offerCategoryIds" in payload
    || "offerMode" in payload
    || "offerDisplayCount" in payload
    || "offerSort" in payload
    || "showTimer" in payload
    || "buttonBgColor" in payload
    || "buttonTextColor" in payload;
}

router.get("/banners", async (req, res) => {
  try {
    await ensureCountdownBannerColumns();
    const { platform, placement } = req.query;
    const now = new Date();
    const activeFilter = eq(bannersTable.active, true);
    const conditions: unknown[] = [];
    if (platform || placement) {
      conditions.push(
        activeFilter,
        or(isNull(bannersTable.startDate), sql`${bannersTable.startDate} <= ${now}`),
        or(isNull(bannersTable.endDate), sql`${bannersTable.endDate} >= ${now}`),
      );
    }
    if (platform) {
      conditions.push(
        or(
          eq(bannersTable.platform, platform as string),
          eq(bannersTable.platform, "both"),
          isNull(bannersTable.platform),
        ),
      );
    }
    if (placement && typeof placement === "string") {
      /* Home hero carousel: include true heroes plus any row with real media that is
         not the header strip (fixes rows wrongly tagged `promo` by older migrations). */
      if (placement === "hero") {
        const hasBannerMedia = sql`(
          length(trim(coalesce(${bannersTable.imageUrl}, ''))) > 0
          or length(trim(coalesce(${bannersTable.mobileImageUrl}, ''))) > 0
          or length(trim(coalesce(${bannersTable.videoUrl}, ''))) > 0
          or length(trim(coalesce(${bannersTable.mobileVideoUrl}, ''))) > 0
        )`;
        conditions.push(
          or(eq(bannersTable.placement, "hero"), and(ne(bannersTable.placement, "header"), ne(bannersTable.placement, "countdown_deal"), hasBannerMedia)),
        );
      } else {
        conditions.push(eq(bannersTable.placement, placement));
      }
    }
    const baseQuery = db.select().from(bannersTable);
    const banners = await (conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] as any : and(...(conditions as any)))
      : baseQuery
    ).orderBy(asc(bannersTable.sortOrder));
    res.set("Cache-Control", "public, max-age=20, s-maxage=45, stale-while-revalidate=180");
    res.json(banners);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/banners", adminMiddleware as any, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const picked = pickWritableBannerFields(body);
    const title = body.title;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (needsCountdownColumns(picked)) {
      await ensureCountdownBannerColumns();
    }
    const [banner] = await db
      .insert(bannersTable)
      .values({ ...(picked as any), title } as any)
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
    if (needsCountdownColumns(picked)) {
      await ensureCountdownBannerColumns();
    }
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
