import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, signToken, authMiddleware, type AuthRequest } from "../lib/auth";
import type { Response } from "express";

const router = Router();

const userFields = (user: any) => ({
  id: user.id,
  name: user.name,
  phone: user.phone,
  email: user.email,
  role: user.role,
  city: user.city,
  country: user.country,
  address: user.address,
  postalCode: user.postalCode,
  profileImage: user.profileImage,
  gender: user.gender,
  dateOfBirth: user.dateOfBirth,
  createdAt: user.createdAt,
});

router.post("/auth/register", async (req, res) => {
  try {
    const { name, phone, email, password, city, country, address } = req.body;
    if (!name || !phone || !password) {
      res.status(400).json({ error: "name, phone, and password are required" });
      return;
    }
    const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing.length > 0) {
      res.status(400).json({ error: "Phone already registered" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      name, phone, email, passwordHash, city, country: country ?? "Pakistan", address, role: "user",
    }).returning();
    const token = signToken({ id: user.id, role: user.role });
    res.status(201).json({ token, user: userFields(user) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { phone, email, password } = req.body;
    const identifier = email || phone;
    if (!identifier || !password) {
      res.status(400).json({ error: "phone/email and password are required" });
      return;
    }
    const isEmail = identifier.includes("@");
    const [user] = await db
      .select()
      .from(usersTable)
      .where(isEmail ? eq(usersTable.email, identifier) : eq(usersTable.phone, identifier))
      .limit(1);
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signToken({ id: user.id, role: user.role });
    res.json({ token, user: userFields(user) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(userFields(user));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/auth/profile", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, city, country, address, postalCode, profileImage, gender, dateOfBirth } = req.body;
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    if (phone && phone !== req.body._currentPhone) {
      const conflict = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.phone, phone)).limit(1);
      if (conflict.length && conflict[0].id !== req.user!.id) {
        res.status(400).json({ error: "Phone already in use" }); return;
      }
    }
    if (email) {
      const conflict = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.email, email)).limit(1);
      if (conflict.length && conflict[0].id !== req.user!.id) {
        res.status(400).json({ error: "Email already in use" }); return;
      }
    }
    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email || null;
    if (phone !== undefined) updates.phone = phone;
    if (city !== undefined) updates.city = city;
    if (country !== undefined) updates.country = country;
    if (address !== undefined) updates.address = address;
    if (postalCode !== undefined) updates.postalCode = postalCode;
    if (profileImage !== undefined) updates.profileImage = profileImage;
    if (gender !== undefined) updates.gender = gender;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;

    const [updated] = await db.update(usersTable).set(updates)
      .where(eq(usersTable.id, req.user!.id))
      .returning();
    res.json(userFields(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.post("/auth/change-password", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" }); return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters" }); return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user || !user.passwordHash) {
      res.status(404).json({ error: "User not found" }); return;
    }
    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Current password is incorrect" }); return;
    }
    const passwordHash = await hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id));
    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

router.delete("/auth/account", authMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) { res.status(400).json({ error: "Password required to delete account" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user || !user.passwordHash) { res.status(404).json({ error: "User not found" }); return; }
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) { res.status(400).json({ error: "Incorrect password" }); return; }
    await db.delete(usersTable).where(eq(usersTable.id, req.user!.id));
    res.json({ success: true, message: "Account deleted" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
