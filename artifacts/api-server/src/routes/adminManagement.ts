import { Router, type Response } from "express";
import { eq, desc, and, ilike, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  adminUsersTable, adminRolesTable, adminPermissionsTable,
  adminRolePermissionsTable, adminUserRolesTable, adminActivityLogsTable,
} from "@workspace/db";
import {
  hashPassword, comparePassword, signAdminUserToken,
  adminMiddleware, requirePermission, type AuthRequest,
} from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ═══════════════════════════════════════════════════════════
   PERMISSION CATALOGUE
═══════════════════════════════════════════════════════════ */
export const ALL_PERMISSIONS = [
  { key: "dashboard.view",        name: "View Dashboard",          module: "Dashboard"  },
  { key: "analytics.view",        name: "View Analytics",          module: "Analytics"  },
  { key: "orders.view",           name: "View Orders",             module: "Orders"     },
  { key: "orders.create",         name: "Create Orders",           module: "Orders"     },
  { key: "orders.edit",           name: "Edit Orders",             module: "Orders"     },
  { key: "orders.delete",         name: "Delete Orders",           module: "Orders"     },
  { key: "orders.export",         name: "Export Orders",           module: "Orders"     },
  { key: "orders.assign_rider",   name: "Assign Rider",            module: "Orders"     },
  { key: "orders.refund",         name: "Refund Orders",           module: "Orders"     },
  { key: "products.view",         name: "View Products",           module: "Products"   },
  { key: "products.create",       name: "Create Products",         module: "Products"   },
  { key: "products.edit",         name: "Edit Products",           module: "Products"   },
  { key: "products.delete",       name: "Delete Products",         module: "Products"   },
  { key: "products.stock_manage", name: "Manage Stock",            module: "Products"   },
  { key: "customers.view",        name: "View Customers",          module: "Customers"  },
  { key: "customers.edit",        name: "Edit Customers",          module: "Customers"  },
  { key: "customers.export",      name: "Export Customers",        module: "Customers"  },
  { key: "customers.delete",      name: "Delete Customers",        module: "Customers"  },
  { key: "marketing.view",        name: "View Marketing",          module: "Marketing"  },
  { key: "campaigns.manage",      name: "Manage Campaigns",        module: "Marketing"  },
  { key: "seo.manage",            name: "Manage SEO",              module: "Marketing"  },
  { key: "fast_indexing.run",     name: "Run Fast Indexing",       module: "Marketing"  },
  { key: "blogs.manage",          name: "Manage Blogs",            module: "Marketing"  },
  { key: "payments.view",         name: "View Payments",           module: "Payments"   },
  { key: "payments.manage",       name: "Manage Payments",         module: "Payments"   },
  { key: "payments.refund",       name: "Process Refunds",         module: "Payments"   },
  { key: "merchant_api.manage",   name: "Manage Merchant APIs",    module: "Payments"   },
  { key: "disputes.manage",       name: "Manage Disputes",         module: "Payments"   },
  { key: "riders.view",           name: "View Riders",             module: "Logistics"  },
  { key: "riders.assign",         name: "Assign Riders",           module: "Logistics"  },
  { key: "riders.live_tracking",  name: "Live Rider Tracking",     module: "Logistics"  },
  { key: "riders.settlement",     name: "Rider Settlements",       module: "Logistics"  },
  { key: "riders.export",         name: "Export Rider Data",       module: "Logistics"  },
  { key: "whatsapp.view",         name: "View WhatsApp",           module: "WhatsApp"   },
  { key: "whatsapp.send",         name: "Send Messages",           module: "WhatsApp"   },
  { key: "whatsapp.templates",    name: "Manage Templates",        module: "WhatsApp"   },
  { key: "shopify.view",          name: "View Shopify",            module: "Shopify"    },
  { key: "shopify.sync",          name: "Sync Shopify",            module: "Shopify"    },
  { key: "shopify.manage",        name: "Manage Shopify",          module: "Shopify"    },
  { key: "branches.view",         name: "View Branches",           module: "Branches"   },
  { key: "branches.manage",       name: "Manage Branches",         module: "Branches"   },
  { key: "settings.view",         name: "View Settings",           module: "Settings"   },
  { key: "settings.manage",       name: "Manage Settings",         module: "Settings"   },
  { key: "integrations.manage",   name: "Manage Integrations",     module: "Settings"   },
  { key: "users.view",            name: "View Admin Users",        module: "Admin"      },
  { key: "users.manage",          name: "Manage Admin Users",      module: "Admin"      },
  { key: "roles.manage",          name: "Manage Roles & Perms",    module: "Admin"      },
  { key: "logs.view",             name: "View Activity Logs",      module: "Admin"      },
] as const;

