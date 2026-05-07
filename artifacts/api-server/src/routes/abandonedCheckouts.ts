import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, sql, lt, isNotNull, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { abandonedCheckoutsTable, emailSettingsTable, aiSettingsTable } from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";
import { sendWhatsAppMessage, normalizePhone } from "../lib/whatsapp";
import nodemailer from "nodemailer";
import OpenAI from "openai";

const router: IRouter = Router();

const ABANDON_THRESHOLD_MS = 45 * 60 * 1000;
const EXPIRE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/* ─── Helpers ─────────────────────────────────────── */

function buildCartItemsList(cartItems: any[]): string {
  return cartItems.map((i: any) => {
    const lineTotal = (parseFloat(i.price ?? "0") * (i.qty ?? 1)).toLocaleString();
    const label = i.variantLabel ? ` (${i.variantLabel})` : "";
    return `• ${i.name}${label}\n  Qty: ${i.qty} × PKR ${parseFloat(i.price ?? "0").toLocaleString()} = PKR ${lineTotal}`;
  }).join("\n");
}

function buildWaMessage(checkout: any, discountLine = "", isFollowUp = false): string {
  const name = checkout.customerName ? checkout.customerName.split(" ")[0] : "there";
  const items = checkout.cartItems ?? [];
  const itemList = buildCartItemsList(items);
  const total = parseFloat(checkout.subtotal ?? "0").toLocaleString();
  const addressLine = checkout.customerAddress ? `\n📍 Delivery: ${checkout.customerAddress}` : "";
  const followUpIntro = isFollowUp
    ? `⏰ This is a reminder — your cart is still waiting!\n\n`
    : "";

  return (
    `Hi ${name}! 👋\n\n` +
    `${followUpIntro}` +
    `🛒 *You left items in your KDF NUTS cart:*\n\n` +
    `${itemList}\n\n` +
    `💰 *Cart Total: PKR ${total}*` +
    `${addressLine}` +
    `${discountLine ? "\n\n" + discountLine : ""}` +
    `\n\n✅ Complete your order now before it sells out!\n👉 https://kdfnuts.com`
  );
}

