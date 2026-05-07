/**
 * Abandoned Cart Recovery Scheduler
 *
 * 2-step recovery flow:
 *  Step 1 — after 1 hour: send WA + Email (no/small discount)
 *  Step 2 — 24 hours after Step 1: send follow-up WA + Email (bigger discount)
 */
import { db, abandonedCheckoutsTable, whatsappSettingsTable, couponsTable, emailSettingsTable } from "@workspace/db";
import { eq, and, lt, isNotNull, or, lte } from "drizzle-orm";
import { sendWhatsAppMessage, normalizePhone } from "./whatsapp";
import { logger } from "./logger";
import nodemailer from "nodemailer";

const STEP1_DELAY_MS = 60 * 60 * 1000;   // 1 hour
const STEP2_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours after step 1

function buildCartItemsList(cartItems: any[]): string {
  return cartItems.map((i: any) => {
    const lineTotal = (parseFloat(i.price ?? "0") * (i.qty ?? 1)).toLocaleString();
    const label = i.variantLabel ? ` (${i.variantLabel})` : "";
    return `• ${i.name}${label}\n  ${i.qty} × PKR ${parseFloat(i.price ?? "0").toLocaleString()} = PKR ${lineTotal}`;
  }).join("\n");
}

function buildHtmlEmail(checkout: any, discountLine: string, discountPercent: number, isFollowUp: boolean): string {
  const name = checkout.customerName ? checkout.customerName.split(" ")[0] : "there";
  const items: any[] = checkout.cartItems ?? [];
  const subtotal = parseFloat(checkout.subtotal ?? "0");
  const finalTotal = discountPercent > 0 ? subtotal * (1 - discountPercent / 100) : subtotal;

  const rows = items.map((i: any) => {
    const lineTotal = parseFloat(i.price ?? "0") * (i.qty ?? 1);
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0"><strong>${i.name}</strong>${i.variantLabel ? `<br><small>${i.variantLabel}</small>` : ""}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;text-align:center">×${i.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600">PKR ${lineTotal.toLocaleString()}</td>
    </tr>`;
  }).join("");

  const discountRow = discountPercent > 0
    ? `<tr><td colspan="2" style="padding:8px;text-align:right;color:#e53e3e">Discount (${discountPercent}%)</td><td style="padding:8px;text-align:right;color:#e53e3e;font-weight:bold">-PKR ${(subtotal * discountPercent / 100).toLocaleString()}</td></tr>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f8fa;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
  <div style="background:#5FA800;padding:24px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px">🥜 KDF NUTS</h1>
  </div>
  <div style="padding:28px 32px">
    ${isFollowUp ? `<div style="background:#fff3cd;border-left:4px solid #f59e0b;padding:12px 16px;margin-bottom:20px;border-radius:0 8px 8px 0;font-size:13px;color:#92400e">⏰ <strong>Final reminder</strong> — your cart is still saved!</div>` : ""}
    <h2 style="color:#222;margin:0 0 12px">Hi ${name}, you left items behind! 🛒</h2>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f6f8fa">
        <th style="padding:10px 8px;text-align:left;font-size:12px;color:#888;text-transform:uppercase">Product</th>
        <th style="padding:10px 8px;text-align:center;font-size:12px;color:#888;text-transform:uppercase">Qty</th>
        <th style="padding:10px 8px;text-align:right;font-size:12px;color:#888;text-transform:uppercase">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        ${discountRow}
        <tr style="background:#f6f8fa">
          <td colspan="2" style="padding:12px 8px;text-align:right;font-weight:700;font-size:15px">Order Total:</td>
          <td style="padding:12px 8px;text-align:right;font-weight:700;font-size:17px;color:#5FA800">PKR ${finalTotal.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>
    ${discountLine ? `<div style="background:#f0fdf4;border:2px solid #5FA800;border-radius:10px;padding:14px 18px;margin:20px 0;text-align:center"><p style="margin:0;font-size:14px;color:#166534;font-weight:600">🎁 ${discountLine}</p></div>` : ""}
    <div style="text-align:center;margin:24px 0">
      <a href="https://kdfnuts.com" style="display:inline-block;background:#5FA800;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:15px;font-weight:700">Complete Your Order →</a>
    </div>
  </div>
  <div style="background:#f6f8fa;padding:16px 32px;text-align:center;border-top:1px solid #eee">
    <p style="color:#aaa;font-size:11px;margin:0">KDF NUTS · Pakistan's Premium Dry Fruits · kdfnuts.com</p>
  </div>
</div></body></html>`;
}

async function getMailTransport() {
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (!settings?.emailEnabled || !settings.smtpHost || !settings.smtpUser) return null;
    return {
      transport: nodemailer.createTransport({
        host: settings.smtpHost, port: settings.smtpPort,
        secure: settings.smtpPort === 465,
        auth: { user: settings.smtpUser, pass: settings.smtpPass },
      }),
      from: `${settings.smtpFrom || "KDF NUTS"} <${settings.smtpUser}>`,
    };
  } catch { return null; }
}

export async function runAbandonedCheckoutRecovery(): Promise<void> {
  try {
    const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
    if (!settings?.isActive || !settings.abandonedRecoveryEnabled) return;

    const delayMs = (settings.abandonedRecoveryDelayMinutes ?? 60) * 60 * 1000;
    const step1Cutoff = new Date(Date.now() - Math.max(delayMs, STEP1_DELAY_MS));
    const step2Cutoff = new Date(Date.now() - STEP2_DELAY_MS);

    /* ── Step 1: first reminder ── */
    const step1Candidates = await db
      .select()
      .from(abandonedCheckoutsTable)
      .where(and(
        eq(abandonedCheckoutsTable.status, "active"),
        eq(abandonedCheckoutsTable.reminderCount, 0),
        lt(abandonedCheckoutsTable.lastActivity, step1Cutoff),
      ))
      .limit(30);

    /* ── Step 2: follow-up reminder ── */
    const step2Candidates = await db
      .select()
      .from(abandonedCheckoutsTable)
      .where(and(
        eq(abandonedCheckoutsTable.status, "active"),
        eq(abandonedCheckoutsTable.reminderCount, 1),
        lt(abandonedCheckoutsTable.reminderSentAt!, step2Cutoff),
      ))
      .limit(30);

    /* Get coupon from settings */
    let couponForStep1 = "";
    let couponForStep2 = "";
    if (settings.abandonedRecoveryCouponCode) {
      const [coupon] = await db.select().from(couponsTable)
        .where(and(eq(couponsTable.code, settings.abandonedRecoveryCouponCode.toUpperCase()), eq(couponsTable.active, true)))
        .limit(1);
      if (coupon) {
        const val = coupon.type === "percentage" ? `${coupon.value}% OFF` : `Rs. ${coupon.value} OFF`;
        couponForStep1 = `\n\n🎁 Use code *${coupon.code}* — *${val}*`;
        couponForStep2 = `\n\n🎁 Final deal: *${coupon.code}* — *${val}* (expires soon!)`;
      }
    }

    const mail = await getMailTransport();

    /* Process Step 1 candidates */
    for (const checkout of step1Candidates) {
      try {
        const name = checkout.customerName ? checkout.customerName.split(" ")[0] : "there";
        const itemList = buildCartItemsList(checkout.cartItems as any[]);
        const total = parseFloat(checkout.subtotal ?? "0").toLocaleString();

        const waMsg = `Hi ${name}! 👋\n\n🛒 *You left items in your KDF NUTS cart:*\n\n${itemList}\n\n💰 *Cart Total: PKR ${total}*${couponForStep1}\n\n✅ Complete your order now!\n👉 https://kdfnuts.com`;

        let waSent = false;
        if (checkout.phone) {
          try {
            await sendWhatsAppMessage({ phone: normalizePhone(checkout.phone), message: waMsg, templateName: "abandoned_cart_recovery", userId: checkout.userId ?? undefined });
            waSent = true;
          } catch (e) { logger.warn({ e, id: checkout.id }, "Step 1 WA failed"); }
        }

        let emailSentOk = false;
        if (checkout.email && mail) {
          try {
            const discountLine = couponForStep1 ? `Use code ${settings.abandonedRecoveryCouponCode?.toUpperCase()} for a special discount!` : "";
            await mail.transport.sendMail({
              from: mail.from, to: checkout.email,
              subject: `🛒 ${name}, you left items in your cart at KDF NUTS!`,
              html: buildHtmlEmail(checkout, discountLine, 0, false),
            });
            emailSentOk = true;
          } catch (e) { logger.warn({ e, id: checkout.id }, "Step 1 email failed"); }
        }

        await db.update(abandonedCheckoutsTable).set({
          whatsappSent: waSent ? true : checkout.whatsappSent,
          emailSent: emailSentOk ? true : checkout.emailSent,
          reminderCount: 1,
          reminderSentAt: new Date(),
        }).where(eq(abandonedCheckoutsTable.id, checkout.id));

        logger.info({ id: checkout.id, waSent, emailSentOk }, "Step 1 reminder sent");
      } catch (err) { logger.error({ err, id: checkout.id }, "Step 1 failed"); }
    }

    /* Process Step 2 candidates */
    for (const checkout of step2Candidates) {
      try {
        const subtotal = parseFloat(checkout.subtotal ?? "0");
        const discountPct = subtotal > 5000 ? 10 : 15;
        const discountCode = `BACK${discountPct}`;
        const name = checkout.customerName ? checkout.customerName.split(" ")[0] : "there";
        const itemList = buildCartItemsList(checkout.cartItems as any[]);
        const total = subtotal.toLocaleString();
        const couponLine = couponForStep2 || `\n\n🎁 *${discountPct}% OFF — Code: ${discountCode}* (Final offer!)`;

        const waMsg = `Hi ${name}! ⏰\n\n*Final reminder* — your KDF NUTS cart is still saved!\n\n🛒 *Items:*\n${itemList}\n\n💰 *Total: PKR ${total}*${couponLine}\n\n⚡ Complete your order now before it expires!\n👉 https://kdfnuts.com`;

        let waSent = false;
        if (checkout.phone) {
          try {
            await sendWhatsAppMessage({ phone: normalizePhone(checkout.phone), message: waMsg, userId: checkout.userId ?? undefined });
            waSent = true;
          } catch (e) { logger.warn({ e, id: checkout.id }, "Step 2 WA failed"); }
        }

        let emailSentOk = false;
        if (checkout.email && mail) {
          try {
            const emailDiscountLine = couponForStep2 ? "Special discount — use your coupon code!" : `${discountPct}% OFF! Use code: ${discountCode}`;
            await mail.transport.sendMail({
              from: mail.from, to: checkout.email,
              subject: `⏰ Final reminder, ${name}: your KDF NUTS cart expires soon!`,
              html: buildHtmlEmail(checkout, emailDiscountLine, discountPct, true),
            });
            emailSentOk = true;
          } catch (e) { logger.warn({ e, id: checkout.id }, "Step 2 email failed"); }
        }

        await db.update(abandonedCheckoutsTable).set({
          whatsappSent: waSent ? true : checkout.whatsappSent,
          emailSent: emailSentOk ? true : checkout.emailSent,
          reminderCount: 2,
          reminderSentAt: new Date(),
          discountApplied: `${discountPct}% (${discountCode})`,
        }).where(eq(abandonedCheckoutsTable.id, checkout.id));

        logger.info({ id: checkout.id, waSent, emailSentOk, discountPct }, "Step 2 reminder sent");
      } catch (err) { logger.error({ err, id: checkout.id }, "Step 2 failed"); }
    }

    const total = step1Candidates.length + step2Candidates.length;
    if (total > 0) logger.info({ step1: step1Candidates.length, step2: step2Candidates.length }, "Abandoned cart recovery batch done");
  } catch (err) {
    logger.error(err, "Abandoned checkout recovery job failed");
  }
}

export function startAbandonedRecoveryScheduler(): void {
  const INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => { runAbandonedCheckoutRecovery().catch(() => {}); }, INTERVAL_MS);
  runAbandonedCheckoutRecovery().catch(() => {});
  logger.info("Abandoned checkout recovery scheduler started (runs every 5 minutes)");
}