const SUPER_ADMIN_PERMS = ALL_PERMISSIONS.map(p => p.key);
const EXCLUDED_MASTER   = new Set(["merchant_api.manage", "settings.manage", "roles.manage", "users.manage"]);

const SYSTEM_ROLES = [
  {
    name: "Super Admin", slug: "super_admin",
    description: "Full owner-level access — can do everything",
    color: "#dc2626", isSystem: true,
    permissions: SUPER_ADMIN_PERMS,
  },
  {
    name: "Master Admin", slug: "master_admin",
    description: "Full operational access without security/API settings",
    color: "#7c3aed", isSystem: true,
    permissions: SUPER_ADMIN_PERMS.filter(k => !EXCLUDED_MASTER.has(k)),
  },
  {
    name: "Accounts Manager", slug: "accounts_manager",
    description: "Financial, invoices, payments and settlements",
    color: "#059669", isSystem: true,
    permissions: ["dashboard.view","analytics.view","orders.view","orders.export","customers.view","payments.view","payments.manage","payments.refund","disputes.manage","logs.view"],
  },
  {
    name: "Rider Manager", slug: "rider_manager",
    description: "Rider dispatch, logistics and settlement management",
    color: "#d97706", isSystem: true,
    permissions: ["dashboard.view","analytics.view","orders.view","orders.assign_rider","riders.view","riders.assign","riders.live_tracking","riders.settlement","riders.export","branches.view"],
  },
  {
    name: "Marketing Manager", slug: "marketing_manager",
    description: "Marketing, SEO, blogs, campaigns and content",
    color: "#0891b2", isSystem: true,
    permissions: ["dashboard.view","analytics.view","marketing.view","campaigns.manage","seo.manage","fast_indexing.run","blogs.manage","customers.view","shopify.view"],
  },
  {
    name: "Customer Support", slug: "customer_support",
    description: "WhatsApp inbox, website chat and order tracking",
    color: "#16a34a", isSystem: true,
    permissions: ["dashboard.view","orders.view","customers.view","whatsapp.view","whatsapp.send","shopify.view"],
  },
] as const;

/* ─── Helpers ────────────────────────────────────────────── */
async function getUserPermissions(userId: number): Promise<string[]> {
  const rows = await db
    .select({ key: adminRolePermissionsTable.permissionKey })
    .from(adminUserRolesTable)
    .innerJoin(adminRolePermissionsTable, eq(adminUserRolesTable.roleId, adminRolePermissionsTable.roleId))
    .where(eq(adminUserRolesTable.userId, userId));
  return [...new Set(rows.map(r => r.key))];
}

