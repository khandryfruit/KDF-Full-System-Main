import { Router } from "express";
import { eq, desc, and, ilike, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  branchesTable, branchUsersTable, branchCustomersTable,
  branchInvoicesTable, branchAuditLogsTable, branchReturnsTable,
} from "@workspace/db/schema";
import {
  adminMiddleware, branchMiddleware, hashPassword, comparePassword, signBranchToken,
} from "../lib/auth";
import type { BranchAuthRequest } from "../lib/auth";

const router = Router();

/* ── helpers ──────────────────────────────────────────────── */
function canDo(user: BranchAuthRequest["branchUser"] & { permissions?: Record<string, boolean>; role?: string }, perm: string): boolean {
  if (!user) return false;
  if (user.role === "manager") return true; // managers can do everything
  return !!(user as any).permissions?.[perm];
}

/** Fetch user from DB and check a named permission. Sends 403 and returns false on failure. */
async function requirePerm(req: BranchAuthRequest, res: any, perm: string): Promise<boolean> {
  const bu = req.branchUser!;
  if (bu.role === "manager") return true;
  const [u] = await db
    .select({ role: branchUsersTable.role, permissions: branchUsersTable.permissions })
    .from(branchUsersTable)
    .where(eq(branchUsersTable.id, bu.id))
    .limit(1);
  if (!u) { res.status(403).json({ error: "Forbidden" }); return false; }
  if (u.role === "manager") return true;
  if (!(u.permissions as Record<string, boolean> | null)?.[perm]) {
    res.status(403).json({ error: `Permission denied: ${perm}` });
    return false;
  }
  return true;
}

async function auditLog(opts: {
  branchId: number; invoiceId?: number | null; userId?: number | null;
  userName?: string; action: string; oldData?: any; newData?: any; note?: string;
}) {
  try {
    await db.insert(branchAuditLogsTable).values({
      branchId:  opts.branchId,
      invoiceId: opts.invoiceId ?? null,
      userId:    opts.userId ?? null,
      userName:  opts.userName ?? null,
      action:    opts.action,
      oldData:   opts.oldData ?? null,
      newData:   opts.newData ?? null,
      note:      opts.note ?? null,
    });
  } catch { /* non-fatal */ }
}

/* ══════════════════════════════════════════════
   BRANCH AUTH
══════════════════════════════════════════════ */

/** POST /api/branch/auth/login */
router.post("/branch/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ error: "Username and password required" }); return; }
    const [user] = await db.select().from(branchUsersTable)
      .where(eq(branchUsersTable.username, String(username).trim().toLowerCase())).limit(1);
    if (!user || !user.isActive) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, user.branchId)).limit(1);
    if (!branch || !branch.isActive) { res.status(403).json({ error: "Branch is inactive" }); return; }
    const token = signBranchToken({ id: user.id, branchId: user.branchId, role: user.role });
    res.json({
      token,
      user:   { id: user.id, name: user.name, username: user.username, role: user.role, phone: user.phone, permissions: user.permissions },
      branch: { id: branch.id, name: branch.name, slug: branch.slug, city: branch.city, address: branch.address, phone: branch.phone },
    });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** GET /api/branch/auth/me */
router.get("/branch/auth/me", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const bu = req.branchUser!;
    const [user] = await db.select().from(branchUsersTable).where(eq(branchUsersTable.id, bu.id)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, bu.branchId)).limit(1);
    res.json({
      user:   { id: user.id, name: user.name, username: user.username, role: user.role, phone: user.phone, permissions: user.permissions },
      branch: { id: branch.id, name: branch.name, slug: branch.slug, city: branch.city, address: branch.address, phone: branch.phone },
    });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════
   BRANCH STATS
══════════════════════════════════════════════ */

