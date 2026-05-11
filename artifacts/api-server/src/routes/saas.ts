import { Router, type Request, type Response } from "express";
import { eq, desc, count, sql, and, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  saasPlanFeaturesType,
  saasPlansTable,
  saasSuperAdminsTable,
  saasTenantTable,
  saasThemeSettingsTable,
  saasActivityLogTable,
  type SaasPlanFeatures,
  type SaasTenantStatus,
  type SaasTemplateId,
} from "@workspace/db/schema";
import {
  hashPassword, comparePassword, verifyToken, signToken,
  type AuthRequest,
} from "../lib/auth.js";
import { logger } from "../lib/logger.js";

export const saasRouter = Router();

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function saasAdminAuth(req: Request, res: Response, next: Function): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const payload = verifyToken(auth.slice(7));
    if (payload.role !== "saas_admin") { res.status(403).json({ error: "Forbidden" }); return; }
    (req as any).saasAdmin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function logActivity(opts: {
  tenantId?: number | null;
  actorType: "super_admin" | "tenant";
  actorId?: number;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, any>;
  ip?: string;
}) {
  try {
    await db.insert(saasActivityLogTable).values({
      tenantId: opts.tenantId ?? null,
      actorType: opts.actorType,
      actorId: opts.actorId ?? null,
      action: opts.action,
      entity: opts.entity ?? null,
      entityId: opts.entityId ?? null,
      meta: opts.meta ?? {},
      ip: opts.ip ?? null,
    });
  } catch (e) {
    logger.error({ err: e }, "Activity log failed");
  }
}

/* ══════════════════════════════════════════════════════════
   SUPER ADMIN AUTH
══════════════════════════════════════════════════════════ */

/* POST /api/saas/admin/login */
saasRouter.post("/saas/admin/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
  const [admin] = await db.select().from(saasSuperAdminsTable).where(eq(saasSuperAdminsTable.email, email.toLowerCase())).limit(1);
  if (!admin || !admin.isActive) { res.status(401).json({ error: "Invalid credentials" }); return; }
  const ok = await comparePassword(password, admin.passwordHash);
  if (!ok) { res.status(401).json({ error: "Invalid credentials" }); return; }
  await db.update(saasSuperAdminsTable).set({ lastLoginAt: new Date() }).where(eq(saasSuperAdminsTable.id, admin.id));
  const token = signToken({ id: admin.id, role: "saas_admin" });
  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});

/* POST /api/saas/admin/seed  — create first super admin (only when none exist) */
saasRouter.post("/saas/admin/seed", async (req, res) => {
  const existing = await db.select({ id: saasSuperAdminsTable.id }).from(saasSuperAdminsTable).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: "Super admin already exists" }); return; }
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password) { res.status(400).json({ error: "name, email, password required" }); return; }
  const passwordHash = await hashPassword(password);
  const [admin] = await db.insert(saasSuperAdminsTable).values({ name, email: email.toLowerCase(), passwordHash, isActive: true }).returning();
  const token = signToken({ id: admin.id, role: "saas_admin" });
  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});

/* GET /api/saas/admin/me */
saasRouter.get("/saas/admin/me", saasAdminAuth, async (req, res) => {
  const id = (req as any).saasAdmin.id;
  const [admin] = await db.select({ id: saasSuperAdminsTable.id, name: saasSuperAdminsTable.name, email: saasSuperAdminsTable.email }).from(saasSuperAdminsTable).where(eq(saasSuperAdminsTable.id, id)).limit(1);
  if (!admin) { res.status(404).json({ error: "Not found" }); return; }
  res.json(admin);
});

/* ══════════════════════════════════════════════════════════
   PLANS
══════════════════════════════════════════════════════════ */

/* GET /api/saas/admin/plans */
saasRouter.get("/saas/admin/plans", saasAdminAuth, async (_req, res) => {
  const plans = await db.select().from(saasPlansTable).orderBy(saasPlansTable.displayOrder);
  res.json(plans);
});

