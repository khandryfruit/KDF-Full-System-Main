/**
 * WhatsApp Automation Engine
 * Runs every 5 minutes — checks IF/THEN rules and fires WA messages for:
 *  - Abandoned cart recovery
 *  - Inactive customer re-engagement
 *  - Post-delivery review request (with coupon)
 *  - Failed delivery follow-up
 *  - Custom schedule rules
 */
import { db, waAutomationRulesTable, waAutomationLogsTable, whatsappSettingsTable, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, and, lte, gte, isNull, desc, sql, ne } from "drizzle-orm";
import { sendWhatsAppMessage, getSettings, normalizePhone } from "./whatsapp";
import { logger } from "./logger";

const ENGINE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/* ── Dedup guard: was this rule already fired for this target today? ── */
async function alreadyFiredToday(ruleId: number, phone: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db.select({ id: waAutomationLogsTable.id })
    .from(waAutomationLogsTable)
    .where(and(
      eq(waAutomationLogsTable.ruleId, ruleId),
      eq(waAutomationLogsTable.phone, phone),
      gte(waAutomationLogsTable.createdAt, cutoff),
    ))
    .limit(1);
  return !!existing;
}

/* ── Log automation run result ── */
async function logRun(opts: {
  ruleId: number; ruleName: string; phone: string; customerName?: string;
  orderId?: number; status: "sent" | "failed" | "skipped"; message?: string; error?: string;
}) {
  await db.insert(waAutomationLogsTable).values({
    ruleId: opts.ruleId, ruleName: opts.ruleName, phone: opts.phone,
    customerName: opts.customerName ?? null, orderId: opts.orderId ?? null,
    status: opts.status, message: opts.message ?? null, error: opts.error ?? null,
  }).catch(() => {});
}

/* ── HANDLER: Abandoned Cart ── */
async function runAbandonedCartRule(rule: any, settings: any) {
  const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;
  const delayMinutes = Number(config["delayMinutes"] ?? 60);
  const couponCode = (config["couponCode"] as string | undefined) ?? null;

  const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000);
  const tooOld  = new Date(Date.now() - 72 * 60 * 60 * 1000); // ignore carts > 72h old

  const rows = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    shippingAddress: ordersTable.shippingAddress,
    createdAt: ordersTable.createdAt,
    total: ordersTable.total,
  })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.status, "pending"),
      lte(ordersTable.createdAt, cutoff),
      gte(ordersTable.createdAt, tooOld),
    ))
    .limit(50);

  for (const order of rows) {
    const addr = order.shippingAddress as any;
    const phone = addr?.phone;
    const name  = addr?.name ?? "Valued Customer";
    if (!phone) continue;

    const normPhone = normalizePhone(phone);
    if (await alreadyFiredToday(rule.id, normPhone)) continue;

    const couponLine = couponCode ? `\n\n🎁 Use code *${couponCode}* for 10% off!` : "";
    const message = (rule.messageTemplate ?? "")
      || `Hi ${name} 👋 You left items worth Rs. ${order.total} in your cart.\n\nComplete your order now before stocks run out! 🛒${couponLine}\n\nShop: https://kdfnuts.com`;

    const personalized = message
      .replace(/\{name\}/g, name)
      .replace(/\{customer_name\}/g, name)
      .replace(/\{order_total\}/g, String(order.total))
      .replace(/\{coupon\}/g, couponCode ?? "");

    const ok = await sendWhatsAppMessage({ phone: normPhone, message: personalized, templateName: `automation:${rule.id}` });
    await logRun({ ruleId: rule.id, ruleName: rule.name, phone: normPhone, customerName: name, orderId: order.id, status: ok ? "sent" : "failed" });
  }
}

/* ── HANDLER: Post-delivery review request ── */
async function runPostDeliveryReviewRule(rule: any, settings: any) {
  const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;
  const delayHours  = Number(config["delayHours"] ?? 24);
  const couponCode  = (config["couponCode"] as string | undefined) ?? null;

  const cutoff    = new Date(Date.now() - delayHours * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - (delayHours + 72) * 60 * 60 * 1000);

  const rows = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    shippingAddress: ordersTable.shippingAddress,
    deliveredAt: ordersTable.deliveredAt,
  })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.status, "delivered"),
      lte(ordersTable.deliveredAt, cutoff),
      gte(ordersTable.deliveredAt, windowEnd),
    ))
    .limit(50);

  for (const order of rows) {
    const addr = order.shippingAddress as any;
    const phone = addr?.phone;
    const name  = addr?.name ?? "Valued Customer";
    if (!phone) continue;

    const normPhone = normalizePhone(phone);
    if (await alreadyFiredToday(rule.id, normPhone)) continue;

    const couponLine = couponCode ? `\n\n🎁 Your next order: Use code *${couponCode}* for 10% off!` : "";
    const message = (rule.messageTemplate ?? "")
      || `Hi ${name} 👋 We hope you're enjoying your KDF NUTS order #${order.orderNumber}!\n\n⭐ Share your experience — your feedback means the world to us.${couponLine}\n\nThank you for shopping with us ❤️`;

    const personalized = message
      .replace(/\{name\}/g, name)
      .replace(/\{customer_name\}/g, name)
      .replace(/\{order_number\}/g, order.orderNumber ?? "")
      .replace(/\{coupon\}/g, couponCode ?? "");

    const ok = await sendWhatsAppMessage({ phone: normPhone, message: personalized, templateName: `automation:${rule.id}` });
    await logRun({ ruleId: rule.id, ruleName: rule.name, phone: normPhone, customerName: name, orderId: order.id, status: ok ? "sent" : "failed" });
  }
}

