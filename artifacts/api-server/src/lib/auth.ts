import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

const SECRET_RAW = process.env.SESSION_SECRET;

if (!SECRET_RAW) {
  throw new Error(
    "SESSION_SECRET environment variable is required but was not set. " +
    "Set a strong, random secret before starting the server.",
  );
}

const SECRET: string = SECRET_RAW;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/* ─── Token types ──────────────────────────────────────────── */
export interface TokenPayload {
  id: number;
  role: string;
  /* Extended RBAC fields (only in admin_users tokens) */
  adminUserId?: number;
  isSuper?:     boolean;
  permissions?: string[];
  name?:        string;
  email?:       string;
}

export function signToken(payload: { id: number; role: string }): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function signBranchToken(payload: { id: number; branchId: number; role: string }): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function signAdminUserToken(payload: {
  adminUserId: number;
  name:        string;
  email:       string;
  isSuper:     boolean;
  permissions: string[];
}): string {
  return jwt.sign(
    {
      id:          payload.adminUserId,
      role:        "admin",
      adminUserId: payload.adminUserId,
      isSuper:     payload.isSuper,
      permissions: payload.permissions,
      name:        payload.name,
      email:       payload.email,
    },
    SECRET,
    { expiresIn: "30d" },
  );
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}

/* ─── Request interfaces ────────────────────────────────────── */
export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export interface BranchAuthRequest extends Request {
  branchUser?: { id: number; branchId: number; role: string };
}

/* ─── Middleware ────────────────────────────────────────────── */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  authMiddleware(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    if (IS_PRODUCTION && req.user?.role === "admin" && !req.user.adminUserId) {
      res.status(401).json({ error: "Session invalid — please log in again" });
      return;
    }
    next();
  });
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function hasPerm(u: TokenPayload, key: string): boolean {
  /* Legacy storefront-admin tokens must not bypass RBAC in production */
  if (!u.adminUserId) return !IS_PRODUCTION;
  if (u.isSuper) return true;
  return Array.isArray(u.permissions) && u.permissions.includes(key);
}

/**
 * requirePermission — checks granular RBAC permission.
 * Legacy tokens (no adminUserId) are treated as super admin for backward compat.
 */
export function requirePermission(key: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    adminMiddleware(req, res, () => {
      const u = req.user!;
      if (hasPerm(u, key)) { next(); return; }
      res.status(403).json({ error: `Permission required: ${key}` });
    });
  };
}

/** Require at least one of the given permissions */
export function requireAnyPermission(keys: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    adminMiddleware(req, res, () => {
      const u = req.user!;
      if (u.isSuper) { next(); return; }
      if (!u.adminUserId) {
        if (IS_PRODUCTION) { res.status(401).json({ error: "Invalid session" }); return; }
        next(); return;
      }
      if (keys.some(k => hasPerm(u, k))) { next(); return; }
      res.status(403).json({ error: `Permission required: one of ${keys.join(", ")}` });
    });
  };
}

/**
 * loadFreshPermissions — reload permissions from DB on each request (role changes apply immediately).
 */
export function loadFreshPermissions(req: AuthRequest, res: Response, next: NextFunction): void {
  adminMiddleware(req, res, async () => {
    const u = req.user!;
    if (!u.adminUserId) { next(); return; }
    try {
      const { getUserPermissions } = await import("./enterpriseAuth.js");
      const { db } = await import("@workspace/db");
      const { adminUsersTable } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, u.adminUserId)).limit(1);
      if (user) {
        u.permissions = await getUserPermissions(user.id, user.isSuper);
        u.isSuper = user.isSuper;
      }
    } catch {
      /* keep JWT permissions on failure */
    }
    next();
  });
}

const BRANCH_ROLES = new Set(["cashier", "manager", "sales", "operator"]);

export function branchMiddleware(req: BranchAuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, SECRET) as any;
    if (!BRANCH_ROLES.has(payload.role)) {
      res.status(403).json({ error: "Branch access required" });
      return;
    }
    req.branchUser = { id: payload.id, branchId: payload.branchId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      // Invalid token — treat as unauthenticated
    }
  }
  next();
}
