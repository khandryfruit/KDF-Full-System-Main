import { Router, type Response } from "express";
import { eq, desc, and, ilike, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  adminUsersTable, adminRolesTable, adminPermissionsTable,
  adminRolePermissionsTable, adminUserRolesTable, adminActivityLogsTable,
} from "@workspace/db";
import {
  hashPassword, comparePassword, signAdminUserToken, signMfaPendingToken, verifyMfaPendingToken,
  adminMiddleware, requirePermission, loadFreshPermissions, type AuthRequest,
} from "../lib/auth.js";
import { generateTotpSecret, verifyTotp, getTotpUri } from "../lib/totp.js";
import { adminSessionsTable, adminControlAlertsTable, adminLoginHistoryTable } from "@workspace/db";
import { createAdminSession } from "../lib/enterpriseAuth.js";
import { IS_PRODUCTION } from "../lib/security.js";
import { logger } from "../lib/logger.js";
import {
  ALL_PERMISSIONS, ALL_PERMISSION_KEYS, SYSTEM_ROLES,
} from "../lib/enterprisePermissions.js";
import { writeAuditLog } from "../lib/enterpriseAudit.js";
import { getUserPermissions, recordLoginAttempt, checkAccountLock, incrementFailedLogin, clearFailedLogin, getGlobalSecuritySettings, validatePasswordPolicy } from "../lib/enterpriseAuth.js";
import { bootstrapGuard, authRateLimiter } from "../lib/security.js";

const router = Router();

export { ALL_PERMISSIONS };
const SUPER_ADMIN_PERMS = ALL_PERMISSION_KEYS;

async function logActivity(opts: Parameters<typeof writeAuditLog>[1] & { req: AuthRequest }) {
  const { req, ...entry } = opts;
  await writeAuditLog(req, entry);
}

async function notifyNewDeviceLogin(userId: number, email: string, req: AuthRequest) {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "";
  const ua = req.headers["user-agent"] ?? "";
  const prior = await db.select().from(adminLoginHistoryTable)
    .where(and(eq(adminLoginHistoryTable.userId, userId), eq(adminLoginHistoryTable.success, true)))
    .limit(5).catch(() => []);
  const knownIp = prior.some(r => r.ipAddress === ip);
  if (knownIp && prior.length > 2) return;
  await db.insert(adminControlAlertsTable).values({
    type: "new_device_login",
    severity: knownIp ? "info" : "warning",
    title: `New login: ${email}`,
    message: `IP ${ip} · ${ua.slice(0, 80)}`,
    meta: { userId, ip },
  }).catch(() => {});
}

/* ═══════════════════════════════════════════════════════════
   BOOTSTRAP — create first super-admin (only if no users exist)
   POST /api/admin-auth/bootstrap
═══════════════════════════════════════════════════════════ */
router.post("/admin-auth/bootstrap", bootstrapGuard(), authRateLimiter, async (req, res: Response): Promise<void> => {
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
router.post("/admin-auth/login", authRateLimiter, async (req, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) { res.status(400).json({ ok: false, error: "email and password required" }); return; }

    const emailNorm = email.toLowerCase().trim();
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, emailNorm)).limit(1);
    if (!user || !user.isActive) {
      await recordLoginAttempt({ email: emailNorm, success: false, failReason: "invalid_user", req });
      res.status(401).json({ ok: false, error: "Invalid credentials" }); return;
    }

    const lockMsg = await checkAccountLock(user);
    if (lockMsg) { res.status(423).json({ ok: false, error: lockMsg }); return; }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      await incrementFailedLogin(user.id);
      await recordLoginAttempt({ userId: user.id, email: emailNorm, success: false, failReason: "bad_password", req, isSuspicious: (user.failedLoginCount ?? 0) >= 3 });
      res.status(401).json({ ok: false, error: "Invalid credentials" }); return;
    }

    await clearFailedLogin(user.id);
    await recordLoginAttempt({ userId: user.id, email: emailNorm, success: true, req });

    if (user.totpEnabled && user.totpSecret) {
      res.json({
        ok: true,
        requires2fa: true,
        mfaToken: signMfaPendingToken(user.id),
        message: "Enter the 6-digit code from your authenticator app",
      });
      return;
    }

    const permissions = await getUserPermissions(user.id, user.isSuper);

    const roles = await db
      .select({ id: adminRolesTable.id, name: adminRolesTable.name, slug: adminRolesTable.slug, color: adminRolesTable.color })
      .from(adminUserRolesTable)
      .innerJoin(adminRolesTable, eq(adminUserRolesTable.roleId, adminRolesTable.id))
      .where(eq(adminUserRolesTable.userId, user.id))
      .catch((e: any) => {
        logger.warn({ err: e?.message }, "admin-auth: roles fetch failed (admin_roles table may be missing) — returning empty roles");
        return [] as { id: number; name: string; slug: string; color: string | null }[];
      });

    const token = signAdminUserToken({ adminUserId: user.id, name: user.name, email: user.email, isSuper: user.isSuper, permissions });

    await createAdminSession(user.id, req).catch(() => {});
    await notifyNewDeviceLogin(user.id, user.email, req).catch(() => {});

    res.json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, isSuper: user.isSuper, permissions, roles },
    });

    /* Fire-and-forget: update last login metadata after response is sent */
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? null;
    db.update(adminUsersTable)
      .set({ lastLoginAt: new Date(), lastLoginIp: ip, updatedAt: new Date() })
      .where(eq(adminUsersTable.id, user.id))
      .catch((e: any) => logger.warn({ err: e?.message }, "admin-auth: lastLogin update failed (non-critical)"));
  } catch (err: any) {
    logger.error({ err: err?.message ?? String(err) }, "admin-auth login error");
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err?.message ?? "Login failed — please try again." });
    }
  }
});