/* GET /api/saas/plans  (public — for signup page) */
saasRouter.get("/saas/plans", async (_req, res) => {
  const plans = await db.select().from(saasPlansTable).where(eq(saasPlansTable.isActive, true)).orderBy(saasPlansTable.displayOrder);
  res.json(plans);
});

/* POST /api/saas/admin/plans */
saasRouter.post("/saas/admin/plans", saasAdminAuth, async (req, res) => {
  const body = req.body ?? {};
  const { name, tier, description, priceMonthly, priceYearly, features, trialDays, badgeLabel, color, displayOrder } = body;
  if (!name || !tier) { res.status(400).json({ error: "name and tier required" }); return; }
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  const [plan] = await db.insert(saasPlansTable).values({
    name, slug, tier, description, priceMonthly: priceMonthly ?? "0", priceYearly: priceYearly ?? "0",
    features: features ?? {}, trialDays: trialDays ?? 14, badgeLabel, color, displayOrder: displayOrder ?? 0,
  }).returning();
  res.json(plan);
});

/* PUT /api/saas/admin/plans/:id */
saasRouter.put("/saas/admin/plans/:id", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, tier, description, priceMonthly, priceYearly, features, isActive, trialDays, badgeLabel, color, displayOrder } = req.body ?? {};
  const [plan] = await db.update(saasPlansTable).set({
    ...(name !== undefined && { name }),
    ...(tier !== undefined && { tier }),
    ...(description !== undefined && { description }),
    ...(priceMonthly !== undefined && { priceMonthly }),
    ...(priceYearly !== undefined && { priceYearly }),
    ...(features !== undefined && { features }),
    ...(isActive !== undefined && { isActive }),
    ...(trialDays !== undefined && { trialDays }),
    ...(badgeLabel !== undefined && { badgeLabel }),
    ...(color !== undefined && { color }),
    ...(displayOrder !== undefined && { displayOrder }),
    updatedAt: new Date(),
  }).where(eq(saasPlansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(plan);
});