async function logActivity(opts: {
  req:        AuthRequest;
  action:     string;
  resource?:  string;
  resourceId?: string | number;
  details?:   string;
  oldData?:   any;
  newData?:   any;
}) {
  try {
    const u = opts.req.user;
    await db.insert(adminActivityLogsTable).values({
      userId:     u?.adminUserId ?? u?.id ?? null,
      userEmail:  u?.email ?? null,
      userName:   u?.name ?? null,
      action:     opts.action,
      resource:   opts.resource ?? null,
      resourceId: opts.resourceId != null ? String(opts.resourceId) : null,
      details:    opts.details ?? null,
      oldData:    opts.oldData ?? null,
      newData:    opts.newData ?? null,
      ipAddress:  (opts.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? opts.req.socket.remoteAddress ?? null,
      userAgent:  opts.req.headers["user-agent"] ?? null,
    });
  } catch (e) {
    logger.warn({ err: e }, "activity log insert failed");
  }
}

/* ═══════════════════════════════════════════════════════════
   BOOTSTRAP — create first super-admin (only if no users exist)
   POST /api/admin-auth/bootstrap
═══════════════════════════════════════════════════════════ */
router.post("/admin-auth/bootstrap", async (req, res: Response): Promise<void> => {
  try {
    const count = await db.select({ c: sql<number>`count(*)::int` }).from(adminUsersTable);
    if (Number(count[0]?.c) > 0) {
      res.status(400).json({ ok: false, error: "Admin users already exist — use login instead" });
      return;
    }
    const { name, email, password } = req.body as { name: string; email: string; password: string };
    if (!name || !email || !password) {
      res.status(400).json({ ok: false, error: "name, email, password required" });
      return;
    }
    /* Seed permissions + roles first */
    await seedPermissionsAndRoles();
    const hash = await hashPassword(password);
    const [user] = await db.insert(adminUsersTable).values({ name, email, passwordHash: hash, isActive: true, isSuper: true }).returning();
    /* Assign super_admin role */
    const [role] = await db.select().from(adminRolesTable).where(eq(adminRolesTable.slug, "super_admin")).limit(1);
    if (role) {
      await db.insert(adminUserRolesTable).values({ userId: user.id, roleId: role.id }).onConflictDoNothing();
    }
    res.json({ ok: true, message: "Super admin created. You can now log in." });
  } catch (err: any) {
    logger.error({ err: err.message }, "bootstrap error");
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   LOGIN — POST /api/admin-auth/login
═══════════════════════════════════════════════════════════ */
router.post("/admin-auth/login", async (req, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) { res.status(400).json({ ok: false, error: "email and password required" }); return; }

    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, email.toLowerCase().trim())).limit(1);
    if (!user || !user.isActive) { res.status(401).json({ ok: false, error: "Invalid credentials" }); return; }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) { res.status(401).json({ ok: false, error: "Invalid credentials" }); return; }

    /* Collect permissions */
    const permissions = user.isSuper ? SUPER_ADMIN_PERMS : await getUserPermissions(user.id);

    /* Fetch roles for response */
    const roles = await db
      .select({ id: adminRolesTable.id, name: adminRolesTable.name, slug: adminRolesTable.slug, color: adminRolesTable.color })
      .from(adminUserRolesTable)
      .innerJoin(adminRolesTable, eq(adminUserRolesTable.roleId, adminRolesTable.id))
      .where(eq(adminUserRolesTable.userId, user.id));

    const token = signAdminUserToken({ adminUserId: user.id, name: user.name, email: user.email, isSuper: user.isSuper, permissions });

    /* Update last login */
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? null;
    await db.update(adminUsersTable).set({ lastLoginAt: new Date(), lastLoginIp: ip, updatedAt: new Date() }).where(eq(adminUsersTable.id, user.id));

    res.json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, isSuper: user.isSuper, permissions, roles },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "admin-auth login error");
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ME — GET /api/admin-auth/me
═══════════════════════════════════════════════════════════ */
router.get("/admin-auth/me", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const u = req.user!;
    /* If legacy token (no adminUserId) */
    if (!u.adminUserId) {
      res.json({ ok: true, user: { id: u.id, name: "Administrator", email: "", isSuper: true, permissions: SUPER_ADMIN_PERMS, roles: [] } });
      return;
    }
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, u.adminUserId)).limit(1);
    if (!user) { res.status(404).json({ ok: false, error: "User not found" }); return; }
    const permissions = user.isSuper ? SUPER_ADMIN_PERMS : await getUserPermissions(user.id);
    const roles = await db
      .select({ id: adminRolesTable.id, name: adminRolesTable.name, slug: adminRolesTable.slug, color: adminRolesTable.color })
      .from(adminUserRolesTable)
      .innerJoin(adminRolesTable, eq(adminUserRolesTable.roleId, adminRolesTable.id))
      .where(eq(adminUserRolesTable.userId, user.id));
    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, isSuper: user.isSuper, permissions, roles, lastLoginAt: user.lastLoginAt } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   PROFILE UPDATE — PATCH /api/admin-auth/profile
═══════════════════════════════════════════════════════════ */
router.patch("/admin-auth/profile", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const u = req.user!;
    if (!u.adminUserId) { res.status(400).json({ ok: false, error: "Not an RBAC user" }); return; }
    const { name, phone, avatarUrl, currentPassword, newPassword } = req.body as any;
    const updates: Partial<typeof adminUsersTable.$inferInsert> = { updatedAt: new Date() };
    if (name)      updates.name      = name;
    if (phone)     updates.phone     = phone;
    if (avatarUrl) updates.avatarUrl = avatarUrl;
    if (newPassword) {
      const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, u.adminUserId)).limit(1);
      if (!user || !(await comparePassword(currentPassword ?? "", user.passwordHash))) {
        res.status(400).json({ ok: false, error: "Current password incorrect" }); return;
      }
      updates.passwordHash = await hashPassword(newPassword);
    }
    await db.update(adminUsersTable).set(updates).where(eq(adminUsersTable.id, u.adminUserId));
    await logActivity({ req, action: "profile.update", resource: "admin_users", resourceId: u.adminUserId });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   USERS — GET /api/admin/iam/users
