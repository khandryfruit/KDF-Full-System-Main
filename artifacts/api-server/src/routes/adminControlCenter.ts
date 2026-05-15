import { Router, type Response } from "express";
import { eq, desc, and, or, ilike, sql, inArray, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  adminUsersTable, adminRolesTable, adminPermissionsTable,
  adminRolePermissionsTable, adminUserRolesTable, adminActivityLogsTable,
  adminSessionsTable, adminLoginHistoryTable, adminApiKeysTable,
  adminApprovalRequestsTable, adminSecuritySettingsTable, adminRoleDashboardTable,
  adminInternalNotesTable, adminControlAlertsTable, adminTasksTable,
} from "@workspace/db";
import {
  adminMiddleware, requirePermission, requireAnyPermission, loadFreshPermissions,
  type AuthRequest,
} from "../lib/auth.js";
import {
  ALL_PERMISSIONS, ALL_PERMISSION_KEYS, SYSTEM_ROLES, permissionsByModule,
} from "../lib/enterprisePermissions.js";
import { writeAuditLog, getClientMeta } from "../lib/enterpriseAudit.js";
import {
  getUserPermissions, createAdminSession, generateApiKey, hashApiKey,
  validatePasswordPolicy, getGlobalSecuritySettings,
} from "../lib/enterpriseAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ═══════════════════════════════════════════════════════════
   OVERVIEW — GET /api/admin/control-center/overview
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/security-monitor", requireAnyPermission(["security.manage", "logs.security", "logs.view"]) as any, async (_req: AuthRequest, res: Response) => {
  try {
    const [failedLogins, recentAlerts, activeSessions, suspiciousLogins] = await Promise.all([
      db.select().from(adminLoginHistoryTable).where(eq(adminLoginHistoryTable.success, false))
        .orderBy(desc(adminLoginHistoryTable.createdAt)).limit(25),
      db.select().from(adminControlAlertsTable).orderBy(desc(adminControlAlertsTable.createdAt)).limit(25),
      db.select().from(adminSessionsTable).where(eq(adminSessionsTable.isActive, true))
        .orderBy(desc(adminSessionsTable.lastSeenAt)).limit(50),
      db.select().from(adminLoginHistoryTable).where(eq(adminLoginHistoryTable.isSuspicious, true))
        .orderBy(desc(adminLoginHistoryTable.createdAt)).limit(15),
    ]);
    res.json({
      ok: true,
      failedLogins,
      suspiciousLogins,
      alerts: recentAlerts,
      activeSessions,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/admin/control-center/overview", adminMiddleware as any, loadFreshPermissions as any, async (req: AuthRequest, res: Response) => {
  try {
    const u = req.user!;
    const [userCount, roleCount, pendingApprovals, unreadAlerts, recentLogs] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(adminUsersTable).where(eq(adminUsersTable.isActive, true)),
      db.select({ c: sql<number>`count(*)::int` }).from(adminRolesTable),
      db.select({ c: sql<number>`count(*)::int` }).from(adminApprovalRequestsTable).where(eq(adminApprovalRequestsTable.status, "pending")),
      db.select({ c: sql<number>`count(*)::int` }).from(adminControlAlertsTable).where(eq(adminControlAlertsTable.isRead, false)),
      db.select().from(adminActivityLogsTable).orderBy(desc(adminActivityLogsTable.createdAt)).limit(8),
    ]);

    const roles = u.adminUserId
      ? await db.select({ slug: adminRolesTable.slug, widgets: adminRolesTable.dashboardWidgets })
          .from(adminUserRolesTable)
          .innerJoin(adminRolesTable, eq(adminUserRolesTable.roleId, adminRolesTable.id))
          .where(eq(adminUserRolesTable.userId, u.adminUserId))
      : [];

    const widgets = roles.flatMap(r => (r.widgets as string[] | null) ?? []);
    const uniqueWidgets = [...new Set(widgets.length ? widgets : ["kpi_orders", "alerts", "audit_feed"])];

    res.json({
      ok: true,
      stats: {
        activeUsers: Number(userCount[0]?.c ?? 0),
        roles: Number(roleCount[0]?.c ?? 0),
        pendingApprovals: Number(pendingApprovals[0]?.c ?? 0),
        unreadAlerts: Number(unreadAlerts[0]?.c ?? 0),
      },
      widgets: uniqueWidgets,
      recentActivity: recentLogs,
      permissions: u.permissions ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   PERMISSION MATRIX — GET /api/admin/control-center/permissions
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/permissions", requirePermission("roles.view") as any, async (_req, res: Response) => {
  res.json({ ok: true, permissions: ALL_PERMISSIONS, byModule: permissionsByModule() });
});

/* ═══════════════════════════════════════════════════════════
   ENHANCED AUDIT LOGS
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/audit-logs", requirePermission("logs.view") as any, async (req: AuthRequest, res: Response) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit as string || "50", 10), 500);
    const offset = parseInt(req.query.offset as string || "0", 10);
    const search = (req.query.search as string)?.trim();
    const resource = req.query.resource as string | undefined;
    const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
    const severity = req.query.severity as string | undefined;

    const conditions = [];
    if (search) {
      conditions.push(or(
        ilike(adminActivityLogsTable.action, `%${search}%`),
        ilike(adminActivityLogsTable.userEmail, `%${search}%`),
        ilike(adminActivityLogsTable.details, `%${search}%`),
        ilike(adminActivityLogsTable.resource, `%${search}%`),
      ));
    }
    if (resource) conditions.push(eq(adminActivityLogsTable.resource, resource));
    if (userId) conditions.push(eq(adminActivityLogsTable.userId, userId));
    if (severity) conditions.push(eq(adminActivityLogsTable.severity, severity));

    const where = conditions.length ? and(...conditions) : undefined;

    const [logs, total] = await Promise.all([
      db.select().from(adminActivityLogsTable).where(where).orderBy(desc(adminActivityLogsTable.createdAt)).limit(limit).offset(offset),
      db.select({ c: sql<number>`count(*)::int` }).from(adminActivityLogsTable).where(where),
    ]);
    res.json({ ok: true, logs, total: Number(total[0]?.c ?? 0) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/admin/control-center/audit-logs/export", requirePermission("logs.export") as any, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await db.select().from(adminActivityLogsTable).orderBy(desc(adminActivityLogsTable.createdAt)).limit(5000);
    await writeAuditLog(req, { action: "audit.export", resource: "admin_activity_logs", severity: "warning" });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${Date.now()}.json"`);
    res.send(JSON.stringify(logs, null, 2));
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   SESSIONS
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/sessions", requirePermission("users.sessions") as any, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : req.user?.adminUserId;
    const where = userId ? eq(adminSessionsTable.userId, userId) : undefined;
    const sessions = await db.select().from(adminSessionsTable).where(where).orderBy(desc(adminSessionsTable.lastSeenAt)).limit(100);
    res.json({ ok: true, sessions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/control-center/sessions/revoke-all", requirePermission("users.sessions") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.body as { userId: number };
    if (!userId) { res.status(400).json({ ok: false, error: "userId required" }); return; }
    await db.update(adminSessionsTable).set({ isActive: false }).where(eq(adminSessionsTable.userId, userId));
    await writeAuditLog(req, { action: "sessions.revoke_all", resource: "admin_users", resourceId: userId, severity: "critical" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/admin/control-center/sessions/:id", requirePermission("users.sessions") as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(adminSessionsTable).set({ isActive: false }).where(eq(adminSessionsTable.id, id));
    await writeAuditLog(req, { action: "sessions.revoke", resource: "admin_sessions", resourceId: id, severity: "warning" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   LOGIN HISTORY
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/login-history", requireAnyPermission(["logs.view", "logs.security"]) as any, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 200);
    const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
    const where = userId ? eq(adminLoginHistoryTable.userId, userId) : undefined;
    const history = await db.select().from(adminLoginHistoryTable).where(where).orderBy(desc(adminLoginHistoryTable.createdAt)).limit(limit);
    res.json({ ok: true, history });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   SECURITY SETTINGS
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/security", requirePermission("security.manage") as any, async (_req, res: Response) => {
  try {
    const [global] = await db.select().from(adminSecuritySettingsTable).where(eq(adminSecuritySettingsTable.scope, "global")).limit(1);
    res.json({ ok: true, settings: global ?? null });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch("/admin/control-center/security", requirePermission("security.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const [existing] = await db.select().from(adminSecuritySettingsTable).where(eq(adminSecuritySettingsTable.scope, "global")).limit(1);
    const allowed = [
      "twoFactorEnabled", "ipWhitelist", "countryAllowlist", "passwordMinLength",
      "passwordRequireUpper", "passwordRequireNumber", "passwordRequireSymbol",
      "sessionTimeoutMinutes", "maxFailedLogins",
    ] as const;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of allowed) {
      const snake = k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
      if (body[k] !== undefined) updates[snake] = body[k];
      if (body[snake] !== undefined) updates[snake] = body[snake];
    }
    if (existing) {
      await db.update(adminSecuritySettingsTable).set(updates as any).where(eq(adminSecuritySettingsTable.id, existing.id));
    } else {
      await db.insert(adminSecuritySettingsTable).values({ scope: "global", ...updates } as any);
    }
    await writeAuditLog(req, { action: "security.update", resource: "admin_security_settings", newData: updates, severity: "critical" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   APPROVAL WORKFLOWS
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/approvals", requireAnyPermission(["approvals.manage", "approvals.request"]) as any, async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || "pending";
    const items = await db.select().from(adminApprovalRequestsTable)
      .where(eq(adminApprovalRequestsTable.status, status))
      .orderBy(desc(adminApprovalRequestsTable.createdAt)).limit(100);
    res.json({ ok: true, approvals: items });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/control-center/approvals", requirePermission("approvals.request") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { type, title, resourceType, resourceId, payload } = req.body as any;
    if (!type || !title) { res.status(400).json({ ok: false, error: "type and title required" }); return; }
    const [item] = await db.insert(adminApprovalRequestsTable).values({
      type, title, resourceType: resourceType ?? null, resourceId: resourceId != null ? String(resourceId) : null,
      payload: payload ?? null, requestedBy: req.user?.adminUserId ?? null, status: "pending",
    }).returning();
    await writeAuditLog(req, { action: "approval.request", resource: "admin_approval_requests", resourceId: item.id, newData: { type, title } });
    res.json({ ok: true, approval: item });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/control-center/approvals/:id/review", requirePermission("approvals.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, reviewNote } = req.body as { status: "approved" | "rejected"; reviewNote?: string };
    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ ok: false, error: "status must be approved or rejected" }); return;
    }
    await db.update(adminApprovalRequestsTable).set({
      status, reviewNote: reviewNote ?? null, reviewedBy: req.user?.adminUserId ?? null, reviewedAt: new Date(),
    }).where(eq(adminApprovalRequestsTable.id, id));
    await writeAuditLog(req, { action: `approval.${status}`, resource: "admin_approval_requests", resourceId: id, severity: "warning" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   API KEYS
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/api-keys", requirePermission("apikeys.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
    const where = userId ? eq(adminApiKeysTable.userId, userId) : undefined;
    const keys = await db.select({
      id: adminApiKeysTable.id, userId: adminApiKeysTable.userId, name: adminApiKeysTable.name,
      keyPrefix: adminApiKeysTable.keyPrefix, scopes: adminApiKeysTable.scopes,
      expiresAt: adminApiKeysTable.expiresAt, lastUsedAt: adminApiKeysTable.lastUsedAt,
      isActive: adminApiKeysTable.isActive, createdAt: adminApiKeysTable.createdAt,
    }).from(adminApiKeysTable).where(where).orderBy(desc(adminApiKeysTable.createdAt));
    res.json({ ok: true, keys });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/control-center/api-keys", requirePermission("apikeys.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { name, scopes, expiresAt } = req.body as { name: string; scopes: string[]; expiresAt?: string };
    const userId = req.user?.adminUserId;
    if (!userId || !name) { res.status(400).json({ ok: false, error: "name required" }); return; }
    const { raw, prefix, hash } = generateApiKey();
    const [key] = await db.insert(adminApiKeysTable).values({
      userId, name, keyPrefix: prefix, keyHash: hash,
      scopes: scopes ?? [], expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    await writeAuditLog(req, { action: "apikey.create", resource: "admin_api_keys", resourceId: key.id, severity: "critical" });
    res.json({ ok: true, key: { ...key, rawKey: raw }, message: "Store this key now — it won't be shown again." });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete("/admin/control-center/api-keys/:id", requirePermission("apikeys.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(adminApiKeysTable).set({ isActive: false }).where(eq(adminApiKeysTable.id, id));
    await writeAuditLog(req, { action: "apikey.revoke", resource: "admin_api_keys", resourceId: id, severity: "critical" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   INTERNAL NOTES
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/notes", requirePermission("notes.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    if (!entityType || !entityId) { res.status(400).json({ ok: false, error: "entityType and entityId required" }); return; }
    const notes = await db.select().from(adminInternalNotesTable)
      .where(and(eq(adminInternalNotesTable.entityType, entityType), eq(adminInternalNotesTable.entityId, entityId)))
      .orderBy(desc(adminInternalNotesTable.isPinned), desc(adminInternalNotesTable.createdAt));
    res.json({ ok: true, notes });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/control-center/notes", requirePermission("notes.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { entityType, entityId, body, isPinned } = req.body as any;
    if (!entityType || !entityId || !body) { res.status(400).json({ ok: false, error: "entityType, entityId, body required" }); return; }
    const [note] = await db.insert(adminInternalNotesTable).values({
      entityType, entityId: String(entityId), body, isPinned: !!isPinned,
      createdBy: req.user?.adminUserId ?? null, createdByName: req.user?.name ?? null,
    }).returning();
    res.json({ ok: true, note });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ALERTS (notification center)
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/alerts", requirePermission("alerts.view") as any, async (req: AuthRequest, res: Response) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const where = unreadOnly ? eq(adminControlAlertsTable.isRead, false) : undefined;
    const alerts = await db.select().from(adminControlAlertsTable).where(where).orderBy(desc(adminControlAlertsTable.createdAt)).limit(50);
    res.json({ ok: true, alerts });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/control-center/alerts/:id/read", requirePermission("alerts.view") as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(adminControlAlertsTable).set({ isRead: true }).where(eq(adminControlAlertsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   TEAM TASKS
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/tasks", requirePermission("tasks.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const where = status ? eq(adminTasksTable.status, status) : undefined;
    const tasks = await db.select().from(adminTasksTable).where(where).orderBy(desc(adminTasksTable.createdAt)).limit(100);
    res.json({ ok: true, tasks });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/admin/control-center/tasks", requirePermission("tasks.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, priority, assignedTo, dueAt } = req.body as any;
    if (!title) { res.status(400).json({ ok: false, error: "title required" }); return; }
    const [task] = await db.insert(adminTasksTable).values({
      title, description: description ?? null, priority: priority ?? "normal",
      assignedTo: assignedTo ?? null, createdBy: req.user?.adminUserId ?? null,
      dueAt: dueAt ? new Date(dueAt) : null,
    }).returning();
    res.json({ ok: true, task });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch("/admin/control-center/tasks/:id", requirePermission("tasks.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, title, description, priority, assignedTo, dueAt } = req.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) {
      updates.status = status;
      if (status === "done") updates.completedAt = new Date();
    }
    if (title) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority) updates.priority = priority;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;
    await db.update(adminTasksTable).set(updates as any).where(eq(adminTasksTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   ROLE DASHBOARD CONFIG
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/roles/:id/dashboard", requirePermission("roles.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    const [cfg] = await db.select().from(adminRoleDashboardTable).where(eq(adminRoleDashboardTable.roleId, roleId)).limit(1);
    const [role] = await db.select().from(adminRolesTable).where(eq(adminRolesTable.id, roleId)).limit(1);
    res.json({
      ok: true,
      dashboard: cfg ?? {
        roleId,
        widgets: (role?.dashboardWidgets as string[]) ?? [],
        kpiKeys: [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/admin/control-center/roles/:id/dashboard", requirePermission("roles.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    const { widgets, kpiKeys } = req.body as { widgets: string[]; kpiKeys: string[] };
    await db.insert(adminRoleDashboardTable).values({
      roleId, widgets: widgets ?? [], kpiKeys: kpiKeys ?? [], updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: adminRoleDashboardTable.roleId,
      set: { widgets: widgets ?? [], kpiKeys: kpiKeys ?? [], updatedAt: new Date() },
    });
    await db.update(adminRolesTable).set({ dashboardWidgets: widgets ?? [] }).where(eq(adminRolesTable.id, roleId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GLOBAL SEARCH
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/search", requirePermission("search.global") as any, async (req: AuthRequest, res: Response) => {
  try {
    const q = ((req.query.q as string) ?? "").trim();
    if (q.length < 2) { res.json({ ok: true, results: [] }); return; }

    const pattern = `%${q}%`;
    const [users, roles, logs] = await Promise.all([
      db.select({ type: sql<string>`'user'`, id: adminUsersTable.id, label: adminUsersTable.name, sub: adminUsersTable.email })
        .from(adminUsersTable).where(or(ilike(adminUsersTable.name, pattern), ilike(adminUsersTable.email, pattern))).limit(8),
      db.select({ type: sql<string>`'role'`, id: adminRolesTable.id, label: adminRolesTable.name, sub: adminRolesTable.slug })
        .from(adminRolesTable).where(ilike(adminRolesTable.name, pattern)).limit(5),
      db.select({ type: sql<string>`'log'`, id: adminActivityLogsTable.id, label: adminActivityLogsTable.action, sub: adminActivityLogsTable.userEmail })
        .from(adminActivityLogsTable).where(or(ilike(adminActivityLogsTable.action, pattern), ilike(adminActivityLogsTable.details, pattern))).limit(8),
    ]);

    res.json({
      ok: true,
      results: [
        ...users.map(u => ({ type: "user", id: u.id, label: u.label, sub: u.sub, href: `/admin/control-center/users` })),
        ...roles.map(r => ({ type: "role", id: r.id, label: r.label, sub: r.sub, href: `/admin/control-center/roles` })),
        ...logs.map(l => ({ type: "log", id: l.id, label: l.label, sub: l.sub ?? "", href: `/admin/control-center/audit` })),
      ],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   REPORTS SUMMARY
═══════════════════════════════════════════════════════════ */
router.get("/admin/control-center/reports/summary", requireAnyPermission(["reports.sales", "finance.reports", "analytics.view"]) as any, async (_req, res: Response) => {
  res.json({
    ok: true,
    reports: [
      { key: "sales", name: "Sales Report", module: "reports" },
      { key: "profit", name: "Profit & P&L", module: "finance" },
      { key: "customers", name: "Customer Analytics", module: "reports" },
      { key: "riders", name: "Rider Performance", module: "reports" },
      { key: "seo", name: "SEO Performance", module: "reports" },
      { key: "whatsapp", name: "WhatsApp Campaigns", module: "reports" },
      { key: "inventory", name: "Inventory Valuation", module: "reports" },
    ],
  });
});

/* ═══════════════════════════════════════════════════════════
   SEED enterprise permissions + roles
═══════════════════════════════════════════════════════════ */
export async function seedEnterpriseIam() {
  for (const p of ALL_PERMISSIONS) {
    await db.insert(adminPermissionsTable).values(p).onConflictDoNothing();
  }
  for (const sr of SYSTEM_ROLES) {
    const existing = await db.select().from(adminRolesTable).where(eq(adminRolesTable.slug, sr.slug)).limit(1);
    let roleId: number;
    if (existing.length) {
      roleId = existing[0].id;
      await db.update(adminRolesTable).set({
        hierarchyLevel: sr.hierarchyLevel,
        dashboardWidgets: [...sr.widgets],
        allowedModules: [...sr.allowedModules],
      }).where(eq(adminRolesTable.id, roleId));
    } else {
      const [inserted] = await db.insert(adminRolesTable).values({
        name: sr.name, slug: sr.slug, description: sr.description, color: sr.color, isSystem: true,
        hierarchyLevel: sr.hierarchyLevel, dashboardWidgets: [...sr.widgets], allowedModules: [...sr.allowedModules],
      }).returning();
      roleId = inserted.id;
    }
    await db.delete(adminRolePermissionsTable).where(eq(adminRolePermissionsTable.roleId, roleId));
    if (sr.permissions.length) {
      await db.insert(adminRolePermissionsTable)
        .values(sr.permissions.map(k => ({ roleId, permissionKey: k })))
        .onConflictDoNothing();
    }
    await db.insert(adminRoleDashboardTable).values({
      roleId, widgets: [...sr.widgets], kpiKeys: [], updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: adminRoleDashboardTable.roleId,
      set: { widgets: [...sr.widgets], updatedAt: new Date() },
    });
  }
}

router.post("/admin/control-center/seed", requirePermission("roles.manage") as any, async (req: AuthRequest, res: Response) => {
  try {
    await seedEnterpriseIam();
    await writeAuditLog(req, { action: "iam.enterprise_seed", resource: "iam", severity: "warning" });
    res.json({ ok: true, message: "Enterprise IAM seeded", permissionCount: ALL_PERMISSION_KEYS.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

seedEnterpriseIam().catch(e => logger.warn({ err: e }, "enterprise IAM seed failed"));

export default router;
