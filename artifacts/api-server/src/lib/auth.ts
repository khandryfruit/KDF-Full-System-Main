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

export function signToken(payload: { id: number; role: string }): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function signBranchToken(payload: { id: number; branchId: number; role: string }): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { id: number; role: string; branchId?: number } {
  return jwt.verify(token, SECRET) as { id: number; role: string; branchId?: number };
}

export interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

export interface BranchAuthRequest extends Request {
  branchUser?: { id: number; branchId: number; role: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token) as { id: number; role: string };
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
      req.user = verifyToken(header.slice(7)) as { id: number; role: string };
    } catch {
      // Invalid token — treat as unauthenticated; do not populate req.user
    }
  }
  next();
}
