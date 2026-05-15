/**
 * Online Payment Routes — JazzCash + Easypaisa
 *
 * JazzCash flow:
 *   POST /api/payments/jazzcash/initiate  → returns { actionUrl, formFields }
 *   POST /api/payments/jazzcash/callback  ← JazzCash posts here on completion
 *   GET  /api/payments/jazzcash/return    ← browser redirect after payment
 *
 * Easypaisa flow:
 *   POST /api/payments/easypaisa/initiate → returns { payload, apiUrl, webUrl }
 *   POST /api/payments/easypaisa/callback ← Easypaisa posts here on completion
 *   GET  /api/payments/easypaisa/return   ← browser redirect after payment
 */

import { Router } from "express";
import { adminMiddleware } from "../lib/auth.js";
import { db, paymentGatewaysTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as JazzCash  from "../lib/jazzcash";
import * as Easypaisa from "../lib/easypaisa";
import { fireCapiPurchase } from "../lib/metaCapi";

const router = Router();

/* ─── helpers ─────────────────────────────────────────── */
async function getGatewaySettings(type: string): Promise<any> {
  const [row] = await db.select().from(paymentGatewaysTable)
    .where(eq(paymentGatewaysTable.type, type as any)).limit(1);
  if (!row?.isActive) throw new Error(`${type} gateway is not configured or inactive`);
  return row;
}

async function markOrderPaid(orderId: number, txnRef: string, gateway: string) {
  const [order] = await db.update(ordersTable).set({
    paymentStatus: "paid",
    status: "confirmed",
    referenceNumber: txnRef,
    confirmedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId)).returning();
  return order;
}

/* ══════════════════════════════════════════════════════
   JAZZCASH
══════════════════════════════════════════════════════ */

/**
 * POST /api/payments/jazzcash/initiate
 * Body: { orderId: number, amount: number, orderDesc?: string, customerEmail?, customerMobile? }
 * Returns: { actionUrl, formFields } — frontend submits these as an HTML form POST to JazzCash
 */
router.post("/payments/jazzcash/initiate", async (req, res) => {
  try {
    const { orderId, amount, orderDesc, customerEmail, customerMobile } = req.body;
    if (!orderId || !amount) {
      res.status(400).json({ error: "orderId and amount are required" }); return;
    }

    const gw = await getGatewaySettings("jazzcash");
    const settings: JazzCash.JazzCashSettings = {
      merchantId:      gw.apiKey,
      password:        gw.secretKey,
      integrationSalt: gw.webhookSecret,
      returnUrl:       `${process.env.API_BASE_URL ?? ""}/api/payments/jazzcash/return`,
      isSandbox:       gw.config?.sandbox ?? false,
    };

    const { actionUrl, formFields } = JazzCash.buildJazzCashForm(settings, {
      amount:         Number(amount),
      orderId:        String(orderId),
      orderDesc:      orderDesc ?? `KDF NUTS Order #${orderId}`,
      customerEmail,
      customerMobile,
      returnUrl:      settings.returnUrl,
    });

    res.json({ actionUrl, formFields });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/payments/jazzcash/callback
 * JazzCash server-to-server POST after payment — verify hash, update order
 */
router.post("/payments/jazzcash/callback", async (req, res) => {
  try {
    const data = req.body as Record<string, string>;
    const gw = await getGatewaySettings("jazzcash");

    const isValid = JazzCash.verifyJazzCashCallback(data, gw.webhookSecret);
    if (!isValid) {
      req.log.warn({ data }, "JazzCash callback: invalid hash");
      res.status(400).json({ error: "Invalid signature" }); return;
    }

    const responseCode = data.pp_ResponseCode ?? "";
    const txnRef       = data.pp_TxnRefNo ?? "";
    const billRef      = data.pp_BillReference ?? "";
    const orderId      = parseInt(billRef);

    req.log.info({ responseCode, txnRef, orderId }, "JazzCash callback received");

    if (JazzCash.isJazzCashSuccess(responseCode) && orderId) {
      const order = await markOrderPaid(orderId, txnRef, "jazzcash");
      if (order) {
        // Fire Meta CAPI Purchase event
        const items = (order as any).items ?? [];
        fireCapiPurchase({
          id: order.id, orderNumber: order.orderNumber,
          total: order.total, items,
          shippingAddress: order.shippingAddress as any,
        }, { ip: req.ip, headers: req.headers as any }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/payments/jazzcash/return
 * Browser redirect after JazzCash payment — parse result and redirect to storefront
 */
router.get("/payments/jazzcash/return", async (req, res) => {
  const responseCode = req.query.pp_ResponseCode as string ?? "";
  const orderId      = req.query.pp_BillReference as string ?? "";
  const txnRef       = req.query.pp_TxnRefNo as string ?? "";
  const isSuccess    = JazzCash.isJazzCashSuccess(responseCode);

  const frontendBase = process.env.STOREFRONT_URL ?? "";
  if (isSuccess) {
    res.redirect(`${frontendBase}/order-success?orderId=${orderId}&paymentMethod=jazzcash&referenceNumber=${encodeURIComponent(txnRef)}`);
  } else {
    const msg = JazzCash.JAZZCASH_RESPONSE_CODES[responseCode] ?? "Payment failed";
    res.redirect(`${frontendBase}/checkout?error=${encodeURIComponent(msg)}&paymentMethod=jazzcash`);
  }
});

/* ══════════════════════════════════════════════════════
   EASYPAISA
══════════════════════════════════════════════════════ */

/**
 * POST /api/payments/easypaisa/initiate
 * Body: { orderId, amount, customerMobile, customerEmail? }
 * Returns: { payload, apiUrl, webUrl } — frontend submits POST to apiUrl or redirects to webUrl
 */
router.post("/payments/easypaisa/initiate", async (req, res) => {
  try {
    const { orderId, amount, customerMobile, customerEmail } = req.body;
    if (!orderId || !amount) {
      res.status(400).json({ error: "orderId and amount are required" }); return;
    }

    const gw = await getGatewaySettings("easypaisa");
    const settings: Easypaisa.EasypaisaSettings = {
      storeId:   gw.apiKey,
      hashKey:   gw.secretKey,
      returnUrl: `${process.env.API_BASE_URL ?? ""}/api/payments/easypaisa/return`,
      isSandbox: gw.config?.sandbox ?? false,
    };

    const result = Easypaisa.buildEasypaisaPayload(settings, {
      amount:         Number(amount),
      orderId:        String(orderId),
      orderDesc:      `KDF NUTS Order #${orderId}`,
      customerEmail,
      customerMobile,
      returnUrl:      settings.returnUrl,
    });

    res.json(result);
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/payments/easypaisa/callback
 * Easypaisa server-to-server callback — verify, update order
 */
router.post("/payments/easypaisa/callback", async (req, res) => {
  try {
    const data = req.body as Record<string, string>;
    const gw   = await getGatewaySettings("easypaisa");

    const isValid = Easypaisa.verifyEasypaisaCallback(data, gw.secretKey);
    if (!isValid) {
      req.log.warn({ data }, "Easypaisa callback: invalid hash");
      res.status(400).json({ error: "Invalid signature" }); return;
    }

    const responseCode = data.responseCode ?? data.status ?? "";
    const txnRef       = data.transactionId ?? data.orderRefNum ?? "";
    const orderRef     = data.orderRefNum   ?? "";
    const orderId      = parseInt(orderRef);

    req.log.info({ responseCode, txnRef, orderId }, "Easypaisa callback received");

    if (Easypaisa.isEasypaisaSuccess(responseCode) && orderId) {
      const order = await markOrderPaid(orderId, txnRef, "easypaisa");
      if (order) {
        const items = (order as any).items ?? [];
        fireCapiPurchase({
          id: order.id, orderNumber: order.orderNumber,
          total: order.total, items,
          shippingAddress: order.shippingAddress as any,
        }, { ip: req.ip, headers: req.headers as any }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/payments/easypaisa/return
 * Browser redirect after Easypaisa payment
 */
router.get("/payments/easypaisa/return", async (req, res) => {
  const responseCode = req.query.responseCode as string ?? req.query.status as string ?? "";
  const orderId      = req.query.orderRefNum as string ?? "";
  const txnRef       = req.query.transactionId as string ?? "";
  const isSuccess    = Easypaisa.isEasypaisaSuccess(responseCode);

  const frontendBase = process.env.STOREFRONT_URL ?? "";
  if (isSuccess) {
    res.redirect(`${frontendBase}/order-success?orderId=${orderId}&paymentMethod=easypaisa&referenceNumber=${encodeURIComponent(txnRef)}`);
  } else {
    const msg = Easypaisa.EASYPAISA_RESPONSE_CODES[responseCode] ?? "Payment failed";
    res.redirect(`${frontendBase}/checkout?error=${encodeURIComponent(msg)}&paymentMethod=easypaisa`);
  }
});

/* ── Admin: test gateway connection ───────────────────── */
router.post("/admin/payments/test-gateway", adminMiddleware, async (req, res) => {
  try {
    const { type } = req.body;
    const gw = await getGatewaySettings(type);
    res.json({ ok: true, gateway: gw.displayName, isSandbox: gw.config?.sandbox ?? false });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