/* ── HANDLER: Failed delivery follow-up ── */
async function runFailedDeliveryRule(rule: any, settings: any) {
  const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;
  const delayHours = Number(config["delayHours"] ?? 2);

  const cutoff    = new Date(Date.now() - delayHours * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT id, order_number AS "orderNumber", shipping_address AS "shippingAddress", updated_at AS "updatedAt"
    FROM orders
    WHERE status = 'failed_delivery'
      AND updated_at <= ${cutoff.toISOString()}
      AND updated_at >= ${windowEnd.toISOString()}
    LIMIT 50
  `).then(r => r.rows as Array<{ id: number; orderNumber: string; shippingAddress: unknown; updatedAt: Date }>);

  for (const order of rows) {
    const addr = order.shippingAddress as any;
    const phone = addr?.phone;
    const name  = addr?.name ?? "Valued Customer";
    if (!phone) continue;

    const normPhone = normalizePhone(phone);
    if (await alreadyFiredToday(rule.id, normPhone)) continue;

    const message = (rule.messageTemplate ?? "")
      || `Hi ${name} 👋 We tried to deliver your order *#${order.orderNumber}* but couldn't reach you.\n\n📦 Please confirm your availability so we can redeliver.\n\nReply with your preferred time or call us directly.`;

    const personalized = message
      .replace(/\{name\}/g, name)
      .replace(/\{customer_name\}/g, name)
      .replace(/\{order_number\}/g, order.orderNumber ?? "");

    const ok = await sendWhatsAppMessage({ phone: normPhone, message: personalized, templateName: `automation:${rule.id}` });
    await logRun({ ruleId: rule.id, ruleName: rule.name, phone: normPhone, customerName: name, orderId: order.id, status: ok ? "sent" : "failed" });
  }
}

/* ── HANDLER: Inactive customer re-engagement ── */
async function runInactiveCustomerRule(rule: any, settings: any) {
  const config = (rule.triggerConfig ?? {}) as Record<string, unknown>;
  const inactiveDays = Number(config["inactiveDays"] ?? 30);
  const couponCode   = (config["couponCode"] as string | undefined) ?? null;

  const cutoff    = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() - (inactiveDays + 7) * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    SELECT DISTINCT ON ((shipping_address->>'phone'))
      id, order_number, shipping_address, MAX(created_at) AS last_order_at
    FROM orders
    WHERE status != 'cancelled'
    GROUP BY id, order_number, shipping_address
    HAVING MAX(created_at) <= ${cutoff.toISOString()} AND MAX(created_at) >= ${windowEnd.toISOString()}
    LIMIT 50
  `);

  for (const order of rows.rows as any[]) {
    const addr = order.shipping_address;
    const phone = addr?.phone;
    const name  = addr?.name ?? "Valued Customer";
    if (!phone) continue;

    const normPhone = normalizePhone(phone);
    if (await alreadyFiredToday(rule.id, normPhone)) continue;

    const couponLine = couponCode ? `\n\n🎁 Use code *${couponCode}* to get 10% off your next order!` : "";
    const message = (rule.messageTemplate ?? "")
      || `Hi ${name} 👋 We miss you at KDF NUTS! 🥜\n\nIt's been a while since your last order. Come back and enjoy our premium dry fruits!${couponLine}\n\nShop now: https://kdfnuts.com`;

    const personalized = message
      .replace(/\{name\}/g, name)
      .replace(/\{customer_name\}/g, name)
      .replace(/\{coupon\}/g, couponCode ?? "");

    const ok = await sendWhatsAppMessage({ phone: normPhone, message: personalized, templateName: `automation:${rule.id}` });
    await logRun({ ruleId: rule.id, ruleName: rule.name, phone: normPhone, customerName: name, status: ok ? "sent" : "failed" });
  }
}

/* ── Main Engine Loop ── */
async function runAutomationEngine() {
  try {
    const settings = await getSettings();
    if (!settings?.isActive) return;

    const rules = await db.select().from(waAutomationRulesTable)
      .where(eq(waAutomationRulesTable.isActive, true));

    for (const rule of rules) {
      try {
        switch (rule.triggerType) {
          case "cart_abandoned":         await runAbandonedCartRule(rule, settings); break;
          case "order_delivered":        await runPostDeliveryReviewRule(rule, settings); break;
          case "order_failed_delivery":  await runFailedDeliveryRule(rule, settings); break;
          case "customer_inactive":      await runInactiveCustomerRule(rule, settings); break;
          default: break;
        }
        await db.update(waAutomationRulesTable)
          .set({ lastRunAt: new Date(), runCount: sql`run_count + 1` })
          .where(eq(waAutomationRulesTable.id, rule.id)).catch(() => {});
      } catch (err) {
        logger.error({ err, ruleName: rule.name }, "Automation rule error");
      }
    }
  } catch (err) {
    logger.error({ err }, "Automation engine error");
  }
}

export function startWaAutomationEngine() {
  logger.info("WhatsApp Automation Engine started");
  setInterval(runAutomationEngine, ENGINE_INTERVAL_MS);
  setTimeout(runAutomationEngine, 15_000); // first run 15s after boot
}