/* DELETE /api/saas/admin/plans/:id */
saasRouter.delete("/saas/admin/plans/:id", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db.update(saasPlansTable).set({ isActive: false, updatedAt: new Date() }).where(eq(saasPlansTable.id, id));
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════
   TENANTS
══════════════════════════════════════════════════════════ */

/* GET /api/saas/admin/tenants */
saasRouter.get("/saas/admin/tenants", saasAdminAuth, async (req, res) => {
  const { search, status, industry, planId } = req.query as Record<string, string>;
  const where: any[] = [];
  if (search) where.push(or(ilike(saasTenantTable.storeName, `%${search}%`), ilike(saasTenantTable.email, `%${search}%`)));
  if (status) where.push(eq(saasTenantTable.status, status as SaasTenantStatus));
  if (industry) where.push(eq(saasTenantTable.industry, industry as any));
  if (planId) where.push(eq(saasTenantTable.planId, Number(planId)));

  const tenants = await db
    .select({
      id: saasTenantTable.id,
      name: saasTenantTable.name,
      email: saasTenantTable.email,
      storeName: saasTenantTable.storeName,
      storeSlug: saasTenantTable.storeSlug,
      industry: saasTenantTable.industry,
      status: saasTenantTable.status,
      planId: saasTenantTable.planId,
      ownerName: saasTenantTable.ownerName,
      ownerPhone: saasTenantTable.ownerPhone,
      customDomain: saasTenantTable.customDomain,
      subdomain: saasTenantTable.subdomain,
      logoUrl: saasTenantTable.logoUrl,
      trialEndsAt: saasTenantTable.trialEndsAt,
      createdAt: saasTenantTable.createdAt,
      updatedAt: saasTenantTable.updatedAt,
      planName: saasPlansTable.name,
      planTier: saasPlansTable.tier,
    })
    .from(saasTenantTable)
    .leftJoin(saasPlansTable, eq(saasTenantTable.planId, saasPlansTable.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(saasTenantTable.createdAt));

  res.json(tenants);
});

/* GET /api/saas/admin/tenants/:id */
saasRouter.get("/saas/admin/tenants/:id", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [tenant] = await db
    .select()
    .from(saasTenantTable)
    .leftJoin(saasPlansTable, eq(saasTenantTable.planId, saasPlansTable.id))
    .where(eq(saasTenantTable.id, id))
    .limit(1);
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  const theme = await db.select().from(saasThemeSettingsTable).where(eq(saasThemeSettingsTable.tenantId, id)).limit(1);
  res.json({ ...tenant.saas_tenants, plan: tenant.saas_plans, theme: theme[0] ?? null });
});

/* POST /api/saas/admin/tenants  (admin creates a tenant) */
saasRouter.post("/saas/admin/tenants", saasAdminAuth, async (req, res) => {
  const body = req.body ?? {};
  const { name, email, password, storeName, industry, planId, ownerName, ownerPhone, notes, featureOverrides, subdomain } = body;
  if (!name || !email || !password || !storeName) { res.status(400).json({ error: "name, email, password, storeName required" }); return; }
  const storeSlug = storeName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const passwordHash = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + 14 * 86400_000);
  const [tenant] = await db.insert(saasTenantTable).values({
    name, email: email.toLowerCase(), passwordHash, storeName, storeSlug, slug: storeSlug,
    industry: industry ?? "other", planId: planId ?? null, ownerName, ownerPhone, notes,
    featureOverrides: featureOverrides ?? {}, subdomain: subdomain ?? storeSlug,
    status: "trial", trialEndsAt,
  }).returning();
  await logActivity({ actorType: "super_admin", action: "create_tenant", entity: "tenant", entityId: String(tenant.id), meta: { email, storeName } });
  res.json(tenant);
});

/* PUT /api/saas/admin/tenants/:id */
saasRouter.put("/saas/admin/tenants/:id", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body ?? {};
  const {
    name, email, storeName, industry, planId, status, ownerName, ownerPhone,
    notes, featureOverrides, customDomain, domainVerified, subdomain,
    settings, contact, logoUrl, faviconUrl, suspendReason,
  } = body;
  const [tenant] = await db.update(saasTenantTable).set({
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email: email.toLowerCase() }),
    ...(storeName !== undefined && { storeName }),
    ...(industry !== undefined && { industry }),
    ...(planId !== undefined && { planId }),
    ...(status !== undefined && { status }),
    ...(ownerName !== undefined && { ownerName }),
    ...(ownerPhone !== undefined && { ownerPhone }),
    ...(notes !== undefined && { notes }),
    ...(featureOverrides !== undefined && { featureOverrides }),
    ...(customDomain !== undefined && { customDomain }),
    ...(domainVerified !== undefined && { domainVerified }),
    ...(subdomain !== undefined && { subdomain }),
    ...(settings !== undefined && { settings }),
    ...(contact !== undefined && { contact }),
    ...(logoUrl !== undefined && { logoUrl }),
    ...(faviconUrl !== undefined && { faviconUrl }),
    ...(suspendReason !== undefined && { suspendReason }),
    ...(status === "suspended" && { suspendedAt: new Date() }),
    updatedAt: new Date(),
  }).where(eq(saasTenantTable.id, id)).returning();
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  await logActivity({ actorType: "super_admin", action: "update_tenant", entity: "tenant", entityId: String(id), meta: { fields: Object.keys(body) } });
  res.json(tenant);
});

/* DELETE /api/saas/admin/tenants/:id  (soft — set cancelled) */
saasRouter.delete("/saas/admin/tenants/:id", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db.update(saasTenantTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(saasTenantTable.id, id));
  await logActivity({ actorType: "super_admin", action: "cancel_tenant", entity: "tenant", entityId: String(id) });
  res.json({ ok: true });
});

