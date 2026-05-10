import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

/* ─── Admin Users ──────────────────────────────────────────── */
export const adminUsersTable = pgTable("admin_users", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  email:        text("email").notNull().unique(),
  phone:        text("phone"),
  passwordHash: text("password_hash").notNull(),
  isActive:     boolean("is_active").notNull().default(true),
  isSuper:      boolean("is_super").notNull().default(false),
  avatarUrl:    text("avatar_url"),
  lastLoginAt:  timestamp("last_login_at"),
  lastLoginIp:  text("last_login_ip"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

/* ─── Admin Roles ──────────────────────────────────────────── */
export const adminRolesTable = pgTable("admin_roles", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  isSystem:    boolean("is_system").notNull().default(false),
  color:       text("color").default("#6366f1"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

/* ─── Permission Registry (static catalogue) ───────────────── */
export const adminPermissionsTable = pgTable("admin_permissions", {
  key:         text("key").primaryKey(),
  name:        text("name").notNull(),
  module:      text("module").notNull(),
  description: text("description"),
});

/* ─── Role ↔ Permission (many-to-many) ─────────────────────── */
export const adminRolePermissionsTable = pgTable("admin_role_permissions", {
  roleId:        integer("role_id").notNull().references(() => adminRolesTable.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull(),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })]);

/* ─── User ↔ Role (many-to-many) ───────────────────────────── */
export const adminUserRolesTable = pgTable("admin_user_roles", {
  userId: integer("user_id").notNull().references(() => adminUsersTable.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => adminRolesTable.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

/* ─── Activity / Audit Logs ────────────────────────────────── */
export const adminActivityLogsTable = pgTable("admin_activity_logs", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id"),
  userEmail:  text("user_email"),
  userName:   text("user_name"),
  action:     text("action").notNull(),
  resource:   text("resource"),
  resourceId: text("resource_id"),
  details:    text("details"),
  oldData:    jsonb("old_data"),
  newData:    jsonb("new_data"),
  ipAddress:  text("ip_address"),
  userAgent:  text("user_agent"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

export type AdminUser        = typeof adminUsersTable.$inferSelect;
export type AdminRole        = typeof adminRolesTable.$inferSelect;
export type AdminActivityLog = typeof adminActivityLogsTable.$inferSelect;