/** GET /api/branch/stats */
router.get("/branch/stats", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const branchId = req.branchUser!.branchId;
    const todayR = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE type='invoice')::int       AS today_invoices,
        COALESCE(SUM(grand_total) FILTER (WHERE type='invoice'),0)::numeric AS today_revenue,
        COUNT(*) FILTER (WHERE payment_status='paid' AND type='invoice')::int AS today_paid,
        COUNT(*) FILTER (WHERE payment_status='unpaid' AND type='invoice')::int AS today_unpaid
      FROM branch_invoices WHERE branch_id=${branchId} AND DATE(created_at)=CURRENT_DATE
    `);
    const monthR = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE type='invoice')::int AS month_invoices,
        COALESCE(SUM(grand_total) FILTER (WHERE type='invoice'),0)::numeric AS month_revenue,
        COUNT(DISTINCT customer_id)::int AS unique_customers,
        COUNT(*) FILTER (WHERE status='returned')::int AS returns_count
      FROM branch_invoices
      WHERE branch_id=${branchId} AND created_at>=date_trunc('month',CURRENT_DATE)
    `);
    const ts = (todayR.rows?.[0] ?? {}) as any;
    const ms = (monthR.rows?.[0] ?? {}) as any;
    res.json({
      today: { invoices: Number(ts.today_invoices??0), revenue: Number(ts.today_revenue??0), paid: Number(ts.today_paid??0), unpaid: Number(ts.today_unpaid??0) },
      month: { invoices: Number(ms.month_invoices??0), revenue: Number(ms.month_revenue??0), uniqueCustomers: Number(ms.unique_customers??0), returns: Number(ms.returns_count??0) },
    });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════
   BRANCH CUSTOMERS
══════════════════════════════════════════════ */