/* POST /api/saas/admin/tenants/:id/suspend */
saasRouter.post("/saas/admin/tenants/:id/suspend", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body ?? {};
  await db.update(saasTenantTable).set({ status: "suspended", suspendReason: reason ?? null, suspendedAt: new Date(), updatedAt: new Date() }).where(eq(saasTenantTable.id, id));
  res.json({ ok: true });
});

/* POST /api/saas/admin/tenants/:id/activate */
saasRouter.post("/saas/admin/tenants/:id/activate", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db.update(saasTenantTable).set({ status: "active", suspendReason: null, suspendedAt: null, updatedAt: new Date() }).where(eq(saasTenantTable.id, id));
  res.json({ ok: true });
});

/* PUT /api/saas/admin/tenants/:id/features  (per-tenant feature override) */
saasRouter.put("/saas/admin/tenants/:id/features", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const overrides: Partial<SaasPlanFeatures> = req.body ?? {};
  const [tenant] = await db.update(saasTenantTable).set({ featureOverrides: overrides, updatedAt: new Date() }).where(eq(saasTenantTable.id, id)).returning({ featureOverrides: saasTenantTable.featureOverrides });
  res.json(tenant);
});

/* PUT /api/saas/admin/tenants/:id/plan  (change plan) */
saasRouter.put("/saas/admin/tenants/:id/plan", saasAdminAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { planId, billingCycle } = req.body ?? {};
  if (!planId) { res.status(400).json({ error: "planId required" }); return; }
  const [plan] = await db.select().from(saasPlansTable).where(eq(saasPlansTable.id, planId)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  await db.update(saasTenantTable).set({ planId, status: "active", updatedAt: new Date() }).where(eq(saasTenantTable.id, id));
  await logActivity({ actorType: "super_admin", action: "change_plan", entity: "tenant", entityId: String(id), meta: { planId, planName: plan.name } });
  res.json({ ok: true, plan });
});

/* ══════════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════════ */

/* GET /api/saas/admin/tenants/:id/theme */
saasRouter.get("/saas/admin/tenants/:id/theme", saasAdminAuth, async (req, res) => {
  const tenantId = Number(req.params.id);
  const [theme] = await db.select().from(saasThemeSettingsTable).where(eq(saasThemeSettingsTable.tenantId, tenantId)).limit(1);
  res.json(theme ?? null);
});

/* PUT /api/saas/admin/tenants/:id/theme */
saasRouter.put("/saas/admin/tenants/:id/theme", saasAdminAuth, async (req, res) => {
  const tenantId = Number(req.params.id);
  const body = req.body ?? {};
  const existing = await db.select({ id: saasThemeSettingsTable.id }).from(saasThemeSettingsTable).where(eq(saasThemeSettingsTable.tenantId, tenantId)).limit(1);
  if (existing.length > 0) {
    const [theme] = await db.update(saasThemeSettingsTable).set({ ...body, updatedAt: new Date() }).where(eq(saasThemeSettingsTable.tenantId, tenantId)).returning();
    res.json(theme);
  } else {
    const [theme] = await db.insert(saasThemeSettingsTable).values({ tenantId, ...body }).returning();
    res.json(theme);
  }
});

/* ══════════════════════════════════════════════════════════
   DASHBOARD STATS
══════════════════════════════════════════════════════════ */

