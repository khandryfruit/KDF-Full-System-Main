import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { erpSettingsTable, ERP_SECTIONS } from "@workspace/db/schema";
import { adminMiddleware, branchMiddleware } from "../lib/auth";

const router = Router();

const DEFAULT_SETTINGS: Record<string, Record<string, any>> = {
  company: {
    companyName: "KDF NUTS", address: "Lahore, Pakistan",
    phone: "", whatsapp: "", email: "", ntn: "", gst: "",
    logoUrl: "", currency: "Rs", currencySymbol: "₨",
  },
  invoice: {
    prefix: "INV", startNumber: 1, thermalPrint: false,
    thermalSize: "80mm", a4Print: true, showQr: false,
    autoprint: false, showLogo: true, taxRate: 0, taxInclusive: false,
    showTaxBreakdown: false, discountType: "percent",
  },
  branch: {
    allowCreateInvoice: true, allowEditInvoice: true,
    allowDeleteInvoice: false, allowDiscount: true,
    allowViewAnalytics: true, allowInventoryAccess: true,
    allowPosAccess: true,
  },
  pos: {
    barcodeScanner: false, keyboardShortcuts: true, autoPrint: false,
    defaultPayment: "cash", holdInvoice: true, touchMode: false,
    showStockWarning: true,
  },
  stock: {
    kgGramConversion: true, negativeStock: false, lowStockAlert: true,
    lowStockThreshold: 1, autoDeduct: true, warehouseMode: false,
  },
  staff: {
    defaultRole: "cashier", activityLogs: true, sessionTimeout: 480,
    passwordPolicy: "simple",
  },
  backup: {
    autoDailyBackup: false, googleDrive: false, emailBackup: false,
    exportFormat: "json", backupTime: "02:00",
  },
  mobile: {
    bottomNavigation: true, touchMode: true, responsiveControls: true,
    mobilePermissions: true, gestureNavigation: false,
  },
};

/* ── GET /api/admin/erp-settings — all sections ─────────── */
router.get("/", adminMiddleware, async (req, res) => {
  const rows = await db.select().from(erpSettingsTable);
  const result: Record<string, Record<string, any>> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    result[row.section] = { ...(DEFAULT_SETTINGS[row.section] ?? {}), ...(row.settings as Record<string, any>) };
  }
  res.json(result);
});

/* ── GET /api/admin/erp-settings/:section ────────────────── */
router.get("/:section", adminMiddleware, async (req, res) => {
  const { section } = req.params;
  if (!ERP_SECTIONS.includes(section as any)) {
    res.status(400).json({ error: "Unknown section" }); return;
  }
  const [row] = await db.select().from(erpSettingsTable).where(eq(erpSettingsTable.section, section)).limit(1);
  const merged = { ...(DEFAULT_SETTINGS[section] ?? {}), ...(row?.settings ?? {}) };
  res.json({ section, settings: merged });
});

/* ── PUT /api/admin/erp-settings/:section ────────────────── */
router.put("/:section", adminMiddleware, async (req, res) => {
  const { section } = req.params;
  if (!ERP_SECTIONS.includes(section as any)) {
    res.status(400).json({ error: "Unknown section" }); return;
  }
  const newSettings = req.body as Record<string, any>;
  const [existing] = await db.select({ id: erpSettingsTable.id }).from(erpSettingsTable)
    .where(eq(erpSettingsTable.section, section)).limit(1);
  if (existing) {
    await db.update(erpSettingsTable).set({ settings: newSettings, updatedAt: new Date() })
      .where(eq(erpSettingsTable.section, section));
  } else {
    await db.insert(erpSettingsTable).values({ section, settings: newSettings });
  }
  const merged = { ...(DEFAULT_SETTINGS[section] ?? {}), ...newSettings };
  res.json({ section, settings: merged });
});

/* ── GET /api/branch/erp-settings — read-only for branches ── */
router.get("/branch/public", branchMiddleware, async (_req, res) => {
  const rows = await db.select().from(erpSettingsTable);
  const result: Record<string, Record<string, any>> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    result[row.section] = { ...(DEFAULT_SETTINGS[row.section] ?? {}), ...(row.settings as Record<string, any>) };
  }
  res.json(result);
});

export default router;
