import crypto from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  adminUsersTable, adminUserRolesTable, adminRolePermissionsTable,
  adminSessionsTable, adminLoginHistoryTable, adminSecuritySettingsTable,
} from "@workspace/db";
import { ALL_PERMISSION_KEYS } from "./enterprisePermissions.js";
import type { AuthRequest } from "./auth.js";
import { getClientMeta } from "./enterpriseAudit.js";

export async function getUserPermissions(userId: number, isSuper: boolean): Promise<string[]> {
  if (isSuper) return [...ALL_PERMISSION_KEYS];
  const rows = await db
    .select({ key: adminRolePermissionsTable.permissionKey })
    .from(adminUserRolesTable)
    .innerJoin(adminRolePermissionsTable, eq(adminUserRolesTable.roleId, adminRolePermissionsTable.roleId))
    .where(eq(adminUserRolesTable.userId, userId));
  return [...new Set(rows.map((r: { key: string }) => r.key))];
}

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createAdminSession(userId: number, req: AuthRequest, days = 30) {
  const meta = getClientMeta(req);
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const [session] = await db.insert(adminSessionsTable).values({
    userId,
    sessionToken: token,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    deviceType: meta.deviceType,
    browser: meta.browser,
    os: meta.os,
    country: meta.country,
    city: meta.city,
    expiresAt,
  }).returning();
  return { session, sessionToken: token };
}

export async function touchSession(sessionToken: string) {
  await db.update(adminSessionsTable)
    .set({ lastSeenAt: new Date() })
    .where(and(
      eq(adminSessionsTable.sessionToken, sessionToken),
      eq(adminSessionsTable.isActive, true),
      gt(adminSessionsTable.expiresAt, new Date()),
    ));
}

export async function recordLoginAttempt(opts: {
  userId?: number;
  email: string;
  success: boolean;
  failReason?: string;
  req: AuthRequest;
  isSuspicious?: boolean;
}) {
  const meta = getClientMeta(opts.req);
  await db.insert(adminLoginHistoryTable).values({
    userId: opts.userId ?? null,
    email: opts.email,
    success: opts.success,
    failReason: opts.failReason ?? null,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    deviceType: meta.deviceType,
    browser: meta.browser,
    country: meta.country,
    city: meta.city,
    isSuspicious: opts.isSuspicious ?? false,
  });
}

export async function getGlobalSecuritySettings() {
  const [row] = await db.select().from(adminSecuritySettingsTable)
    .where(eq(adminSecuritySettingsTable.scope, "global")).limit(1);
  return row ?? null;
}

export function validatePasswordPolicy(password: string, settings: {
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
} | null): string | null {
  const min = settings?.passwordMinLength ?? 10;
  if (password.length < min) return `Password must be at least ${min} characters`;
  if (settings?.passwordRequireUpper && !/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (settings?.passwordRequireNumber && !/[0-9]/.test(password)) return "Password must include a number";
  if (settings?.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol";
  return null;
}

export async function checkAccountLock(user: typeof adminUsersTable.$inferSelect): Promise<string | null> {
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    return "Account temporarily locked due to failed login attempts";
  }
  return null;
}

export async function incrementFailedLogin(userId: number) {
  const settings = await getGlobalSecuritySettings();
  const max = settings?.maxFailedLogins ?? 5;
  const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, userId)).limit(1);
  if (!user) return;
  const count = (user.failedLoginCount ?? 0) + 1;
  const updates: Partial<typeof adminUsersTable.$inferInsert> = {
    failedLoginCount: count,
    updatedAt: new Date(),
  };
  if (count >= max) {
    updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  await db.update(adminUsersTable).set(updates).where(eq(adminUsersTable.id, userId));
}

export async function clearFailedLogin(userId: number) {
  await db.update(adminUsersTable)
    .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(adminUsersTable.id, userId));
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `kdf_${crypto.randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  return { raw, prefix, hash: hashApiKey(raw) };
}