═══════════════════════════════════════════════════════════ */
router.get("/admin/iam/users", requirePermission("users.view") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await db.select({
      id: adminUsersTable.id, name: adminUsersTable.name, email: adminUsersTable.email,
      phone: adminUsersTable.phone, isActive: adminUsersTable.isActive, isSuper: adminUsersTable.isSuper,
      avatarUrl: adminUsersTable.avatarUrl, lastLoginAt: adminUsersTable.lastLoginAt,
      lastLoginIp: adminUsersTable.lastLoginIp, createdAt: adminUsersTable.createdAt,
    }).from(adminUsersTable).orderBy(desc(adminUsersTable.createdAt));

    /* Attach roles to each user */
    const userIds = users.map(u => u.id);
    let roleMap: Record<number, any[]> = {};
    if (userIds.length) {
      const roleRows = await db
        .select({ userId: adminUserRolesTable.userId, id: adminRolesTable.id, name: adminRolesTable.name, slug: adminRolesTable.slug, color: adminRolesTable.color })
        .from(adminUserRolesTable)
        .innerJoin(adminRolesTable, eq(adminUserRolesTable.roleId, adminRolesTable.id))
        .where(inArray(adminUserRolesTable.userId, userIds));
      for (const r of roleRows) {
        (roleMap[r.userId] ??= []).push({ id: r.id, name: r.name, slug: r.slug, color: r.color });
      }
    }
    res.json({ ok: true, users: users.map(u => ({ ...u, roles: roleMap[u.id] ?? [] })) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   USERS — POST /api/admin/iam/users
═══════════════════════════════════════════════════════════ */
router.post("/admin/iam/users", requirePermission("users.manage") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, phone, password, roleIds, isSuper } = req.body as any;
    if (!name || !email || !password) { res.status(400).json({ ok: false, error: "name, email, password required" }); return; }
    const hash = await hashPassword(password);
    const [user] = await db.insert(adminUsersTable).values({
      name, email: email.toLowerCase().trim(), phone: phone ?? null,
      passwordHash: hash, isActive: true, isSuper: !!isSuper,
    }).returning();
    if (Array.isArray(roleIds) && roleIds.length) {
      await db.insert(adminUserRolesTable).values(roleIds.map((rid: number) => ({ userId: user.id, roleId: rid }))).onConflictDoNothing();
    }
    await logActivity({ req, action: "user.create", resource: "admin_users", resourceId: user.id, newData: { name, email } });
    res.json({ ok: true, user });
  } catch (err: any) {
    if (err.message?.includes("unique")) { res.status(400).json({ ok: false, error: "Email already exists" }); return; }
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   USERS — PATCH /api/admin/iam/users/:id
═══════════════════════════════════════════════════════════ */
router.patch("/admin/iam/users/:id", requirePermission("users.manage") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, email, phone, isActive, isSuper, password, roleIds } = req.body as any;
    const [old] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ ok: false, error: "User not found" }); return; }

    /* Cannot demote the only super admin */
    if (isSuper === false && old.isSuper) {
      const supers = await db.select({ c: sql<number>`count(*)::int` }).from(adminUsersTable).where(eq(adminUsersTable.isSuper, true));
      if (Number(supers[0]?.c) <= 1) { res.status(400).json({ ok: false, error: "Cannot demote the only super admin" }); return; }
    }

    const updates: Partial<typeof adminUsersTable.$inferInsert> = { updatedAt: new Date() };
    if (name     != null) updates.name     = name;
    if (email    != null) updates.email    = email.toLowerCase().trim();
    if (phone    != null) updates.phone    = phone;
    if (isActive != null) updates.isActive = isActive;
    if (isSuper  != null) updates.isSuper  = isSuper;
    if (password)         updates.passwordHash = await hashPassword(password);

    await db.update(adminUsersTable).set(updates).where(eq(adminUsersTable.id, id));

    if (Array.isArray(roleIds)) {
      await db.delete(adminUserRolesTable).where(eq(adminUserRolesTable.userId, id));
      if (roleIds.length) {
        await db.insert(adminUserRolesTable).values(roleIds.map((rid: number) => ({ userId: id, roleId: rid }))).onConflictDoNothing();
      }
    }
    await logActivity({ req, action: "user.update", resource: "admin_users", resourceId: id, oldData: { name: old.name, isActive: old.isActive }, newData: updates });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   USERS — DELETE /api/admin/iam/users/:id