/* ═══════════════════════════════════════════════════════════
   ME — GET /api/admin-auth/me
═══════════════════════════════════════════════════════════ */
router.get("/admin-auth/me", adminMiddleware as any, loadFreshPermissions as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const u = req.user!;
    if (!u.adminUserId) {
      if (IS_PRODUCTION) {
        res.status(401).json({ ok: false, error: "Session invalid" });
        return;
      }
      res.json({ ok: true, user: { id: u.id, name: "Administrator", email: "", isSuper: true, permissions: SUPER_ADMIN_PERMS, roles: [] } });
      return;
    }
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, u.adminUserId)).limit(1);
    if (!user) { res.status(404).json({ ok: false, error: "User not found" }); return; }
    const permissions = await getUserPermissions(user.id, user.isSuper);
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
   2FA — POST /api/admin-auth/verify-2fa
═══════════════════════════════════════════════════════════ */
router.post("/admin-auth/verify-2fa", authRateLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { mfaToken, code } = req.body as { mfaToken: string; code: string };
    if (!mfaToken || !code) { res.status(400).json({ ok: false, error: "mfaToken and code required" }); return; }
    const pending = verifyMfaPendingToken(mfaToken);
    if (!pending) { res.status(401).json({ ok: false, error: "MFA session expired — log in again" }); return; }
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, pending.adminUserId)).limit(1);
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, code)) {
      await recordLoginAttempt({ userId: user?.id, email: user?.email ?? "", success: false, failReason: "bad_2fa", req });
      res.status(401).json({ ok: false, error: "Invalid authenticator code" }); return;
    }
    const permissions = await getUserPermissions(user.id, user.isSuper);
    const roles = await db.select({ id: adminRolesTable.id, name: adminRolesTable.name, slug: adminRolesTable.slug, color: adminRolesTable.color })
      .from(adminUserRolesTable).innerJoin(adminRolesTable, eq(adminUserRolesTable.roleId, adminRolesTable.id))
      .where(eq(adminUserRolesTable.userId, user.id));
    const token = signAdminUserToken({ adminUserId: user.id, name: user.name, email: user.email, isSuper: user.isSuper, permissions });
    await createAdminSession(user.id, req).catch(() => {});
    await notifyNewDeviceLogin(user.id, user.email, req).catch(() => {});
    res.json({ ok: true, token, user: { id: user.id, name: user.name, email: user.email, isSuper: user.isSuper, permissions, roles } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin-auth/2fa/setup", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const u = req.user!;
    if (!u.adminUserId) { res.status(400).json({ ok: false, error: "RBAC user required" }); return; }
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, u.adminUserId)).limit(1);
    if (!user) { res.status(404).json({ ok: false, error: "User not found" }); return; }
    const secret = generateTotpSecret();
    await db.update(adminUsersTable).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(adminUsersTable.id, user.id));
    res.json({ ok: true, secret, uri: getTotpUri(user.email, secret), message: "Scan with Google Authenticator, then enable with a code" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin-auth/2fa/enable", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const u = req.user!;
    const { code } = req.body as { code: string };
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, u.adminUserId!)).limit(1);
    if (!user?.totpSecret || !verifyTotp(user.totpSecret, code)) {
      res.status(400).json({ ok: false, error: "Invalid code" }); return;
    }
    await db.update(adminUsersTable).set({ totpEnabled: true, updatedAt: new Date() }).where(eq(adminUsersTable.id, user.id));
    await logActivity({ req, action: "2fa.enable", resource: "admin_users", resourceId: user.id, severity: "critical" });
    res.json({ ok: true, message: "2FA enabled" });
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
    if (!u.isSuper) { res.status(403).json({ ok: false, error: "Super admin only" }); return; }
    const id = parseInt(req.params.id, 10);
    const [target] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
    if (!target || !target.isActive) { res.status(404).json({ ok: false, error: "User not found" }); return; }
    const permissions = await getUserPermissions(target.id, target.isSuper);
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
router.get("/admin/iam/roles", requirePermission("roles.view") as any, async (req: AuthRequest, res: Response): Promise<void> => {
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
   RESET PASSWORD — POST /api/admin/iam/users/:id/reset-password
═══════════════════════════════════════════════════════════ */
router.post("/admin/iam/users/:id/reset-password", requirePermission("users.reset_password") as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { newPassword } = req.body as { newPassword: string };
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
      return;
    }
    const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
    if (!user) { res.status(404).json({ ok: false, error: "User not found" }); return; }
    const hash = await hashPassword(newPassword);
    await db.update(adminUsersTable).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(adminUsersTable.id, id));
    await logActivity({ req, action: "user.reset_password", resource: "admin_users", resourceId: id, details: `Password reset for ${user.email}` });
    res.json({ ok: true, message: "Password reset successfully" });
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
  const { seedEnterpriseIam } = await import("./adminControlCenter.js");
  await seedEnterpriseIam();
}

/* Auto-seed on startup (non-blocking) */
seedPermissionsAndRoles().catch(e => logger.warn({ err: e }, "IAM seed on startup failed"));

export default router;