/* GET /api/saas/admin/dashboard */
saasRouter.get("/saas/admin/dashboard", saasAdminAuth, async (_req, res) => {
  const [totals] = await db.select({
    total:     count(),
    trial:     sql<number>`count(*) filter (where status = 'trial')`.mapWith(Number),
    active:    sql<number>`count(*) filter (where status = 'active')`.mapWith(Number),
    suspended: sql<number>`count(*) filter (where status = 'suspended')`.mapWith(Number),
    cancelled: sql<number>`count(*) filter (where status = 'cancelled')`.mapWith(Number),
    thisMonth: sql<number>`count(*) filter (where created_at >= date_trunc('month', now()))`.mapWith(Number),
  }).from(saasTenantTable);

  const byIndustry = await db.select({
    industry: saasTenantTable.industry,
    cnt: count(),
  }).from(saasTenantTable).groupBy(saasTenantTable.industry);

  const byPlan = await db.select({
    planName: saasPlansTable.name,
    tier: saasPlansTable.tier,
    cnt: count(),
  }).from(saasTenantTable)
    .leftJoin(saasPlansTable, eq(saasTenantTable.planId, saasPlansTable.id))
    .groupBy(saasPlansTable.name, saasPlansTable.tier);

  const recentTenants = await db.select({
    id: saasTenantTable.id,
    storeName: saasTenantTable.storeName,
    email: saasTenantTable.email,
    status: saasTenantTable.status,
    industry: saasTenantTable.industry,
    createdAt: saasTenantTable.createdAt,
    planName: saasPlansTable.name,
  }).from(saasTenantTable)
    .leftJoin(saasPlansTable, eq(saasTenantTable.planId, saasPlansTable.id))
    .orderBy(desc(saasTenantTable.createdAt))
    .limit(10);

  const recentActivity = await db.select().from(saasActivityLogTable).orderBy(desc(saasActivityLogTable.createdAt)).limit(20);

  const plans = await db.select().from(saasPlansTable).where(eq(saasPlansTable.isActive, true)).orderBy(saasPlansTable.displayOrder);

  res.json({ totals, byIndustry, byPlan, recentTenants, recentActivity, plans });
});

/* ══════════════════════════════════════════════════════════
   ACTIVITY LOGS
══════════════════════════════════════════════════════════ */

/* GET /api/saas/admin/activity */
saasRouter.get("/saas/admin/activity", saasAdminAuth, async (req, res) => {
  const { tenantId } = req.query as Record<string, string>;
  const where = tenantId ? eq(saasActivityLogTable.tenantId, Number(tenantId)) : undefined;
  const logs = await db.select().from(saasActivityLogTable).where(where).orderBy(desc(saasActivityLogTable.createdAt)).limit(100);
  res.json(logs);
});

/* ══════════════════════════════════════════════════════════
   TENANT PUBLIC REGISTRATION (signup)
══════════════════════════════════════════════════════════ */

/* POST /api/saas/register */
saasRouter.post("/saas/register", async (req, res) => {
  const { name, email, password, storeName, industry, ownerPhone, planId } = req.body ?? {};
  if (!name || !email || !password || !storeName) { res.status(400).json({ error: "name, email, password, storeName required" }); return; }
  const exists = await db.select({ id: saasTenantTable.id }).from(saasTenantTable).where(eq(saasTenantTable.email, email.toLowerCase())).limit(1);
  if (exists.length > 0) { res.status(409).json({ error: "Email already registered" }); return; }
  const baseSlug = storeName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const slugExists = await db.select({ id: saasTenantTable.id }).from(saasTenantTable).where(eq(saasTenantTable.storeSlug, baseSlug)).limit(1);
  const finalSlug = slugExists.length > 0 ? `${baseSlug}-${Date.now()}` : baseSlug;
  const passwordHash = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + 14 * 86400_000);
  let resolvedPlanId = planId ? Number(planId) : null;
  if (!resolvedPlanId) {
    const [defPlan] = await db.select({ id: saasPlansTable.id }).from(saasPlansTable).where(eq(saasPlansTable.isDefault, true)).limit(1);
    resolvedPlanId = defPlan?.id ?? null;
  }
  const [tenant] = await db.insert(saasTenantTable).values({
    name, email: email.toLowerCase(), passwordHash, storeName, storeSlug: finalSlug,
    slug: finalSlug, subdomain: finalSlug, industry: industry ?? "other",
    planId: resolvedPlanId, ownerPhone, status: "trial", trialEndsAt,
  }).returning();
  const token = signToken({ id: tenant.id, role: "saas_tenant" });
  await logActivity({ tenantId: tenant.id, actorType: "tenant", actorId: tenant.id, action: "register", ip: req.ip });
  res.json({ token, tenant: { id: tenant.id, storeName: tenant.storeName, storeSlug: tenant.storeSlug, status: tenant.status } });
});