═══════════════════════════════════════════════════════════ */
router.delete("/admin/iam/users/:id", requirePermission("users.manage") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const u  = req.user!;
    if (u.adminUserId === id) { res.status(400).json({ ok: false, error: "Cannot delete your own account" }); return; }
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
    if (!user) { res.status(404).json({ ok: false, error: "User not found" }); return; }
    if (user.isSuper) {
      const supers = await db.select({ c: sql<number>`count(*)::int` }).from(adminUsersTable).where(eq(adminUsersTable.isSuper, true));
      if (Number(supers[0]?.c) <= 1) { res.status(400).json({ ok: false, error: "Cannot delete the only super admin" }); return; }
    }
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
    await logActivity({ req, action: "user.delete", resource: "admin_users", resourceId: id, oldData: { email: user.email } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   LOGIN AS — POST /api/admin/iam/users/:id/login-as
   Super admin only — impersonate any admin user
═══════════════════════════════════════════════════════════ */
router.post("/admin/iam/users/:id/login-as", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const u = req.user!;
    if (!u.isSuper && u.adminUserId) { res.status(403).json({ ok: false, error: "Super admin only" }); return; }
    const id = parseInt(req.params.id, 10);
    const [target] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
    if (!target || !target.isActive) { res.status(404).json({ ok: false, error: "User not found" }); return; }
    const permissions = target.isSuper ? SUPER_ADMIN_PERMS : await getUserPermissions(target.id);
    const token = signAdminUserToken({ adminUserId: target.id, name: target.name, email: target.email, isSuper: target.isSuper, permissions });
    await logActivity({ req, action: "user.login_as", resource: "admin_users", resourceId: id, details: `Impersonated ${target.email}` });
    res.json({ ok: true, token, user: { id: target.id, name: target.name, email: target.email, isSuper: target.isSuper, permissions } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ROLES — GET /api/admin/iam/roles
═══════════════════════════════════════════════════════════ */
router.get("/admin/iam/roles", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roles = await db.select().from(adminRolesTable).orderBy(adminRolesTable.name);
    const permRows = await db.select().from(adminRolePermissionsTable);
    const permMap: Record<number, string[]> = {};
    for (const r of permRows) { (permMap[r.roleId] ??= []).push(r.permissionKey); }
    /* Count users per role */
    const userCounts = await db.select({ roleId: adminUserRolesTable.roleId, c: sql<number>`count(*)::int` }).from(adminUserRolesTable).groupBy(adminUserRolesTable.roleId);
    const countMap: Record<number, number> = {};
    for (const r of userCounts) { countMap[r.roleId] = Number(r.c); }
    res.json({ ok: true, roles: roles.map(r => ({ ...r, permissions: permMap[r.id] ?? [], userCount: countMap[r.id] ?? 0 })) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ROLES — POST /api/admin/iam/roles
═══════════════════════════════════════════════════════════ */
router.post("/admin/iam/roles", requirePermission("roles.manage") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, color, permissions } = req.body as any;
    if (!name) { res.status(400).json({ ok: false, error: "name required" }); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const [role] = await db.insert(adminRolesTable).values({ name, slug, description: description ?? null, color: color ?? "#6366f1", isSystem: false }).returning();
    if (Array.isArray(permissions) && permissions.length) {
      await db.insert(adminRolePermissionsTable).values(permissions.map((k: string) => ({ roleId: role.id, permissionKey: k }))).onConflictDoNothing();
    }
    await logActivity({ req, action: "role.create", resource: "admin_roles", resourceId: role.id, newData: { name, permissions } });
    res.json({ ok: true, role });
  } catch (err: any) {
    if (err.message?.includes("unique")) { res.status(400).json({ ok: false, error: "Role slug already exists" }); return; }
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ROLES — PATCH /api/admin/iam/roles/:id
═══════════════════════════════════════════════════════════ */
router.patch("/admin/iam/roles/:id", requirePermission("roles.manage") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [role] = await db.select().from(adminRolesTable).where(eq(adminRolesTable.id, id)).limit(1);
    if (!role) { res.status(404).json({ ok: false, error: "Role not found" }); return; }
    const { name, description, color, permissions } = req.body as any;
    const updates: Partial<typeof adminRolesTable.$inferInsert> = {};
    if (name        != null) updates.name        = name;
    if (description != null) updates.description = description;
    if (color       != null) updates.color       = color;
    if (Object.keys(updates).length) await db.update(adminRolesTable).set(updates).where(eq(adminRolesTable.id, id));
    if (Array.isArray(permissions)) {
      await db.delete(adminRolePermissionsTable).where(eq(adminRolePermissionsTable.roleId, id));
      if (permissions.length) {
        await db.insert(adminRolePermissionsTable).values(permissions.map((k: string) => ({ roleId: id, permissionKey: k }))).onConflictDoNothing();
      }
    }
    await logActivity({ req, action: "role.update", resource: "admin_roles", resourceId: id, newData: updates });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ROLES — DELETE /api/admin/iam/roles/:id
═══════════════════════════════════════════════════════════ */
router.delete("/admin/iam/roles/:id", requirePermission("roles.manage") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [role] = await db.select().from(adminRolesTable).where(eq(adminRolesTable.id, id)).limit(1);
    if (!role) { res.status(404).json({ ok: false, error: "Role not found" }); return; }
    if (role.isSystem) { res.status(400).json({ ok: false, error: "Cannot delete system roles" }); return; }
    await db.delete(adminRolesTable).where(eq(adminRolesTable.id, id));
    await logActivity({ req, action: "role.delete", resource: "admin_roles", resourceId: id, oldData: { name: role.name } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   PERMISSIONS — GET /api/admin/iam/permissions
═══════════════════════════════════════════════════════════ */
router.get("/admin/iam/permissions", adminMiddleware as any, async (_req, res: Response): Promise<void> => {
  res.json({ ok: true, permissions: ALL_PERMISSIONS });
});

/* ═══════════════════════════════════════════════════════════
   ACTIVITY LOGS — GET /api/admin/iam/activity-logs
═══════════════════════════════════════════════════════════ */
router.get("/admin/iam/activity-logs", requirePermission("logs.view") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  as string || "50", 10), 200);
    const offset = parseInt(req.query.offset as string || "0", 10);
    const search = req.query.search as string | undefined;
    const where  = search ? ilike(adminActivityLogsTable.action, `%${search}%`) : undefined;
    const [logs, total] = await Promise.all([
      db.select().from(adminActivityLogsTable)
        .where(where).orderBy(desc(adminActivityLogsTable.createdAt)).limit(limit).offset(offset),
      db.select({ c: sql<number>`count(*)::int` }).from(adminActivityLogsTable).where(where),
    ]);
    res.json({ ok: true, logs, total: Number(total[0]?.c ?? 0) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   SEED — POST /api/admin/iam/seed
   Idempotent: inserts missing permissions and system roles
═══════════════════════════════════════════════════════════ */
router.post("/admin/iam/seed", requirePermission("roles.manage") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await seedPermissionsAndRoles();
    await logActivity({ req, action: "system.seed", resource: "iam", details: "Re-seeded permissions and system roles" });
    res.json({ ok: true, message: "Permissions and system roles seeded successfully" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ─── seedPermissionsAndRoles helper ─────────────────────── */
async function seedPermissionsAndRoles() {
  /* Upsert permissions */
  for (const p of ALL_PERMISSIONS) {
    await db.insert(adminPermissionsTable).values(p).onConflictDoNothing();
  }
  /* Upsert system roles */
  for (const sr of SYSTEM_ROLES) {
    const existing = await db.select().from(adminRolesTable).where(eq(adminRolesTable.slug, sr.slug)).limit(1);
    let roleId: number;
    if (existing.length) {
      roleId = existing[0].id;
    } else {
      const [inserted] = await db.insert(adminRolesTable).values({
        name: sr.name, slug: sr.slug, description: sr.description, color: sr.color, isSystem: true,
      }).returning();
      roleId = inserted.id;
    }
    /* Re-sync permissions for system roles */
    await db.delete(adminRolePermissionsTable).where(eq(adminRolePermissionsTable.roleId, roleId));
    if (sr.permissions.length) {
      await db.insert(adminRolePermissionsTable)
        .values((sr.permissions as string[]).map(k => ({ roleId, permissionKey: k })))
        .onConflictDoNothing();
    }
  }
}

/* Auto-seed on startup (non-blocking) */
seedPermissionsAndRoles().catch(e => logger.warn({ err: e }, "IAM seed on startup failed"));

export default router;