function buildHtmlEmail(checkout: any, discountLine = "", discountPercent = 0, isFollowUp = false): string {
  const name = checkout.customerName ? checkout.customerName.split(" ")[0] : "there";
  const items: any[] = checkout.cartItems ?? [];
  const subtotal = parseFloat(checkout.subtotal ?? "0");
  const finalTotal = discountPercent > 0 ? subtotal * (1 - discountPercent / 100) : subtotal;

  const rows = items.map((i: any) => {
    const lineTotal = parseFloat(i.price ?? "0") * (i.qty ?? 1);
    const label = i.variantLabel ? `<br><small style="color:#888">${i.variantLabel}</small>` : "";
    const imgTag = i.image
      ? `<img src="${i.image}" width="48" height="48" style="border-radius:6px;object-fit:cover" alt="${i.name}">`
      : `<div style="width:48px;height:48px;background:#f0f0f0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px">🥜</div>`;
    return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle">${imgTag}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle">
          <strong style="color:#222;font-size:14px">${i.name}</strong>${label}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle;text-align:center;color:#555;font-size:14px">×${i.qty}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:middle;text-align:right;color:#333;font-size:14px;font-weight:600">
          PKR ${lineTotal.toLocaleString()}
        </td>
      </tr>`;
  }).join("");

  const discountRow = discountPercent > 0
    ? `<tr>
        <td colspan="3" style="padding:8px;text-align:right;color:#e53e3e;font-size:14px">Discount (${discountPercent}%)</td>
        <td style="padding:8px;text-align:right;color:#e53e3e;font-weight:bold">-PKR ${(subtotal * discountPercent / 100).toLocaleString()}</td>
      </tr>`
    : "";

  const followUpBanner = isFollowUp
    ? `<div style="background:#fff3cd;border-left:4px solid #f59e0b;padding:12px 16px;margin:0 0 20px 0;border-radius:0 8px 8px 0;font-size:13px;color:#92400e">
        ⏰ <strong>This is your final reminder</strong> — your cart is still saved for you!
      </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f8fa;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:#5FA800;padding:28px 32px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:1px">🥜 KDF NUTS</h1>
      <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px">Pakistan's Premium Dry Fruits</p>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      ${followUpBanner}
      <h2 style="color:#222;margin:0 0 8px;font-size:22px">Hi ${name}, you left something behind! 🛒</h2>
      <p style="color:#555;margin:0 0 24px;font-size:15px;line-height:1.6">
        Your cart at KDF NUTS is saved and waiting for you. Here's what you have:
      </p>

      <!-- Cart Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f6f8fa">
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Item</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Product</th>
            <th style="padding:10px 8px;text-align:center;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Qty</th>
            <th style="padding:10px 8px;text-align:right;font-size:12px;color:#888;font-weight:600;text-transform:uppercase">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          ${discountRow}
          <tr style="background:#f6f8fa">
            <td colspan="3" style="padding:14px 8px;text-align:right;font-size:16px;font-weight:700;color:#222">Order Total:</td>
            <td style="padding:14px 8px;text-align:right;font-size:18px;font-weight:700;color:#5FA800">PKR ${finalTotal.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>

      ${discountLine ? `
      <!-- Discount Banner -->
      <div style="background:#f0fdf4;border:2px solid #5FA800;border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center">
        <p style="margin:0;font-size:15px;color:#166534;font-weight:600">🎁 ${discountLine}</p>
      </div>` : ""}

      ${checkout.customerAddress ? `
      <div style="background:#f6f8fa;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#555">
        📍 <strong>Delivery to:</strong> ${checkout.customerAddress}
      </div>` : ""}

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0">
        <a href="https://kdfnuts.com" style="display:inline-block;background:#5FA800;color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:0.5px">
          Complete Your Order →
        </a>
      </div>

      <p style="color:#888;font-size:13px;text-align:center;line-height:1.6">
        Questions? Reply to this email or WhatsApp us at <strong>+92 300 1234567</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f6f8fa;padding:20px 32px;text-align:center;border-top:1px solid #eee">
      <p style="color:#aaa;font-size:12px;margin:0">
        KDF NUTS · Pakistan's Premium Dry Fruits · kdfnuts.com<br>
        You received this because you added items to your cart.
      </p>
    </div>
  </div>
</body></html>`;
}

function suggestDiscount(subtotal: number, reminderCount: number): { percent: number; code: string; reason: string } {
  const base = subtotal > 10000 ? 5 : subtotal > 5000 ? 10 : subtotal > 2000 ? 15 : 20;
  const bonus = reminderCount >= 1 ? 5 : 0;
  const percent = Math.min(25, base + bonus);
  const code = `CART${percent}`;
  const reason = subtotal > 10000
    ? "High-value cart: small incentive to complete"
    : subtotal > 5000
      ? "Mid-value cart: 10% encourages completion"
      : subtotal > 2000
        ? "Standard cart: 15% is a strong motivator"
        : "Lower-value cart: 20% + urgency needed";
  return { percent, code, reason };
}

async function getMailTransport() {
  const [settings] = await db.select().from(emailSettingsTable).limit(1);
  if (!settings?.emailEnabled || !settings.smtpHost || !settings.smtpUser) return null;
  return {
    transport: nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    }),
    from: `${settings.smtpFrom || "KDF NUTS"} <${settings.smtpUser}>`,
    settings,
  };
}

async function markExpiredRecords() {
  const expireAfter = new Date(Date.now() - EXPIRE_THRESHOLD_MS);
  await db
    .update(abandonedCheckoutsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(abandonedCheckoutsTable.status, "active"),
        lt(abandonedCheckoutsTable.lastActivity, expireAfter)
      )
    );
}

/* ─── Track ───────────────────────────────────────── */
router.post("/abandoned-checkouts/track", async (req: Request, res: Response) => {
  const { sessionId, userId, customerName, phone, email, cartItems, subtotal, checkoutStep, customerAddress } =
    req.body as {
      sessionId: string;
      userId?: number;
      customerName?: string;
      phone?: string;
      email?: string;
      cartItems: any[];
      subtotal: number;
      checkoutStep: string;
      customerAddress?: string;
    };

  if (!sessionId || !cartItems || subtotal === undefined || !checkoutStep) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(abandonedCheckoutsTable)
      .where(eq(abandonedCheckoutsTable.sessionId, sessionId))
      .limit(1);

    let checkout;
    if (existing.length > 0) {
      if (existing[0].status === "recovered") { res.json(existing[0]); return; }
      [checkout] = await db
        .update(abandonedCheckoutsTable)
        .set({
          userId: userId ?? existing[0].userId,
          customerName: customerName ?? existing[0].customerName,
          phone: phone ?? existing[0].phone,
          email: email ?? existing[0].email,
          customerAddress: customerAddress ?? existing[0].customerAddress,
          cartItems,
          subtotal: subtotal.toFixed(2),
          checkoutStep,
          status: "active",
          lastActivity: new Date(),
        })
        .where(eq(abandonedCheckoutsTable.sessionId, sessionId))
        .returning();
    } else {
      [checkout] = await db
        .insert(abandonedCheckoutsTable)
        .values({ sessionId, userId, customerName, phone, email, customerAddress, cartItems, subtotal: subtotal.toFixed(2), checkoutStep, status: "active", lastActivity: new Date() })
        .returning();
    }

    res.json(checkout);
  } catch (err) {
    req.log.error(err, "Failed to track abandoned checkout");
    res.status(500).json({ error: "Failed to track" });
  }
});

/* ─── Recover by session ──────────────────────────── */
router.post("/abandoned-checkouts/recover/:sessionId", async (req: Request, res: Response) => {
  try {
    await db
      .update(abandonedCheckoutsTable)
      .set({ status: "recovered", recoveredAt: new Date() })
      .where(eq(abandonedCheckoutsTable.sessionId, req.params["sessionId"] as string));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to mark recovered by session");
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── List ────────────────────────────────────────── */
router.get("/abandoned-checkouts", adminMiddleware, async (req: Request, res: Response) => {
  const { status, page = "1", limit = "20" } = req.query as { status?: string; page?: string; limit?: string };
  try {
    await markExpiredRecords();
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;
    const conditions: any[] = [];
    if (status) conditions.push(eq(abandonedCheckoutsTable.status, status as any));
    const where = conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined;
    const [checkouts, [{ count }]] = await Promise.all([
      db.select().from(abandonedCheckoutsTable).where(where).orderBy(desc(abandonedCheckoutsTable.lastActivity)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(abandonedCheckoutsTable).where(where),
    ]);
    res.json({ checkouts, total: count, page: pageNum, totalPages: Math.ceil(count / pageSize) });
  } catch (err) {
    req.log.error(err, "Failed to list abandoned checkouts");
    res.status(500).json({ error: "Failed to list" });
  }
});

/* ─── Detail ──────────────────────────────────────── */
router.get("/abandoned-checkouts/:id", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const [checkout] = await db.select().from(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.id, parseInt(req.params["id"] as string))).limit(1);
    if (!checkout) { res.status(404).json({ error: "Not found" }); return; }
    res.json(checkout);
  } catch (err) {
    req.log.error(err, "Failed to get abandoned checkout");
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── Recover by id ───────────────────────────────── */
router.put("/abandoned-checkouts/:id/recover", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const [checkout] = await db.update(abandonedCheckoutsTable).set({ status: "recovered", recoveredAt: new Date() }).where(eq(abandonedCheckoutsTable.id, parseInt(req.params["id"] as string))).returning();
    if (!checkout) { res.status(404).json({ error: "Not found" }); return; }
    res.json(checkout);
  } catch (err) {
    req.log.error(err, "Failed to recover abandoned checkout");
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── Delete ──────────────────────────────────────── */
router.delete("/abandoned-checkouts/:id", adminMiddleware, async (req: Request, res: Response) => {
  try {
    await db.delete(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.id, parseInt(req.params["id"] as string)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to delete abandoned checkout");
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── AI discount suggestion ──────────────────────── */
router.get("/abandoned-checkouts/:id/ai-discount", adminMiddleware, async (req: Request, res: Response) => {
  try {
    const [checkout] = await db.select().from(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.id, parseInt(req.params["id"] as string))).limit(1);
    if (!checkout) { res.status(404).json({ error: "Not found" }); return; }
    const subtotal = parseFloat(checkout.subtotal ?? "0");
    const suggestion = suggestDiscount(subtotal, checkout.reminderCount ?? 0);
    res.json(suggestion);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: String(err) });
  }
});

/* ─── WhatsApp notify ─────────────────────────────── */
router.post("/abandoned-checkouts/:id/notify/whatsapp", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  try {
    const [checkout] = await db.select().from(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.id, id)).limit(1);
    if (!checkout) { res.status(404).json({ error: "Not found" }); return; }
    if (!checkout.phone) { res.status(400).json({ error: "No phone number on this cart" }); return; }

    const { customMessage, discountPercent, discountCode } = req.body as {
      customMessage?: string;
      discountPercent?: number;
      discountCode?: string;
    };

    let discountLine = "";
    if (discountPercent && discountPercent > 0) {
      const code = discountCode ?? `CART${discountPercent}`;
      discountLine = `🎁 *Special Offer: ${discountPercent}% OFF!* Use code *${code}*`;
    } else if (discountCode) {
      discountLine = `🎁 Use discount code *${discountCode}*`;
    }

    const message = customMessage ?? buildWaMessage(checkout, discountLine);
    await sendWhatsAppMessage({ phone: normalizePhone(checkout.phone), message });

    const discountApplied = discountPercent ? `${discountPercent}%${discountCode ? " " + discountCode : ""}` : (checkout.discountApplied ?? null);
    await db.update(abandonedCheckoutsTable).set({
      whatsappSent: true,
      reminderCount: (checkout.reminderCount ?? 0) + 1,
      reminderSentAt: new Date(),
      discountApplied,
    }).where(eq(abandonedCheckoutsTable.id, id));

    res.json({ success: true });
  } catch (err) {
    (req as any).log?.error(err, "Failed to send abandoned cart WA");
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Email notify ────────────────────────────────── */
router.post("/abandoned-checkouts/:id/notify/email", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  try {
    const [checkout] = await db.select().from(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.id, id)).limit(1);
    if (!checkout) { res.status(404).json({ error: "Not found" }); return; }
    if (!checkout.email) { res.status(400).json({ error: "No email address on this cart" }); return; }

    const conn = await getMailTransport();
    if (!conn) { res.status(400).json({ error: "Email not configured. Go to Email Settings." }); return; }

    const { discountPercent, discountCode, subject } = req.body as {
      discountPercent?: number;
      discountCode?: string;
      subject?: string;
    };

    let discountLine = "";
    if (discountPercent && discountPercent > 0) {
      const code = discountCode ?? `CART${discountPercent}`;
      discountLine = `${discountPercent}% OFF your order! Use code: ${code}`;
    } else if (discountCode) {
      discountLine = `Special offer! Use code: ${discountCode}`;
    }

    const name = checkout.customerName?.split(" ")[0] ?? "there";
    const isFollowUp = (checkout.reminderCount ?? 0) >= 1;
    const emailSubject = subject ?? (isFollowUp
      ? `⏰ Final reminder: your KDF NUTS cart is still waiting, ${name}!`
      : `🛒 ${name}, you left items in your cart — complete your order!`);

    await conn.transport.sendMail({
      from: conn.from,
      to: checkout.email,
      subject: emailSubject,
      html: buildHtmlEmail(checkout, discountLine, discountPercent ?? 0, isFollowUp),
    });

    const discountApplied = discountPercent ? `${discountPercent}%${discountCode ? " " + discountCode : ""}` : (checkout.discountApplied ?? null);
    await db.update(abandonedCheckoutsTable).set({
      emailSent: true,
      reminderCount: (checkout.reminderCount ?? 0) + 1,
      reminderSentAt: new Date(),
      discountApplied,
    }).where(eq(abandonedCheckoutsTable.id, id));

    res.json({ success: true });
  } catch (err) {
    (req as any).log?.error(err, "Failed to send abandoned cart email");
    res.status(500).json({ error: String(err) });
  }
});

/* ─── Send both (WA + email) ──────────────────────── */
router.post("/abandoned-checkouts/:id/notify/both", adminMiddleware, async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  try {
    const [checkout] = await db.select().from(abandonedCheckoutsTable).where(eq(abandonedCheckoutsTable.id, id)).limit(1);
    if (!checkout) { res.status(404).json({ error: "Not found" }); return; }

    const { discountPercent, discountCode } = req.body as { discountPercent?: number; discountCode?: string };
    let discountLine = "";
    if (discountPercent && discountPercent > 0) {
      const code = discountCode ?? `CART${discountPercent}`;
      discountLine = `🎁 *Special Offer: ${discountPercent}% OFF!* Use code *${code}*`;
    }

    const results: Record<string, any> = {};

    if (checkout.phone) {
      try {
        const message = buildWaMessage(checkout, discountLine);
        await sendWhatsAppMessage({ phone: normalizePhone(checkout.phone), message });
        results.whatsapp = "sent";
      } catch (e) { results.whatsapp = `failed: ${String(e)}`; }
    } else { results.whatsapp = "skipped (no phone)"; }

    if (checkout.email) {
      try {
        const conn = await getMailTransport();
        if (conn) {
          const isFollowUp = (checkout.reminderCount ?? 0) >= 1;
          const emailDiscountLine = discountPercent ? `${discountPercent}% OFF your order! Use code: ${discountCode ?? `CART${discountPercent}`}` : "";
          const name = checkout.customerName?.split(" ")[0] ?? "there";
          await conn.transport.sendMail({
            from: conn.from,
            to: checkout.email,
            subject: isFollowUp ? `⏰ Final reminder: your KDF NUTS cart, ${name}!` : `🛒 ${name}, complete your KDF NUTS order!`,
            html: buildHtmlEmail(checkout, emailDiscountLine, discountPercent ?? 0, isFollowUp),
          });
          results.email = "sent";
        } else { results.email = "skipped (email not configured)"; }
      } catch (e) { results.email = `failed: ${String(e)}`; }
    } else { results.email = "skipped (no email)"; }

    const discountApplied = discountPercent ? `${discountPercent}%${discountCode ? " " + discountCode : ""}` : (checkout.discountApplied ?? null);
    await db.update(abandonedCheckoutsTable).set({
      whatsappSent: results.whatsapp === "sent" ? true : checkout.whatsappSent,
      emailSent: results.email === "sent" ? true : checkout.emailSent,
      reminderCount: (checkout.reminderCount ?? 0) + 1,
      reminderSentAt: new Date(),
      discountApplied,
    }).where(eq(abandonedCheckoutsTable.id, id));

    res.json({ success: true, results });
  } catch (err) {
    (req as any).log?.error(err, "Failed to send both notifications");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