router.get("/branch/customers", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const branchId = req.branchUser!.branchId;
    const q = req.query["q"] as string | undefined;
    const conds = [eq(branchCustomersTable.branchId, branchId)];
    if (q) conds.push(ilike(branchCustomersTable.name, `%${q}%`));
    const customers = await db.select().from(branchCustomersTable).where(and(...conds)).orderBy(desc(branchCustomersTable.createdAt)).limit(100);
    res.json({ customers });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

router.post("/branch/customers", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const branchId = req.branchUser!.branchId;
    const { name, phone, email, address, notes } = req.body;
    if (!name || !phone) { res.status(400).json({ error: "Name and phone required" }); return; }
    const [customer] = await db.insert(branchCustomersTable).values({ branchId, name, phone, email, address, notes }).returning();
    res.status(201).json({ customer });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

router.put("/branch/customers/:id", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const branchId = req.branchUser!.branchId;
    const { name, phone, email, address, notes } = req.body;
    const [customer] = await db.update(branchCustomersTable)
      .set({ name, phone, email, address, notes })
      .where(and(eq(branchCustomersTable.id, id), eq(branchCustomersTable.branchId, branchId)))
      .returning();
    if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
    res.json({ customer });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

router.delete("/branch/customers/:id", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const branchId = req.branchUser!.branchId;
    await db.delete(branchCustomersTable).where(and(eq(branchCustomersTable.id, id), eq(branchCustomersTable.branchId, branchId)));
    res.json({ ok: true });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════
   BRANCH INVOICES
══════════════════════════════════════════════ */

router.get("/branch/invoices", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const branchId = req.branchUser!.branchId;
    const { page = "1", limit = "20", status, type, q } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds = [eq(branchInvoicesTable.branchId, branchId)];
    if (status) conds.push(eq(branchInvoicesTable.status, status));
    if (type)   conds.push(eq(branchInvoicesTable.type, type));
    if (q)      conds.push(ilike(branchInvoicesTable.invoiceNo, `%${q}%`));
    const [invoices, countR] = await Promise.all([
      db.select().from(branchInvoicesTable).where(and(...conds)).orderBy(desc(branchInvoicesTable.createdAt)).limit(parseInt(limit)).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(branchInvoicesTable).where(and(...conds)),
    ]);
    res.json({ invoices, total: countR[0]?.count ?? 0 });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

router.get("/branch/invoices/:id", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const branchId = req.branchUser!.branchId;
    const [invoice] = await db.select().from(branchInvoicesTable)
      .where(and(eq(branchInvoicesTable.id, id), eq(branchInvoicesTable.branchId, branchId))).limit(1);
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
    // Fetch returns for this invoice
    const returns = await db.select().from(branchReturnsTable).where(eq(branchReturnsTable.originalInvoiceId, id));
    // Fetch audit logs
    const logs = await db.select().from(branchAuditLogsTable)
      .where(eq(branchAuditLogsTable.invoiceId, id)).orderBy(desc(branchAuditLogsTable.createdAt)).limit(20);
    res.json({ invoice, returns, auditLogs: logs });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

router.post("/branch/invoices", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const branchId = req.branchUser!.branchId;
    const userId   = req.branchUser!.id;
    if (!await requirePerm(req, res, "create_invoice")) return;
    const {
      type, invoiceNo, customerId, customerName, customerPhone, customerAddress,
      supplierName, supplierPhone, supplierCity, items,
      subtotal, discountPct, discountAmt, shipping, taxRate, taxAmt, grandTotal,
      paymentMethod, paymentStatus, paidAmount, notes, status,
    } = req.body;

    const [invoice] = await db.insert(branchInvoicesTable).values({
      branchId, createdByUserId: userId,
      invoiceNo: invoiceNo ?? `INV-${Date.now()}`,
      type:      type ?? "invoice",
      status:    status ?? "completed",
      customerId: customerId ?? null, customerName: customerName ?? null,
      customerPhone: customerPhone ?? null, customerAddress: customerAddress ?? null,
      supplierName: supplierName ?? null, supplierPhone: supplierPhone ?? null, supplierCity: supplierCity ?? null,
      items: items ?? [],
      subtotal: String(subtotal ?? 0), discountPct: String(discountPct ?? 0), discountAmt: String(discountAmt ?? 0),
      shipping: String(shipping ?? 0), taxRate: String(taxRate ?? 0), taxAmt: String(taxAmt ?? 0),
      grandTotal: String(grandTotal ?? 0), paymentMethod: paymentMethod ?? "cash",
      paymentStatus: paymentStatus ?? "unpaid", paidAmount: String(paidAmount ?? 0),
      notes: notes ?? null,
    }).returning();

    if (customerId && paymentStatus === "paid") {
      await db.update(branchCustomersTable).set({
        totalOrders: sql`${branchCustomersTable.totalOrders} + 1`,
        totalSpent:  sql`${branchCustomersTable.totalSpent} + ${String(grandTotal ?? 0)}`,
      }).where(eq(branchCustomersTable.id, customerId));
    }

    // Audit log
    const [user] = await db.select({ name: branchUsersTable.name }).from(branchUsersTable).where(eq(branchUsersTable.id, userId)).limit(1);
    await auditLog({ branchId, invoiceId: invoice.id, userId, userName: user?.name, action: "create", newData: invoice });

    res.status(201).json({ invoice });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** PUT /api/branch/invoices/:id  — Edit existing invoice */
router.put("/branch/invoices/:id", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const branchId = req.branchUser!.branchId;
    const userId   = req.branchUser!.id;

    if (!await requirePerm(req, res, "edit_invoice")) return;
    const [existing] = await db.select().from(branchInvoicesTable)
      .where(and(eq(branchInvoicesTable.id, id), eq(branchInvoicesTable.branchId, branchId))).limit(1);
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    if (existing.status === "returned") { res.status(400).json({ error: "Cannot edit a fully returned invoice" }); return; }

    const {
      items, subtotal, discountPct, discountAmt, shipping, taxRate, taxAmt,
      grandTotal, paymentMethod, paymentStatus, paidAmount, notes,
      customerName, customerPhone, customerAddress, editReason,
    } = req.body;

    const updates: Partial<typeof branchInvoicesTable.$inferInsert> = {
      status: "edited", updatedAt: new Date(),
    };
    if (items !== undefined)          updates.items = items;
    if (subtotal !== undefined)       updates.subtotal = String(subtotal);
    if (discountPct !== undefined)    updates.discountPct = String(discountPct);
    if (discountAmt !== undefined)    updates.discountAmt = String(discountAmt);
    if (shipping !== undefined)       updates.shipping = String(shipping);
    if (taxRate !== undefined)        updates.taxRate = String(taxRate);
    if (taxAmt !== undefined)         updates.taxAmt = String(taxAmt);
    if (grandTotal !== undefined)     updates.grandTotal = String(grandTotal);
    if (paymentMethod !== undefined)  updates.paymentMethod = paymentMethod;
    if (paymentStatus !== undefined)  updates.paymentStatus = paymentStatus;
    if (paidAmount !== undefined)     updates.paidAmount = String(paidAmount);
    if (notes !== undefined)          updates.notes = notes;
    if (customerName !== undefined)   updates.customerName = customerName;
    if (customerPhone !== undefined)  updates.customerPhone = customerPhone;
    if (customerAddress !== undefined) updates.customerAddress = customerAddress;

    const [invoice] = await db.update(branchInvoicesTable).set(updates)
      .where(eq(branchInvoicesTable.id, id)).returning();

    const [user] = await db.select({ name: branchUsersTable.name }).from(branchUsersTable).where(eq(branchUsersTable.id, userId)).limit(1);
    await auditLog({ branchId, invoiceId: id, userId, userName: user?.name, action: "edit", oldData: existing, newData: invoice, note: editReason });

    res.json({ invoice });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

router.delete("/branch/invoices/:id", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const branchId = req.branchUser!.branchId;
    const userId   = req.branchUser!.id;
    if (!await requirePerm(req, res, "delete_invoice")) return;
    const [existing] = await db.select().from(branchInvoicesTable)
      .where(and(eq(branchInvoicesTable.id, id), eq(branchInvoicesTable.branchId, branchId))).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const [user] = await db.select({ name: branchUsersTable.name }).from(branchUsersTable).where(eq(branchUsersTable.id, userId)).limit(1);
    await auditLog({ branchId, invoiceId: id, userId, userName: user?.name, action: "delete", oldData: existing });
    await db.delete(branchInvoicesTable).where(eq(branchInvoicesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════
   RETURN / EXCHANGE
══════════════════════════════════════════════ */

/** POST /api/branch/invoices/:id/return */
router.post("/branch/invoices/:id/return", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params["id"] as string);
    const branchId  = req.branchUser!.branchId;
    const userId    = req.branchUser!.id;

    if (!await requirePerm(req, res, "return_invoice")) return;
    const [invoice] = await db.select().from(branchInvoicesTable)
      .where(and(eq(branchInvoicesTable.id, invoiceId), eq(branchInvoicesTable.branchId, branchId))).limit(1);
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const {
      returnType = "full_return", items = [], exchangeItems = [],
      returnAmount = 0, storeCredit = 0, refundMethod = "cash", reason, notes,
    } = req.body;

    const returnInvoiceNo = `RET-${Date.now()}`;

    // Determine new invoice status
    let newStatus: string;
    if (returnType === "exchange")    newStatus = "exchanged";
    else if (returnType === "full_return") newStatus = "returned";
    else newStatus = "partially_returned";

    const [user] = await db.select({ name: branchUsersTable.name }).from(branchUsersTable).where(eq(branchUsersTable.id, userId)).limit(1);

    const [branchReturn] = await db.insert(branchReturnsTable).values({
      branchId, originalInvoiceId: invoiceId, returnInvoiceNo,
      processedByUserId: userId, processedByName: user?.name,
      returnType, items, exchangeItems,
      returnAmount: String(returnAmount), storeCredit: String(storeCredit),
      refundMethod, reason, notes,
    }).returning();

    // Update original invoice status
    await db.update(branchInvoicesTable).set({ status: newStatus, updatedAt: new Date() }).where(eq(branchInvoicesTable.id, invoiceId));

    // Audit log
    await auditLog({ branchId, invoiceId, userId, userName: user?.name, action: "return",
      oldData: { status: invoice.status }, newData: { status: newStatus, returnType, returnAmount }, note: reason });

    res.status(201).json({ return: branchReturn });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** GET /api/branch/returns — list returns for branch */
router.get("/branch/returns", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const branchId = req.branchUser!.branchId;
    const returns = await db.select().from(branchReturnsTable)
      .where(eq(branchReturnsTable.branchId, branchId))
      .orderBy(desc(branchReturnsTable.createdAt)).limit(50);
    res.json({ returns });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** GET /api/branch/audit-logs */
router.get("/branch/audit-logs", branchMiddleware as any, async (req: BranchAuthRequest, res) => {
  try {
    const branchId = req.branchUser!.branchId;
    const logs = await db.select().from(branchAuditLogsTable)
      .where(eq(branchAuditLogsTable.branchId, branchId))
      .orderBy(desc(branchAuditLogsTable.createdAt)).limit(100);
    res.json({ logs });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════
   ADMIN — BRANCH USERS MANAGEMENT
══════════════════════════════════════════════ */

/** GET /api/admin/branches/:id/users */
router.get("/admin/branches/:id/users", adminMiddleware as any, async (req, res) => {
  try {
    const branchId = parseInt(req.params["id"] as string);
    const users = await db.select({
      id: branchUsersTable.id, name: branchUsersTable.name, username: branchUsersTable.username,
      phone: branchUsersTable.phone, email: branchUsersTable.email,
      role: branchUsersTable.role, permissions: branchUsersTable.permissions,
      isActive: branchUsersTable.isActive, createdAt: branchUsersTable.createdAt,
    }).from(branchUsersTable).where(eq(branchUsersTable.branchId, branchId)).orderBy(branchUsersTable.name);
    res.json({ users });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/branches/:id/users */
router.post("/admin/branches/:id/users", adminMiddleware as any, async (req, res) => {
  try {
    const branchId = parseInt(req.params["id"] as string);
    const { username, password, name, phone, email, role, permissions, isActive } = req.body;
    if (!username || !password || !name) { res.status(400).json({ error: "username, password, name required" }); return; }
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(branchUsersTable).values({
      branchId, username: username.trim().toLowerCase(), passwordHash,
      name, phone: phone ?? null, email: email ?? null,
      role: role ?? "cashier",
      permissions: permissions ?? {},
      isActive: isActive !== false,
    }).returning();
    res.status(201).json({ user: { id: user.id, username: user.username, name: user.name, phone: user.phone, email: user.email, role: user.role, permissions: user.permissions, isActive: user.isActive } });
  } catch (err: any) {
    req.log.error(err);
    if (err.message?.includes("unique")) { res.status(409).json({ error: "Username already exists" }); return; }
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/admin/branches/:id/users/:uid */
router.put("/admin/branches/:id/users/:uid", adminMiddleware as any, async (req, res) => {
  try {
    const uid = parseInt(req.params["uid"] as string);
    const { name, phone, email, role, permissions, isActive, password } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (name !== undefined)        updates.name = name;
    if (phone !== undefined)       updates.phone = phone;
    if (email !== undefined)       updates.email = email;
    if (role !== undefined)        updates.role = role;
    if (permissions !== undefined) updates.permissions = permissions;
    if (isActive !== undefined)    updates.isActive = isActive;
    if (password)                  updates.passwordHash = await hashPassword(password);
    const [user] = await db.update(branchUsersTable).set(updates).where(eq(branchUsersTable.id, uid)).returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: { id: user.id, username: user.username, name: user.name, phone: user.phone, email: user.email, role: user.role, permissions: user.permissions, isActive: user.isActive } });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/branches/:id/users/:uid */
router.delete("/admin/branches/:id/users/:uid", adminMiddleware as any, async (req, res) => {
  try {
    const uid = parseInt(req.params["uid"] as string);
    await db.delete(branchUsersTable).where(eq(branchUsersTable.id, uid));
    res.json({ ok: true });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════
   ADMIN — INVOICE MANAGEMENT (CRUD)
══════════════════════════════════════════════ */

/** GET /api/admin/branch-invoices — list all invoices across all branches */
router.get("/admin/branch-invoices", adminMiddleware as any, async (req, res) => {
  try {
    const { page = "1", limit = "20", status, type, q, branchId: bId } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds: any[] = [];
    if (type && type !== "all") conds.push(eq(branchInvoicesTable.type, type));
    if (status && status !== "all") conds.push(eq(branchInvoicesTable.status, status));
    if (q) conds.push(ilike(branchInvoicesTable.invoiceNo, `%${q}%`));
    if (bId) conds.push(eq(branchInvoicesTable.branchId, parseInt(bId)));
    const where = conds.length ? and(...conds) : undefined;
    const [rows, countR] = await Promise.all([
      db.select({
        id: branchInvoicesTable.id, invoiceNo: branchInvoicesTable.invoiceNo,
        type: branchInvoicesTable.type, status: branchInvoicesTable.status,
        customerName: branchInvoicesTable.customerName, customerPhone: branchInvoicesTable.customerPhone,
        grandTotal: branchInvoicesTable.grandTotal, subtotal: branchInvoicesTable.subtotal,
        discountAmt: branchInvoicesTable.discountAmt, shipping: branchInvoicesTable.shipping,
        taxAmt: branchInvoicesTable.taxAmt, paymentStatus: branchInvoicesTable.paymentStatus,
        paymentMethod: branchInvoicesTable.paymentMethod, paidAmount: branchInvoicesTable.paidAmount,
        notes: branchInvoicesTable.notes, createdAt: branchInvoicesTable.createdAt,
        items: branchInvoicesTable.items, branchId: branchInvoicesTable.branchId,
        branchName: branchesTable.name, branchCity: branchesTable.city,
      })
        .from(branchInvoicesTable)
        .leftJoin(branchesTable, eq(branchInvoicesTable.branchId, branchesTable.id))
        .where(where)
        .orderBy(desc(branchInvoicesTable.createdAt))
        .limit(parseInt(limit))
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(branchInvoicesTable).where(where),
    ]);
    res.json({ invoices: rows, total: countR[0]?.count ?? 0 });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** PUT /api/admin/branch-invoices/:id — admin edit any invoice */
router.put("/admin/branch-invoices/:id", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [existing] = await db.select().from(branchInvoicesTable).where(eq(branchInvoicesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
    const { items, subtotal, discountAmt, grandTotal, paymentMethod, paymentStatus, paidAmount, notes, customerName, customerPhone, editReason } = req.body;
    const updates: any = { status: "edited", updatedAt: new Date() };
    if (items !== undefined)          updates.items = items;
    if (subtotal !== undefined)       updates.subtotal = String(subtotal);
    if (discountAmt !== undefined)    updates.discountAmt = String(discountAmt);
    if (grandTotal !== undefined)     updates.grandTotal = String(grandTotal);
    if (paymentMethod !== undefined)  updates.paymentMethod = paymentMethod;
    if (paymentStatus !== undefined)  updates.paymentStatus = paymentStatus;
    if (paidAmount !== undefined)     updates.paidAmount = String(paidAmount);
    if (notes !== undefined)          updates.notes = notes;
    if (customerName !== undefined)   updates.customerName = customerName;
    if (customerPhone !== undefined)  updates.customerPhone = customerPhone;
    const [invoice] = await db.update(branchInvoicesTable).set(updates).where(eq(branchInvoicesTable.id, id)).returning();
    await auditLog({ branchId: existing.branchId, invoiceId: id, userId: null, userName: "Admin", action: "admin_edit", oldData: existing, newData: invoice, note: editReason });
    res.json({ invoice });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/branch-invoices/:id — admin delete any invoice */
router.delete("/admin/branch-invoices/:id", adminMiddleware as any, async (req, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [existing] = await db.select().from(branchInvoicesTable).where(eq(branchInvoicesTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    await auditLog({ branchId: existing.branchId, invoiceId: id, userId: null, userName: "Admin", action: "admin_delete", oldData: existing });
    await db.delete(branchInvoicesTable).where(eq(branchInvoicesTable.id, id));
    res.json({ ok: true });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/branch-invoices/:id/return — admin process return */
router.post("/admin/branch-invoices/:id/return", adminMiddleware as any, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params["id"] as string);
    const [invoice] = await db.select().from(branchInvoicesTable).where(eq(branchInvoicesTable.id, invoiceId)).limit(1);
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
    const { returnType = "full_return", items = [], exchangeItems = [], returnAmount = 0, refundMethod = "cash", reason, notes } = req.body;
    const newStatus = returnType === "exchange" ? "exchanged" : returnType === "full_return" ? "returned" : "partially_returned";
    const returnInvoiceNo = `RET-${Date.now()}`;
    const [branchReturn] = await db.insert(branchReturnsTable).values({
      branchId: invoice.branchId, originalInvoiceId: invoiceId, returnInvoiceNo,
      processedByUserId: null, processedByName: "Admin",
      returnType, items, exchangeItems: exchangeItems ?? [],
      returnAmount: String(returnAmount), storeCredit: "0",
      refundMethod, reason, notes,
    }).returning();
    await db.update(branchInvoicesTable).set({ status: newStatus, updatedAt: new Date() }).where(eq(branchInvoicesTable.id, invoiceId));
    await auditLog({ branchId: invoice.branchId, invoiceId, userId: null, userName: "Admin", action: "admin_return",
      oldData: { status: invoice.status }, newData: { status: newStatus, returnType, returnAmount }, note: reason });
    res.status(201).json({ return: branchReturn });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════
   ADMIN — CENTRAL REPORTING
══════════════════════════════════════════════ */

/** GET /api/admin/branch-invoices/report */
router.get("/admin/branch-invoices/report", adminMiddleware as any, async (req, res) => {
  try {
    const perBranch  = await db.execute(sql`
      SELECT b.id AS branch_id, b.name AS branch_name, b.city,
        COUNT(bi.id) FILTER (WHERE bi.type='invoice')::int            AS total_invoices,
        COALESCE(SUM(bi.grand_total) FILTER (WHERE bi.type='invoice'),0)::numeric AS total_revenue,
        COUNT(bi.id) FILTER (WHERE bi.type='invoice' AND bi.payment_status='paid')::int AS paid_count,
        COUNT(bi.id) FILTER (WHERE bi.type='invoice' AND bi.payment_status='unpaid')::int AS unpaid_count,
        COUNT(bi.id) FILTER (WHERE bi.type='invoice' AND DATE(bi.created_at)=CURRENT_DATE)::int AS today_invoices,
        COALESCE(SUM(bi.grand_total) FILTER (WHERE bi.type='invoice' AND DATE(bi.created_at)=CURRENT_DATE),0)::numeric AS today_revenue,
        COUNT(bi.id) FILTER (WHERE bi.type='invoice' AND bi.created_at>=date_trunc('month',CURRENT_DATE))::int AS month_invoices,
        COALESCE(SUM(bi.grand_total) FILTER (WHERE bi.type='invoice' AND bi.created_at>=date_trunc('month',CURRENT_DATE)),0)::numeric AS month_revenue,
        COUNT(bi.id) FILTER (WHERE bi.status IN ('returned','partially_returned'))::int AS returns_count
      FROM branches b LEFT JOIN branch_invoices bi ON bi.branch_id=b.id
      WHERE b.is_active=true GROUP BY b.id,b.name,b.city ORDER BY total_revenue DESC`);
    const globalR = await db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE type='invoice')::int AS total_invoices,
        COALESCE(SUM(grand_total) FILTER (WHERE type='invoice'),0)::numeric AS total_revenue,
        COUNT(*) FILTER (WHERE type='invoice' AND DATE(created_at)=CURRENT_DATE)::int AS today_invoices,
        COALESCE(SUM(grand_total) FILTER (WHERE type='invoice' AND DATE(created_at)=CURRENT_DATE),0)::numeric AS today_revenue,
        COUNT(*) FILTER (WHERE type='invoice' AND payment_status='paid')::int AS paid_count,
        COUNT(*) FILTER (WHERE type='invoice' AND payment_status='unpaid')::int AS unpaid_count,
        COUNT(*) FILTER (WHERE status IN ('returned','partially_returned'))::int AS returns_count
      FROM branch_invoices`);
    const dailyTrend = await db.execute(sql`
      SELECT DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE type='invoice')::int AS invoices,
        COALESCE(SUM(grand_total) FILTER (WHERE type='invoice'),0)::numeric AS revenue
      FROM branch_invoices WHERE created_at>=NOW()-INTERVAL '14 days'
      GROUP BY DATE(created_at) ORDER BY day ASC`);
    const gs = (globalR.rows?.[0] ?? {}) as any;
    res.json({
      global: {
        totalInvoices: Number(gs.total_invoices??0), totalRevenue: Number(gs.total_revenue??0),
        todayInvoices: Number(gs.today_invoices??0), todayRevenue: Number(gs.today_revenue??0),
        paidCount: Number(gs.paid_count??0), unpaidCount: Number(gs.unpaid_count??0),
        returnsCount: Number(gs.returns_count??0),
      },
      perBranch: perBranch.rows ?? [],
      dailyTrend: dailyTrend.rows ?? [],
    });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/branch-invoices — admin creates a mobile invoice (no branch auth required) */
router.post("/admin/branch-invoices", adminMiddleware as any, async (req, res) => {
  try {
    const {
      branchId = 1, type, invoiceNo, customerName, customerPhone, customerAddress,
      items, subtotal, discountPct, discountAmt, shipping = 0, taxRate = 0, taxAmt = 0,
      grandTotal, paymentMethod, paymentStatus, paidAmount, notes, status,
    } = req.body;
    const [invoice] = await db.insert(branchInvoicesTable).values({
      branchId:       parseInt(String(branchId)),
      invoiceNo:      invoiceNo      ?? `MOB-${Date.now()}`,
      type:           type           ?? "invoice",
      status:         status         ?? "completed",
      customerName:   customerName   ?? null,
      customerPhone:  customerPhone  ?? null,
      customerAddress: customerAddress ?? null,
      items:          items          ?? [],
      subtotal:       String(subtotal  ?? 0),
      discountPct:    String(discountPct ?? 0),
      discountAmt:    String(discountAmt ?? 0),
      shipping:       String(shipping  ?? 0),
      taxRate:        String(taxRate   ?? 0),
      taxAmt:         String(taxAmt    ?? 0),
      grandTotal:     String(grandTotal ?? 0),
      paymentMethod:  paymentMethod  ?? "cash",
      paymentStatus:  paymentStatus  ?? "paid",
      paidAmount:     String(paidAmount ?? grandTotal ?? 0),
      notes:          notes          ?? null,
    }).returning();
    await auditLog({ branchId: parseInt(String(branchId)), invoiceId: invoice.id, userId: null, userName: "Mobile Admin", action: "create", newData: invoice });
    return res.status(201).json({ invoice });
  } catch (err: any) {
    req.log?.error(err);
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/branch-audit-logs */
router.get("/admin/branch-audit-logs", adminMiddleware as any, async (req, res) => {
  try {
    const { branchId, action, page = "1" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * 50;
    const conds: any[] = [];
    if (branchId) conds.push(eq(branchAuditLogsTable.branchId, parseInt(branchId)));
    if (action)   conds.push(eq(branchAuditLogsTable.action, action));
    const logs = await db.select().from(branchAuditLogsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(branchAuditLogsTable.createdAt)).limit(50).offset(offset);
    res.json({ logs });
  } catch (err: any) { req.log.error(err); res.status(500).json({ error: err.message }); }
});

export default router;