/* POST /api/saas/login */
saasRouter.post("/saas/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: "Email and password required" }); return; }
  const [tenant] = await db.select().from(saasTenantTable).where(eq(saasTenantTable.email, email.toLowerCase())).limit(1);
  if (!tenant) { res.status(401).json({ error: "Invalid credentials" }); return; }
  if (tenant.status === "suspended") { res.status(403).json({ error: "Account suspended" }); return; }
  if (tenant.status === "cancelled") { res.status(403).json({ error: "Account cancelled" }); return; }
  const ok = await comparePassword(password, tenant.passwordHash);
  if (!ok) { res.status(401).json({ error: "Invalid credentials" }); return; }
  await db.update(saasTenantTable).set({ updatedAt: new Date() }).where(eq(saasTenantTable.id, tenant.id));
  const token = signToken({ id: tenant.id, role: "saas_tenant" });
  res.json({ token, tenant: { id: tenant.id, storeName: tenant.storeName, storeSlug: tenant.storeSlug, status: tenant.status, industry: tenant.industry } });
});

/* ══════════════════════════════════════════════════════════
   TENANT AUTH HELPER
══════════════════════════════════════════════════════════ */
function tenantAuth(req: Request, res: Response, next: Function): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const payload = verifyToken(auth.slice(7));
    if (payload.role !== "saas_tenant") { res.status(403).json({ error: "Forbidden" }); return; }
    (req as any).tenantPayload = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/* GET /api/saas/tenant/theme  (tenant self-service) */
saasRouter.get("/saas/tenant/theme", tenantAuth, async (req, res) => {
  const tenantId = (req as any).tenantPayload.id;
  const [theme] = await db.select().from(saasThemeSettingsTable).where(eq(saasThemeSettingsTable.tenantId, tenantId)).limit(1);
  res.json(theme ?? null);
});

/* PUT /api/saas/tenant/theme  (tenant self-service) */
saasRouter.put("/saas/tenant/theme", tenantAuth, async (req, res) => {
  const tenantId = (req as any).tenantPayload.id;
  const body = req.body ?? {};
  const existing = await db.select({ id: saasThemeSettingsTable.id }).from(saasThemeSettingsTable).where(eq(saasThemeSettingsTable.tenantId, tenantId)).limit(1);
  if (existing.length > 0) {
    const [theme] = await db.update(saasThemeSettingsTable).set({ ...body, updatedAt: new Date() }).where(eq(saasThemeSettingsTable.tenantId, tenantId)).returning();
    res.json(theme);
  } else {
    const [theme] = await db.insert(saasThemeSettingsTable).values({ tenantId, ...body }).returning();
    res.json(theme);
  }
});

/* GET /api/saas/me  (tenant) */
saasRouter.get("/saas/me", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const payload = verifyToken(auth.slice(7));
    if (payload.role !== "saas_tenant") { res.status(403).json({ error: "Forbidden" }); return; }
    const [tenant] = await db.select().from(saasTenantTable).where(eq(saasTenantTable.id, payload.id)).limit(1);
    if (!tenant) { res.status(404).json({ error: "Not found" }); return; }
    const [plan] = await db.select().from(saasPlansTable).where(eq(saasPlansTable.id, tenant.planId ?? 0)).limit(1);
    const [theme] = await db.select().from(saasThemeSettingsTable).where(eq(saasThemeSettingsTable.tenantId, tenant.id)).limit(1);
    const { passwordHash: _p, ...safe } = tenant;
    res.json({ ...safe, plan: plan ?? null, theme: theme ?? null });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});
