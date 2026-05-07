import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { headerSettingsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";

const router: IRouter = Router();

const DEFAULT_NAV_ITEMS = JSON.stringify([
  { id: "1", label: "All Products", href: "/products", badge: null, enabled: true },
  { id: "2", label: "Dry Fruits", href: "/category/dry-fruits", badge: null, enabled: true },
  { id: "3", label: "Nuts", href: "/category/nuts", badge: null, enabled: true },
  { id: "4", label: "Seeds", href: "/category/seeds", badge: null, enabled: true },
  { id: "5", label: "Organic", href: "/category/organic", badge: null, enabled: true },
  { id: "6", label: "Deals 🔥", href: "/deals", badge: "hot", enabled: true },
  { id: "7", label: "New Arrivals ✨", href: "/new-arrivals", badge: "new", enabled: true },
  { id: "8", label: "Best Sellers ⭐", href: "/best-sellers", badge: "top", enabled: true },
  { id: "9", label: "Blog", href: "/blog", badge: null, enabled: true },
  { id: "10", label: "Track Order", href: "/track-order", badge: null, enabled: true },
]);

const DEFAULT_TRUST_STRIP = JSON.stringify([
  { id: "1", icon: "🚚", text: "Free Delivery Rs.1500+" },
  { id: "2", icon: "✅", text: "100% Fresh" },
  { id: "3", icon: "🔁", text: "Easy Returns" },
  { id: "4", icon: "📞", text: "24/7 Support" },
]);

const DEFAULT_TOP_BAR_SLIDES = JSON.stringify([
  { id: "1", text: "🚚 Free delivery on orders above Rs. 1,500 — Order now!", link: "" },
  { id: "2", text: "🌟 Fresh stock: Cashews, Pistachios & Almonds — Shop now!", link: "" },
]);

async function getOrCreate() {
  const rows = await db.select().from(headerSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [inserted] = await db
    .insert(headerSettingsTable)
    .values({
      navItems: DEFAULT_NAV_ITEMS,
      trustStripItems: DEFAULT_TRUST_STRIP,
      topBarSlides: DEFAULT_TOP_BAR_SLIDES,
    })
    .returning();
  return inserted;
}

/** GET /header-settings — public */
router.get("/header-settings", async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreate();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch header settings" });
  }
});

/** GET /admin/header-settings */
router.get("/admin/header-settings", adminMiddleware as any, async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreate();
    res.json(settings);
  } catch {
    res.status(500).json({ error: "Failed to fetch header settings" });
  }
});

/** PUT /admin/header-settings */
router.put("/admin/header-settings", adminMiddleware as any, async (req: Request, res: Response) => {
  try {
    const existing = await getOrCreate();
    const allowed = [
      "logoPosition", "showSearch", "searchWidth", "menuPosition", "stickyHeader", "headerHeight",
      "primaryColor", "backgroundColor", "textColor", "navBgColor", "navTextColor",
      "showTopBar", "topBarText", "topBarBgColor", "topBarTextColor", "topBarAnimation", "topBarSpeed", "topBarSlides",
      "navItems",
      "showCart", "showAccount", "showTrackOrder", "showLocationSelector", "showWhatsapp", "whatsappNumber",
      "showTrustStrip", "trustStripItems",
      "showMobileSearch", "showStickyBottomBar", "mobileMenuType", "showMobileCategories",
      "borderRadius", "showShadow", "showBorder",
    ] as const;

    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const [updated] = await db
      .update(headerSettingsTable)
      .set(updates)
      .where(eq(headerSettingsTable.id, existing.id))
      .returning();

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update header settings" });
  }
});

/** POST /admin/header-settings/reset */
router.post("/admin/header-settings/reset", adminMiddleware as any, async (_req: Request, res: Response) => {
  try {
    const existing = await getOrCreate();
    await db.delete(headerSettingsTable).where(eq(headerSettingsTable.id, existing.id));
    const fresh = await getOrCreate();
    res.json(fresh);
  } catch {
    res.status(500).json({ error: "Failed to reset header settings" });
  }
});

export default router;
