import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, adminMiddleware, type AuthRequest } from "../lib/auth";
import type { Response } from "express";

const router = Router();

router.get("/admin/profile", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) { res.status(404).json({ error: "Admin not found" }); return; }
    res.json({
      id: user.id, name: user.name, phone: user.phone, email: user.email,
      role: user.role, profileImage: user.profileImage, createdAt: user.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/admin/profile", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, profileImage } = req.body;
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    const updates: Record<string, any> = { name, updatedAt: new Date() };
    if (email !== undefined) updates.email = email || null;
    if (phone !== undefined) updates.phone = phone;
    if (profileImage !== undefined) updates.profileImage = profileImage;
    const [updated] = await db.update(usersTable).set(updates)
      .where(eq(usersTable.id, req.user!.id)).returning();
    res.json({
      id: updated.id, name: updated.name, phone: updated.phone, email: updated.email,
      role: updated.role, profileImage: updated.profileImage, createdAt: updated.createdAt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.post("/admin/change-password", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" }); return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters" }); return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user || !user.passwordHash) { res.status(404).json({ error: "User not found" }); return; }
    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }
    const passwordHash = await hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id));
    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
