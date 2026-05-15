import {
  pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey, index,
} from "drizzle-orm/pg-core";
import { adminUsersTable, adminRolesTable } from "./adminManagement";

/* ─── Admin hierarchy level (owner → staff) ─────────────────── */
export const ADMIN_LEVELS = ["owner", "super_admin", "admin", "manager", "staff"] as const;

/* ─── Sessions (active devices) ───────────────────────────── */
export const adminSessionsTable = pgTable("admin_sessions", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull().references(() => adminUsersTable.id, { onDelete: "cascade" }),
  sessionToken: text("session_token").notNull().unique(),
  ipAddress:    text("ip_address"),
  userAgent:    text("user_agent"),
  deviceType:   text("device_type"),
  browser:      text("browser"),
  os:           text("os"),
  country:      text("country"),
  city:         text("city"),
  isActive:     boolean("is_active").notNull().default(true),
  lastSeenAt:   timestamp("last_seen_at").notNull().defaultNow(),
  expiresAt:    timestamp("expires_at").notNull(),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("admin_sessions_user_idx").on(t.userId),
]);

/* ─── Login history ─────────────────────────────────────────── */
export const adminLoginHistoryTable = pgTable("admin_login_history", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").references(() => adminUsersTable.id, { onDelete: "set null" }),
  email:      text("email"),
  success:    boolean("success").notNull().default(true),
  failReason: text("fail_reason"),
  ipAddress:  text("ip_address"),
  userAgent:  text("user_agent"),
  deviceType: text("device_type"),
  browser:    text("browser"),
  country:    text("country"),
  city:       text("city"),
  isSuspicious: boolean("is_suspicious").notNull().default(false),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("admin_login_history_user_idx").on(t.userId),
  index("admin_login_history_created_idx").on(t.createdAt),
]);

/* ─── API keys (scoped programmatic access) ─────────────────── */
export const adminApiKeysTable = pgTable("admin_api_keys", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull().references(() => adminUsersTable.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  keyPrefix:   text("key_prefix").notNull(),
  keyHash:     text("key_hash").notNull(),
  scopes:      jsonb("scopes").$type<string[]>().notNull().default([]),
  expiresAt:   timestamp("expires_at"),
  lastUsedAt:  timestamp("last_used_at"),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

/* ─── Approval workflows ────────────────────────────────────── */
export const adminApprovalRequestsTable = pgTable("admin_approval_requests", {
  id:            serial("id").primaryKey(),
  type:          text("type").notNull(),
  status:        text("status").notNull().default("pending"),
  resourceType:  text("resource_type"),
  resourceId:    text("resource_id"),
  title:         text("title").notNull(),
  payload:       jsonb("payload"),
  requestedBy:   integer("requested_by").references(() => adminUsersTable.id),
  reviewedBy:    integer("reviewed_by").references(() => adminUsersTable.id),
  reviewNote:    text("review_note"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  reviewedAt:    timestamp("reviewed_at"),
}, (t) => [
  index("admin_approvals_status_idx").on(t.status),
  index("admin_approvals_type_idx").on(t.type),
]);

/* ─── Security settings (global + per-user overrides) ───────── */
export const adminSecuritySettingsTable = pgTable("admin_security_settings", {
  id:                    serial("id").primaryKey(),
  scope:                 text("scope").notNull().default("global"),
  userId:                integer("user_id").references(() => adminUsersTable.id, { onDelete: "cascade" }),
  twoFactorEnabled:      boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret:       text("two_factor_secret"),
  ipWhitelist:           jsonb("ip_whitelist").$type<string[]>().default([]),
  countryAllowlist:      jsonb("country_allowlist").$type<string[]>().default([]),
  passwordMinLength:     integer("password_min_length").notNull().default(10),
  passwordRequireUpper:  boolean("password_require_upper").notNull().default(true),
  passwordRequireNumber: boolean("password_require_number").notNull().default(true),
  passwordRequireSymbol: boolean("password_require_symbol").notNull().default(false),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(480),
  maxFailedLogins:       integer("max_failed_logins").notNull().default(5),
  updatedAt:             timestamp("updated_at").notNull().defaultNow(),
});

/* ─── Role dashboard widgets ────────────────────────────────── */
export const adminRoleDashboardTable = pgTable("admin_role_dashboards", {
  roleId:    integer("role_id").notNull().references(() => adminRolesTable.id, { onDelete: "cascade" }).primaryKey(),
  widgets:   jsonb("widgets").$type<string[]>().notNull().default([]),
  kpiKeys:   jsonb("kpi_keys").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ─── Internal notes (users, customers, orders, team) ───────── */
export const adminInternalNotesTable = pgTable("admin_internal_notes", {
  id:           serial("id").primaryKey(),
  entityType:   text("entity_type").notNull(),
  entityId:     text("entity_id").notNull(),
  body:         text("body").notNull(),
  isPinned:     boolean("is_pinned").notNull().default(false),
  createdBy:    integer("created_by").references(() => adminUsersTable.id),
  createdByName: text("created_by_name"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("admin_notes_entity_idx").on(t.entityType, t.entityId),
]);

/* ─── Control center alerts ─────────────────────────────────── */
export const adminControlAlertsTable = pgTable("admin_control_alerts", {
  id:         serial("id").primaryKey(),
  type:       text("type").notNull(),
  severity:   text("severity").notNull().default("info"),
  title:      text("title").notNull(),
  message:    text("message"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  isRead:     boolean("is_read").notNull().default(false),
  meta:       jsonb("meta"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("admin_control_alerts_read_idx").on(t.isRead),
]);

/* ─── Team tasks ────────────────────────────────────────────── */
export const adminTasksTable = pgTable("admin_tasks", {
  id:          serial("id").primaryKey(),
  title:       text("title").notNull(),
  description: text("description"),
  status:      text("status").notNull().default("open"),
  priority:    text("priority").notNull().default("normal"),
  assignedTo:  integer("assigned_to").references(() => adminUsersTable.id),
  createdBy:   integer("created_by").references(() => adminUsersTable.id),
  dueAt:       timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

/* ─── Extended columns on admin_users (via migration) ───────── */
export const adminUsersEnterpriseColumns = {
  adminLevel:      "admin_level",
  totpEnabled:     "totp_enabled",
  totpSecret:      "totp_secret",
  failedLoginCount: "failed_login_count",
  lockedUntil:     "locked_until",
  mustResetPassword: "must_reset_password",
} as const;

export type AdminSession = typeof adminSessionsTable.$inferSelect;
export type AdminApproval = typeof adminApprovalRequestsTable.$inferSelect;
export type AdminApiKey = typeof adminApiKeysTable.$inferSelect;
export type AdminInternalNote = typeof adminInternalNotesTable.$inferSelect;
