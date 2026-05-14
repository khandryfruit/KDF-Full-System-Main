import { Router } from "express";
import { db } from "@workspace/db";
import {
  footerSettingsTable, footerMenusTable, footerMenuItemsTable,
  policiesTable, appLinksTable, socialLinksTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

/* ─── Public: Get all footer data ────────────────────── */
router.get("/footer", async (req, res) => {
  try {
    const [settings] = await db.select().from(footerSettingsTable).limit(1);
    const menus = await db.select().from(footerMenusTable)
      .where(eq(footerMenusTable.isActive, true))
      .orderBy(asc(footerMenusTable.sortOrder));
    const allItems = await db.select().from(footerMenuItemsTable)
      .where(eq(footerMenuItemsTable.isActive, true))
      .orderBy(asc(footerMenuItemsTable.sortOrder));
    const socialLinks = await db.select().from(socialLinksTable)
      .where(eq(socialLinksTable.isActive, true))
      .orderBy(asc(socialLinksTable.sortOrder));
    const [appLinks] = await db.select().from(appLinksTable).limit(1);
    const policies = await db.select({
      id: policiesTable.id, title: policiesTable.title, slug: policiesTable.slug, isActive: policiesTable.isActive,
    }).from(policiesTable).where(eq(policiesTable.isActive, true));

    const menusWithItems = menus.map(menu => ({
      ...menu,
      items: allItems.filter(item => item.menuId === menu.id),
    }));

    return res.json({ settings: settings ?? null, menus: menusWithItems, socialLinks, appLinks: appLinks ?? null, policies });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Public: Get policy by slug ─────────────────────── */
router.get("/policies/:slug", async (req, res) => {
  try {
    const [policy] = await db.select().from(policiesTable)
      .where(eq(policiesTable.slug, req.params.slug));
    if (!policy || !policy.isActive) return res.status(404).json({ error: "Not found" });
    return res.json(policy);
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

/* ════════════════════════════════════════════════════════
   ADMIN ROUTES
   ════════════════════════════════════════════════════════ */

/* ─── Footer Settings ────────────────────────────────── */
router.get("/admin/footer/settings", adminMiddleware as any, async (req, res) => {
  try {
    const [s] = await db.select().from(footerSettingsTable).limit(1);
    return res.json(s ?? null);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/footer/settings", adminMiddleware as any, async (req, res) => {
  try {
    const { logoPath, description, address, phone, email, copyrightText, isActive, premiumConfig } = req.body;
    const payload = { logoPath, description, address, phone, email, copyrightText, premiumConfig, isActive: isActive ?? true, updatedAt: new Date() };
    const existing = await db.select().from(footerSettingsTable).limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(footerSettingsTable).set(payload).where(eq(footerSettingsTable.id, existing[0]!.id)).returning();
      return res.json(updated);
    }
    const [created] = await db.insert(footerSettingsTable).values({ ...payload }).returning();
    return res.status(201).json(created);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/* ─── Footer Menus ────────────────────────────────────── */
router.get("/admin/footer/menus", adminMiddleware as any, async (req, res) => {
  try {
    const menus = await db.select().from(footerMenusTable).orderBy(asc(footerMenusTable.sortOrder));
    const allItems = await db.select().from(footerMenuItemsTable).orderBy(asc(footerMenuItemsTable.sortOrder));
    return res.json(menus.map(m => ({ ...m, items: allItems.filter(i => i.menuId === m.id) })));
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/footer/menus", adminMiddleware as any, async (req, res) => {
  try {
    const { title, sortOrder, isActive } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const [m] = await db.insert(footerMenusTable).values({ title, sortOrder: sortOrder ?? 0, isActive: isActive ?? true }).returning();
    return res.status(201).json(m);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/footer/menus/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { title, sortOrder, isActive } = req.body;
    const [m] = await db.update(footerMenusTable).set({ title, sortOrder, isActive, updatedAt: new Date() }).where(eq(footerMenusTable.id, parseInt(req.params.id))).returning();
    if (!m) return res.status(404).json({ error: "Not found" });
    return res.json(m);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.delete("/admin/footer/menus/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(footerMenuItemsTable).where(eq(footerMenuItemsTable.menuId, parseInt(req.params.id)));
    await db.delete(footerMenusTable).where(eq(footerMenusTable.id, parseInt(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/* ─── Footer Menu Items ───────────────────────────────── */
router.post("/admin/footer/menu-items", adminMiddleware as any, async (req, res) => {
  try {
    const { menuId, label, linkType, linkValue, openInNewTab, sortOrder, isActive } = req.body;
    if (!menuId || !label || !linkValue) return res.status(400).json({ error: "menuId, label, linkValue required" });
    const [item] = await db.insert(footerMenuItemsTable).values({ menuId, label, linkType: linkType ?? "custom", linkValue, openInNewTab: openInNewTab ?? false, sortOrder: sortOrder ?? 0, isActive: isActive ?? true }).returning();
    return res.status(201).json(item);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/footer/menu-items/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { label, linkType, linkValue, openInNewTab, sortOrder, isActive } = req.body;
    const [item] = await db.update(footerMenuItemsTable).set({ label, linkType, linkValue, openInNewTab, sortOrder, isActive, updatedAt: new Date() }).where(eq(footerMenuItemsTable.id, parseInt(req.params.id))).returning();
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json(item);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.delete("/admin/footer/menu-items/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(footerMenuItemsTable).where(eq(footerMenuItemsTable.id, parseInt(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/* ─── Policies ────────────────────────────────────────── */
router.get("/admin/policies", adminMiddleware as any, async (req, res) => {
  try {
    const rows = await db.select().from(policiesTable).orderBy(asc(policiesTable.id));
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.get("/admin/policies/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [p] = await db.select().from(policiesTable).where(eq(policiesTable.id, parseInt(req.params.id)));
    if (!p) return res.status(404).json({ error: "Not found" });
    return res.json(p);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/policies", adminMiddleware as any, async (req, res) => {
  try {
    const { title, slug, content, metaTitle, metaDescription, isActive } = req.body;
    if (!title || !slug) return res.status(400).json({ error: "title and slug required" });
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const [p] = await db.insert(policiesTable).values({ title, slug: cleanSlug, content: content ?? "", metaTitle, metaDescription, isActive: isActive ?? true }).returning();
    return res.status(201).json(p);
  } catch (e: any) {
    if (e.message?.includes("unique")) return res.status(409).json({ error: "Slug already exists" });
    return res.status(500).json({ error: "Failed" });
  }
});

router.put("/admin/policies/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { title, slug, content, metaTitle, metaDescription, isActive } = req.body;
    const cleanSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g, "-") : undefined;
    const [p] = await db.update(policiesTable).set({ title, slug: cleanSlug, content, metaTitle, metaDescription, isActive, updatedAt: new Date() }).where(eq(policiesTable.id, parseInt(req.params.id))).returning();
    if (!p) return res.status(404).json({ error: "Not found" });
    return res.json(p);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.delete("/admin/policies/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(policiesTable).where(eq(policiesTable.id, parseInt(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/* ─── App Links ───────────────────────────────────────── */
router.get("/admin/footer/app-links", adminMiddleware as any, async (req, res) => {
  try {
    const [a] = await db.select().from(appLinksTable).limit(1);
    return res.json(a ?? null);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/footer/app-links", adminMiddleware as any, async (req, res) => {
  try {
    const {
      androidLink, iosLink, isActive, qrImagePath, downloadCountLabel, androidLabel, iosLabel,
      androidBadgePath, iosBadgePath, showAndroidButton, showIosButton, useOfficialBadges, screenshotPaths,
    } = req.body;
    const payload = {
      androidLink, iosLink, isActive: isActive ?? true,
      qrImagePath, downloadCountLabel, androidLabel, iosLabel,
      androidBadgePath, iosBadgePath,
      showAndroidButton: showAndroidButton ?? true,
      showIosButton: showIosButton ?? true,
      useOfficialBadges: useOfficialBadges ?? true,
      screenshotPaths,
      updatedAt: new Date(),
    };
    const existing = await db.select().from(appLinksTable).limit(1);
    if (existing.length > 0) {
      const [u] = await db.update(appLinksTable).set(payload).where(eq(appLinksTable.id, existing[0]!.id)).returning();
      return res.json(u);
    }
    const [c] = await db.insert(appLinksTable).values(payload).returning();
    return res.status(201).json(c);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/* ─── Social Links ────────────────────────────────────── */
router.get("/admin/footer/social-links", adminMiddleware as any, async (req, res) => {
  try {
    const rows = await db.select().from(socialLinksTable).orderBy(asc(socialLinksTable.sortOrder));
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/footer/social-links", adminMiddleware as any, async (req, res) => {
  try {
    const { platform, url, icon, sortOrder, isActive } = req.body;
    if (!platform || !url) return res.status(400).json({ error: "platform and url required" });
    const [s] = await db.insert(socialLinksTable).values({ platform, url, icon: icon ?? "link", sortOrder: sortOrder ?? 0, isActive: isActive ?? true }).returning();
    return res.status(201).json(s);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/footer/social-links/:id", adminMiddleware as any, async (req, res) => {
  try {
    const { platform, url, icon, sortOrder, isActive } = req.body;
    const [s] = await db.update(socialLinksTable).set({ platform, url, icon, sortOrder, isActive, updatedAt: new Date() }).where(eq(socialLinksTable.id, parseInt(req.params.id))).returning();
    if (!s) return res.status(404).json({ error: "Not found" });
    return res.json(s);
  } catch { return res.status(500).json({ error: "Failed" }); }
});

router.delete("/admin/footer/social-links/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(socialLinksTable).where(eq(socialLinksTable.id, parseInt(req.params.id)));
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

/** Public: newsletter signup (validate only; persist via ESP/CRM when ready) */
router.post("/newsletter-subscribe", async (req, res) => {
  try {
    const email = String((req.body as { email?: string })?.email ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
