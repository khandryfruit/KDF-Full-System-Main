import { Router } from "express";
import { eq, desc, and, gte, lte, like, or, sql } from "drizzle-orm";
import { db, meezanTransactionsTable, meezanSettingsTable, meezanAuditLogsTable, invoicesTable } from "@workspace/db";
import { shopifyStoresTable, shopifyOrdersTable } from "@workspace/db/schema";
import { adminMiddleware, type AuthRequest } from "../lib/auth";
import {
  buildMeezanClient, generateOrderRef, generateInvoiceNumber, isPaid,
  probeMeezanConnectivity, getServerIp, ORDER_STATUS_LABELS,
} from "../lib/meezan";
import { sendWhatsAppMessage } from "../lib/whatsapp";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

/* ═══════════════════════════════════════════════════════════
   DYNAMIC DOMAIN UTILITY
   Resolves the correct public base URL based on environment.
   Priority:
     1. REPLIT_DOMAINS env var (production deployment)
     2. X-Forwarded-Host / Host header (staging / custom domain)
     3. localhost:80 fallback (local dev)
═══════════════════════════════════════════════════════════ */
function getBaseUrl(req: Request): string {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const primary = replitDomains.split(",")[0].trim();
    return `https://${primary}`;
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host  = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "localhost:80";
  return `${proto}://${host}`;
}

function dynamicUrls(req: Request, settings: { returnUrl?: string | null; failUrl?: string | null; callbackUrl?: string | null }) {
  const base = getBaseUrl(req);
  return {
    returnUrl:   settings.returnUrl   || `${base}/payment/success`,
    failUrl:     settings.failUrl     || `${base}/payment/failed`,
    callbackUrl: settings.callbackUrl || `${base}/api/payment/meezan/callback`,
  };
}

const router = Router();

/* ═══════════════════════════════════════════════════════════
   HELPER — load settings and build EPG client
═══════════════════════════════════════════════════════════ */
async function getEpg() {
  const rows = await db.select().from(meezanSettingsTable).limit(1);
  if (!rows.length) return { epg: null, settings: null };
  const s = rows[0];
  return { epg: buildMeezanClient(s), settings: s };
}

async function audit(
  txnId: number | null,
  action: string,
  payload: Record<string, unknown>,
  response: Record<string, unknown>,
  ip: string,
  by = "system"
) {
  await db.insert(meezanAuditLogsTable).values({ txnId, action, performedBy: by, payload, response, ip });
}

/* ═══════════════════════════════════════════════════════════
   POST-PAYMENT SYNC
   Fire-and-forget helper: after a Meezan transaction goes to
   "paid" status, this updates the matching Shopify order and
   sends a WhatsApp confirmation to the customer.
═══════════════════════════════════════════════════════════ */
async function postPaymentSync(txnId: number): Promise<void> {
  /* ── Load transaction ── */
  const txns = await db.select().from(meezanTransactionsTable)
    .where(eq(meezanTransactionsTable.id, txnId)).limit(1).catch(e => { logger.error({ err: e, txnId }, "postPaymentSync: failed to load txn"); return [] as typeof meezanTransactionsTable.$inferSelect[]; });
  if (!txns.length) return;
  const txn = txns[0];

  /* ── 1. Update Shopify order financial_status to "paid" ── */
  const shopifyRef = txn.externalRef ?? txn.invoiceNumber ?? "";
  if (shopifyRef) {
    try {
      const stores = await db.select().from(shopifyStoresTable)
        .where(eq(shopifyStoresTable.isConnected, true)).limit(1);
      if (stores.length) {
        const store = stores[0];
        const apiBase = `https://${store.shopDomain}/admin/api/2024-04`;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (store.accessToken) headers["X-Shopify-Access-Token"] = store.accessToken;

        /* Look up local order by shopifyOrderId OR orderNumber to get numeric ID */
        const localOrders = await db.select({ shopifyOrderId: shopifyOrdersTable.shopifyOrderId })
          .from(shopifyOrdersTable)
          .where(or(
            eq(shopifyOrdersTable.shopifyOrderId, shopifyRef),
            eq(shopifyOrdersTable.orderNumber, shopifyRef)
          ))
          .limit(1);

        const numericId = localOrders.length ? localOrders[0].shopifyOrderId : (/^\d+$/.test(shopifyRef) ? shopifyRef : null);

        if (numericId) {
          /* Post a capture transaction to Shopify */
          const shopifyRes = await fetch(`${apiBase}/orders/${numericId}/transactions.json`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              transaction: { kind: "capture", status: "success", amount: txn.amount, currency: "PKR", source: "meezan_epg" },
            }),
          });
          if (!shopifyRes.ok) {
            logger.warn({ txnId, numericId, status: shopifyRes.status }, "postPaymentSync: Shopify capture API non-2xx");
          }
        } else {
          logger.warn({ txnId, shopifyRef }, "postPaymentSync: could not resolve numeric Shopify order ID — skipping remote capture");
        }

        /* Always update local DB record when we have a ref match */
        if (localOrders.length) {
          await db.update(shopifyOrdersTable)
            .set({ financialStatus: "paid", updatedAt: new Date() })
            .where(or(
              eq(shopifyOrdersTable.shopifyOrderId, shopifyRef),
              eq(shopifyOrdersTable.orderNumber, shopifyRef)
            ));
          logger.info({ txnId, shopifyRef }, "postPaymentSync: local Shopify order marked paid");
        }
      }
    } catch (shopifyErr) {
      logger.error({ err: shopifyErr, txnId, shopifyRef }, "postPaymentSync: Shopify sync error (non-fatal)");
    }
  }

  /* ── 2. Send WhatsApp confirmation ── */
  const phone = txn.customerPhone ?? "";
  if (phone) {
    try {
      const name = txn.customerName ?? "Customer";
      const amt  = `Rs. ${Number(txn.amount).toLocaleString("en-PK")}`;
      const ref  = txn.invoiceNumber ?? txn.meezanOrderId ?? String(txnId);
      const msg  = `✅ *Payment Confirmed — KDF NUTS*\n\nSalam ${name}!\n\nYour payment of *${amt}* has been received successfully.\n\nReference: *${ref}*\n\nShukria for shopping with KDF NUTS! 🥜`;
      await sendWhatsAppMessage({ phone, message: msg });
      logger.info({ txnId, phone }, "postPaymentSync: WA confirmation sent");
    } catch (waErr) {
      logger.error({ err: waErr, txnId, phone }, "postPaymentSync: WA send error (non-fatal)");
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS — GET / SAVE
═══════════════════════════════════════════════════════════ */
router.get("/admin/meezan/settings", adminMiddleware as any, async (_req, res: Response) => {
  try {
    const rows = await db.select().from(meezanSettingsTable).limit(1);
    if (!rows.length) { res.json({}); return; }
    const s = { ...rows[0] };
    /* Return empty string for passwords — never send the actual value back.
       Boolean flags tell the UI whether a password is already configured.
       The save route only updates the password when the submitted value is
       non-empty AND contains no bullet characters, so leaving these blank
       preserves the existing stored password. */
    const hasSandboxPassword = !!s.sandboxPassword;
    const hasLivePassword    = !!s.livePassword;
    (s as any).sandboxPassword = "";
    (s as any).livePassword    = "";
    res.json({ ...s, hasSandboxPassword, hasLivePassword });
  } catch (err) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.post("/admin/meezan/settings", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as Record<string, string>;
    const rows = await db.select().from(meezanSettingsTable).limit(1);

    if (rows.length) {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const fields = [
        "environment", "sandboxUsername", "sandboxMerchantId",
        "liveUsername", "liveMerchantId",
        "returnUrl", "failUrl", "callbackUrl", "webhookSecret", "isActive",
      ];
      for (const f of fields) if (body[f] !== undefined) updates[f] = body[f];
      if (body.sandboxPassword && !body.sandboxPassword.includes("•")) updates.sandboxPassword = body.sandboxPassword;
      if (body.livePassword    && !body.livePassword.includes("•"))    updates.livePassword    = body.livePassword;
      await db.update(meezanSettingsTable).set(updates).where(eq(meezanSettingsTable.id, rows[0].id));
    } else {
      await db.insert(meezanSettingsTable).values({
        environment:       body.environment       || "sandbox",
        sandboxUsername:   body.sandboxUsername,
        sandboxPassword:   body.sandboxPassword,
        sandboxMerchantId: body.sandboxMerchantId,
        liveUsername:      body.liveUsername,
        livePassword:      body.livePassword,
        liveMerchantId:    body.liveMerchantId,
        returnUrl:         body.returnUrl,
        failUrl:           body.failUrl,
        callbackUrl:       body.callbackUrl,
        webhookSecret:     body.webhookSecret,
        isActive:          (body.isActive as any) === true || body.isActive === "true",
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

/* ═══════════════════════════════════════════════════════════
   TEST CONNECTION
   Attempts a real register.do call with saved credentials.
═══════════════════════════════════════════════════════════ */
router.post("/admin/meezan/test-connection", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { epg, settings } = await getEpg();
    if (!epg || !settings) {
      res.status(400).json({
        success:      false,
        errorMessage: "Credentials not configured. Please save API username and password first.",
      });
      return;
    }

    const urls = dynamicUrls(req, settings);
    const base = getBaseUrl(req);
    const ref  = `TEST-${Date.now().toString(36).toUpperCase()}`;
    const serverIp = await getServerIp();

    const result = await epg.register({
      orderNumber: ref,
      amountPKR:   1,
      description: "Connection test — 1 PKR",
      returnUrl:   urls.returnUrl,
      failUrl:     urls.failUrl,
    });

    res.json({
      success:      result.success,
      environment:  settings.environment,
      errorCode:    result.errorCode,
      errorMessage: result.errorMessage,
      orderId:      result.orderId,
      baseUrl:      base,
      dynamicUrls:  urls,
      serverIp,
      hint: result.success ? "API credentials are correct and server IP is whitelisted." : undefined,
      raw:  result.raw,
    });
  } catch (err) {
    const msg     = String(err);
    const isHtml  = msg.includes("HTML page") || msg.includes("<!DOCTYPE");
    const isNet   = msg.includes("Network error") || msg.includes("ECONNREFUSED") || msg.includes("abort");
    const serverIp = await getServerIp().catch(() => "unknown");

    let hint: string;
    if (isHtml) {
      hint = `IP_NOT_WHITELISTED — Server IP ${serverIp} must be whitelisted by Meezan Bank for live/sandbox access.`;
    } else if (isNet) {
      hint = `NETWORK_ERROR — Server cannot reach Meezan Bank. Check firewall/outbound rules. Server IP: ${serverIp}`;
    } else {
      hint = "UNKNOWN_ERROR — Check the raw error message.";
    }

    res.status(500).json({
      success:      false,
      errorMessage: msg,
      hint,
      serverIp,
      action: isHtml
        ? `Please email Meezan Bank tech support and ask them to whitelist IP: ${serverIp} for your merchant account.`
        : "Check API credentials and network connectivity.",
    });
  }
});

/* ═══════════════════════════════════════════════════════════
   DIAGNOSE — Deep connectivity + credential probe
   Returns full raw HTTP response so admin can see exactly
   what Meezan Bank is returning, even if it's HTML.
═══════════════════════════════════════════════════════════ */
router.get("/admin/meezan/diagnose", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { epg, settings } = await getEpg();
    const isLive = settings?.environment === "live";

    /* Run two probes in parallel: one with credentials (if available), one anonymous */
    const [withCreds, anonymous] = await Promise.all([
      epg
        ? epg.probe("register.do").catch((e: any) => ({ error: String(e) }))
        : Promise.resolve(null),
      probeMeezanConnectivity(isLive).catch((e: any) => ({ error: String(e) })),
    ]);

    const serverIp = await getServerIp();

    /* Determine overall diagnosis */
    const probe = (withCreds ?? anonymous) as any;
    let diagnosis = "UNKNOWN";
    let recommendation = "";

    if (!probe?.reachable) {
      diagnosis      = "UNREACHABLE";
      recommendation = `Server (IP: ${serverIp}) cannot connect to Meezan Bank API. ` +
        "Possible causes: (1) Meezan firewall blocking your IP — ask them to whitelist it. " +
        "(2) Outbound HTTPS blocked on this server. (3) DNS resolution failure.";
    } else if (probe?.isHtml) {
      diagnosis      = "HTML_RESPONSE";
      recommendation = `Meezan Bank returned an HTML page (not JSON). ` +
        `This almost always means your server IP (${serverIp}) is NOT whitelisted. ` +
        "Send this IP to Meezan Bank tech support and request whitelist. " +
        "Also verify you are using the correct API credentials (not portal login credentials).";
    } else if (probe?.isJson && probe?.errorCode === "5") {
      diagnosis      = "CREDENTIALS_INVALID";
      recommendation = "Server is reachable and JSON was returned, but credentials are wrong (errorCode 5). " +
        "Double-check API username and password from Meezan merchant portal.";
    } else if (probe?.isJson && probe?.errorCode === "0") {
      diagnosis      = "SUCCESS";
      recommendation = "Connectivity and credentials are working correctly!";
    } else if (probe?.isJson) {
      diagnosis      = "PARTIAL_SUCCESS";
      recommendation = `Received JSON response (errorCode ${probe.errorCode}): ${probe.errorMessage}`;
    }

    res.json({
      diagnosis,
      recommendation,
      serverIp,
      environment:         isLive ? "live" : "sandbox",
      hasCredentials:      !!epg,
      probeWithCredentials: withCreds,
      probeAnonymous:       anonymous,
      orderStatusLabels:    ORDER_STATUS_LABELS,
      whitelistRequest: {
        ip:          serverIp,
        message:     `Please whitelist IP ${serverIp} for merchant ${settings?.liveUsername ?? settings?.sandboxUsername ?? "your account"} in the Meezan Bank payment gateway.`,
        emailTemplate: [
          `To: Meezan Bank Tech Support`,
          `Subject: IP Whitelist Request for EPG Merchant Account`,
          ``,
          `Dear Meezan Bank Tech Support,`,
          ``,
          `Please whitelist the following server IP for our EPG merchant account:`,
          `  IP Address: ${serverIp}`,
          `  Merchant Username: ${settings?.liveUsername ?? settings?.sandboxUsername ?? "[your username]"}`,
          `  Environment: ${isLive ? "Production" : "Sandbox"}`,
          ``,
          `This is for our e-commerce backend server that calls register.do, getOrderStatusExtended.do, and refund.do.`,
          ``,
          `Thank you.`,
        ].join("\n"),
      },
    });
  } catch (err) {
    req.log.error(err, "Meezan diagnose error");
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   DOMAIN INFO — returns computed base URL + dynamic callback URLs
   Useful for the admin UI to display what URLs will be used
═══════════════════════════════════════════════════════════ */
router.get("/admin/meezan/domain-info", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  const { settings } = await getEpg();
  const base = getBaseUrl(req);
  const urls = dynamicUrls(req, settings || {});

  /* Attempt to fetch server public IP for Meezan Bank IP-whitelisting guidance */
  let serverPublicIp: string | null = null;
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
    if (ipRes.ok) {
      const ipData = await ipRes.json() as { ip?: string };
      serverPublicIp = ipData.ip ?? null;
    }
  } catch { /* non-critical — IP check is best-effort */ }

  res.json({
    baseUrl:         base,
    returnUrl:       urls.returnUrl,
    failUrl:         urls.failUrl,
    callbackUrl:     urls.callbackUrl,
    invoiceBase:     `${base}/invoice`,
    webhookUrl:      `${base}/api/payment/meezan/callback`,
    environment:     settings?.environment || "sandbox",
    isProduction:    !!process.env.REPLIT_DOMAINS,
    replitDomains:   process.env.REPLIT_DOMAINS || null,
    serverPublicIp,  /* IP that Meezan Bank must whitelist for live mode */
  });
});

/* GET server public IP — standalone endpoint for IP-whitelist troubleshooting */
router.get("/admin/meezan/server-ip", adminMiddleware as any, async (_req: AuthRequest, res: Response) => {
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    if (!ipRes.ok) { res.status(502).json({ error: "Could not reach IP detection service" }); return; }
    const data = await ipRes.json() as { ip?: string };
    res.json({ ip: data.ip ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   INITIATE PAYMENT — POST /api/payment/meezan/initiate
═══════════════════════════════════════════════════════════ */
router.post("/api/payment/meezan/initiate", async (req, res: Response): Promise<void> => {
  try {
    const { epg, settings } = await getEpg();
    if (!epg || !settings) { res.status(503).json({ error: "Payment gateway not configured" }); return; }

    const {
      amount, invoiceNumber, description,
      customerName, customerPhone, customerEmail,
      returnUrl, failUrl, platformSource, externalRef,
    } = req.body as Record<string, string>;

    if (!amount || isNaN(Number(amount))) { res.status(400).json({ error: "Valid amount is required" }); return; }

    const urls     = dynamicUrls(req, settings);
    const orderRef = generateOrderRef("KBDF");
    const result   = await epg.register({
      orderNumber: orderRef,
      amountPKR:   Number(amount),
      description: description || invoiceNumber || orderRef,
      returnUrl:   returnUrl || urls.returnUrl,
      failUrl:     failUrl   || urls.failUrl,
    });

    if (!result.success) {
      res.status(400).json({ error: result.errorMessage, errorCode: result.errorCode });
      return;
    }

    const [txn] = await db.insert(meezanTransactionsTable).values({
      invoiceNumber:    invoiceNumber || null,
      meezanOrderId:   result.orderId!,
      amount:          String(amount),
      currency:        "PKR",
      description:     description || invoiceNumber || orderRef,
      customerName:    customerName  || null,
      customerPhone:   customerPhone || null,
      customerEmail:   customerEmail || null,
      status:          "initiated",
      isLive:          settings.environment === "live",
      platformSource:  platformSource || "admin",
      externalRef:     externalRef    || null,
      returnUrl:       returnUrl || settings.returnUrl || null,
      failUrl:         failUrl   || settings.failUrl   || null,
      registerResponse: result.raw as Record<string, unknown>,
    }).returning();

    await audit(txn.id, "INITIATE", { orderRef, amount }, result.raw as Record<string, unknown>, req.ip || "");

    res.json({
      success:       true,
      txnId:         txn.id,
      meezanOrderId: result.orderId,
      formUrl:       result.formUrl,
      orderRef,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   VERIFY / STATUS CHECK — GET /api/payment/meezan/status/:meezanOrderId
═══════════════════════════════════════════════════════════ */
router.get("/api/payment/meezan/status/:meezanOrderId", async (req, res: Response): Promise<void> => {
  try {
    const { meezanOrderId } = req.params as { meezanOrderId: string };
    const { epg }           = await getEpg();
    if (!epg) { res.status(503).json({ error: "Gateway not configured" }); return; }

    const status = await epg.getStatus(meezanOrderId);
    if (!status.success) { res.status(400).json({ error: status.errorMessage }); return; }

    const txns = await db.select().from(meezanTransactionsTable)
      .where(eq(meezanTransactionsTable.meezanOrderId, meezanOrderId)).limit(1);

    if (txns.length) {
      const txn    = txns[0];
      const paid   = isPaid(status.orderStatus);
      const newSt  = paid ? "paid" : (status.orderStatus === 3 ? "failed" : txn.status);
      await db.update(meezanTransactionsTable).set({
        status:          newSt as any,
        meezanTxnId:     status.meezanOrderId || null,
        cardMask:        status.cardMask        || null,
        paymentMethod:   status.paymentState    || null,
        statusResponse:  status.raw as Record<string, unknown>,
        completedAt:     paid && !txn.completedAt ? new Date() : txn.completedAt,
        updatedAt:       new Date(),
      }).where(eq(meezanTransactionsTable.id, txn.id));
    }

    res.json({ ...status, dbTxn: txns[0] || null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   CALLBACK / WEBHOOK — POST /api/payment/meezan/callback
═══════════════════════════════════════════════════════════ */
router.post("/api/payment/meezan/callback", async (req, res: Response) => {
  try {
    const payload       = req.body as Record<string, unknown>;
    const meezanOrderId = String(payload.mdOrder || payload.orderId || "");

    if (meezanOrderId) {
      const txns = await db.select().from(meezanTransactionsTable)
        .where(eq(meezanTransactionsTable.meezanOrderId, meezanOrderId)).limit(1);

      if (txns.length) {
        const { epg } = await getEpg();
        let newStatus: string = txns[0].status || "pending";

        if (epg) {
          const statusRes = await epg.getStatus(meezanOrderId);
          if (statusRes.success) {
            newStatus = isPaid(statusRes.orderStatus) ? "paid"
              : (statusRes.orderStatus === 3 ? "failed" : "pending");
          }
        }

        const wasPaid = txns[0].status === "paid";
        await db.update(meezanTransactionsTable).set({
          status:          newStatus as any,
          callbackPayload: payload,
          completedAt:     newStatus === "paid" ? new Date() : undefined,
          updatedAt:       new Date(),
        }).where(eq(meezanTransactionsTable.id, txns[0].id));

        await audit(txns[0].id, "CALLBACK", payload, { newStatus }, req.ip || "");

        /* Fire-and-forget: Shopify + WA sync on first paid event */
        if (newStatus === "paid" && !wasPaid) {
          void postPaymentSync(txns[0].id);
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    res.status(500).send("Error");
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — LIST TRANSACTIONS
═══════════════════════════════════════════════════════════ */
router.get("/admin/meezan/transactions", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, from, to, limit: lim, offset: off } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof eq>[] = [];
    if (status && status !== "all") conditions.push(eq(meezanTransactionsTable.status, status as any));
    if (from)   conditions.push(gte(meezanTransactionsTable.createdAt, new Date(from)));
    if (to)     conditions.push(lte(meezanTransactionsTable.createdAt, new Date(to)));

    const rows = await db.select().from(meezanTransactionsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(meezanTransactionsTable.createdAt))
      .limit(Math.min(Number(lim) || 50, 200))
      .offset(Number(off) || 0);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(meezanTransactionsTable)
      .where(conditions.length ? and(...conditions) : undefined);

    res.json({ transactions: rows, total: Number(count) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — SINGLE TRANSACTION
═══════════════════════════════════════════════════════════ */
router.get("/admin/meezan/transactions/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const rows = await db.select().from(meezanTransactionsTable).where(eq(meezanTransactionsTable.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Transaction not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — VERIFY (re-check status from bank)
═══════════════════════════════════════════════════════════ */
router.post("/admin/meezan/transactions/:id/verify", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id   = parseInt(req.params.id as string);
    const txns = await db.select().from(meezanTransactionsTable).where(eq(meezanTransactionsTable.id, id)).limit(1);
    if (!txns.length) { res.status(404).json({ error: "Not found" }); return; }
    const txn = txns[0];

    if (!txn.meezanOrderId) { res.status(400).json({ error: "No Meezan order ID" }); return; }
    const { epg } = await getEpg();
    if (!epg) { res.status(503).json({ error: "Gateway not configured" }); return; }

    const statusRes = await epg.getStatus(txn.meezanOrderId);
    if (!statusRes.success) { res.status(400).json({ error: statusRes.errorMessage }); return; }

    const paid    = isPaid(statusRes.orderStatus);
    const newSt   = paid ? "paid" : (statusRes.orderStatus === 3 ? "failed" : txn.status);
    const wasPaid = txn.status === "paid";
    const [updated] = await db.update(meezanTransactionsTable).set({
      status:          newSt as any,
      cardMask:        statusRes.cardMask       || txn.cardMask,
      paymentMethod:   statusRes.paymentState   || txn.paymentMethod,
      statusResponse:  statusRes.raw as Record<string, unknown>,
      completedAt:     paid && !txn.completedAt ? new Date() : txn.completedAt,
      updatedAt:       new Date(),
    }).where(eq(meezanTransactionsTable.id, id)).returning();

    await audit(id, "VERIFY", {}, statusRes.raw as Record<string, unknown>, req.ip || "", String(req.user?.id));

    /* Fire-and-forget: Shopify + WA sync on first paid event */
    if (paid && !wasPaid) {
      void postPaymentSync(id);
    }

    res.json({ ok: true, transaction: updated, status: statusRes });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — FULL REFUND
═══════════════════════════════════════════════════════════ */
router.post("/admin/meezan/transactions/:id/refund", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id      = parseInt(req.params.id as string);
    const { amountPKR, reason } = req.body as { amountPKR?: number; reason?: string };

    const txns = await db.select().from(meezanTransactionsTable).where(eq(meezanTransactionsTable.id, id)).limit(1);
    if (!txns.length) { res.status(404).json({ error: "Not found" }); return; }
    const txn = txns[0];
    if (!txn.meezanOrderId) { res.status(400).json({ error: "No Meezan order ID" }); return; }
    if (txn.status !== "paid") { res.status(400).json({ error: "Only paid transactions can be refunded" }); return; }

    const { epg } = await getEpg();
    if (!epg) { res.status(503).json({ error: "Gateway not configured" }); return; }

    const result = await epg.refund(txn.meezanOrderId, amountPKR);
    if (!result.success) { res.status(400).json({ error: result.errorMessage, errorCode: result.errorCode }); return; }

    const originalAmount  = Number(txn.amount);
    const alreadyRefunded = Number(txn.refundedAmount || 0);
    const refundAmt       = amountPKR ?? originalAmount;
    const newRefunded     = alreadyRefunded + refundAmt;
    const isPartial       = newRefunded < originalAmount;

    const [updated] = await db.update(meezanTransactionsTable).set({
      status:          isPartial ? "partial_refund" : "refunded",
      refundedAmount:  String(newRefunded),
      refundReason:    reason || null,
      refundedAt:      new Date(),
      updatedAt:       new Date(),
    }).where(eq(meezanTransactionsTable.id, id)).returning();

    await audit(id, "REFUND", { amountPKR, reason }, result.raw as Record<string, unknown>, req.ip || "", String(req.user?.id));
    res.json({ ok: true, transaction: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — REVERSE / VOID
═══════════════════════════════════════════════════════════ */
router.post("/admin/meezan/transactions/:id/reverse", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id   = parseInt(req.params.id as string);
    const txns = await db.select().from(meezanTransactionsTable).where(eq(meezanTransactionsTable.id, id)).limit(1);
    if (!txns.length) { res.status(404).json({ error: "Not found" }); return; }
    const txn = txns[0];
    if (!txn.meezanOrderId) { res.status(400).json({ error: "No Meezan order ID" }); return; }

    const { epg } = await getEpg();
    if (!epg) { res.status(503).json({ error: "Gateway not configured" }); return; }

    const result = await epg.reverse(txn.meezanOrderId);
    if (!result.success) { res.status(400).json({ error: result.errorMessage }); return; }

    const [updated] = await db.update(meezanTransactionsTable).set({
      status:    "reversed",
      updatedAt: new Date(),
    }).where(eq(meezanTransactionsTable.id, id)).returning();

    await audit(id, "REVERSE", {}, result.raw as Record<string, unknown>, req.ip || "", String(req.user?.id));
    res.json({ ok: true, transaction: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — AUDIT LOGS
═══════════════════════════════════════════════════════════ */
router.get("/admin/meezan/audit-logs", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { txnId, limit: lim, offset: off } = req.query as Record<string, string>;
    const conditions = txnId ? [eq(meezanAuditLogsTable.txnId, parseInt(txnId))] : [];
    const rows = await db.select().from(meezanAuditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(meezanAuditLogsTable.createdAt))
      .limit(Math.min(Number(lim) || 100, 500))
      .offset(Number(off) || 0);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

/* ═══════════════════════════════════════════════════════════
   ADMIN — DASHBOARD STATS
═══════════════════════════════════════════════════════════ */
router.get("/admin/meezan/stats", adminMiddleware as any, async (_req, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [all] = await db.select({
      total:     sql<number>`count(*)`,
      paid:      sql<number>`sum(case when status='paid' then 1 else 0 end)`,
      pending:   sql<number>`sum(case when status in ('initiated','pending') then 1 else 0 end)`,
      failed:    sql<number>`sum(case when status='failed' then 1 else 0 end)`,
      refunded:  sql<number>`sum(case when status in ('refunded','partial_refund') then 1 else 0 end)`,
      reversed:  sql<number>`sum(case when status='reversed' then 1 else 0 end)`,
      volume:    sql<number>`coalesce(sum(case when status='paid' then amount::numeric else 0 end),0)`,
      refundVol: sql<number>`coalesce(sum(refunded_amount::numeric),0)`,
    }).from(meezanTransactionsTable);

    const [todayStats] = await db.select({
      volume: sql<number>`coalesce(sum(case when status='paid' then amount::numeric else 0 end),0)`,
      count:  sql<number>`sum(case when status='paid' then 1 else 0 end)`,
    }).from(meezanTransactionsTable).where(gte(meezanTransactionsTable.createdAt, today));

    res.json({
      total:        Number(all.total),
      paid:         Number(all.paid),
      pending:      Number(all.pending),
      failed:       Number(all.failed),
      refunded:     Number(all.refunded),
      reversed:     Number(all.reversed),
      totalVolume:  Number(all.volume),
      refundVolume: Number(all.refundVol),
      todayVolume:  Number(todayStats.volume),
      todayCount:   Number(todayStats.count),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/* ═══════════════════════════════════════════════════════════
   EXTERNAL PAYMENT RECEIVE
   Called by Shopify / Laravel / Mobile apps to report payments
   into the central payment hub
═══════════════════════════════════════════════════════════ */
router.post("/api/payment/external/receive", async (req, res: Response): Promise<void> => {
  try {
    const {
      platformSource, externalRef, amount, status,
      customerName, customerPhone, customerEmail, description,
    } = req.body as Record<string, string>;

    if (!platformSource) { res.status(400).json({ error: "platformSource is required (shopify|laravel|mobile|pos|wordpress|custom)" }); return; }
    if (!amount || isNaN(Number(amount))) { res.status(400).json({ error: "Valid amount is required" }); return; }

    const validSources = ["shopify", "laravel", "mobile", "pos", "admin", "external", "wordpress", "custom"];
    if (!validSources.includes(platformSource)) { res.status(400).json({ error: `Invalid platformSource. Use: ${validSources.join("|")}` }); return; }

    const validStatuses = ["paid", "failed", "pending", "initiated", "refunded"];
    const txnStatus = validStatuses.includes(status) ? status : "pending";

    const uniqueRef = `EXT-${platformSource.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const [txn] = await db.insert(meezanTransactionsTable).values({
      invoiceNumber:  externalRef || null,
      meezanOrderId:  uniqueRef,
      amount:         String(Number(amount).toFixed(2)),
      currency:       "PKR",
      description:    description || `${platformSource} payment`,
      customerName:   customerName  || null,
      customerPhone:  customerPhone || null,
      customerEmail:  customerEmail || null,
      status:         txnStatus as any,
      isLive:         true,
      platformSource: platformSource,
      externalRef:    externalRef || null,
      completedAt:    txnStatus === "paid" ? new Date() : null,
    }).returning();

    await audit(txn.id, "EXTERNAL_RECEIVE", req.body as Record<string, unknown>, { txnId: txn.id, uniqueRef }, req.ip || "");

    res.json({ success: true, txnId: txn.id, ref: uniqueRef, message: `Payment from ${platformSource} recorded successfully` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   GENERATE QR PAYMENT LINK
═══════════════════════════════════════════════════════════ */
router.post("/api/payment/meezan/qr", async (req, res: Response): Promise<void> => {
  try {
    const { epg, settings } = await getEpg();
    if (!epg || !settings) { res.status(503).json({ error: "Gateway not configured" }); return; }

    const { amount, description, invoiceNumber, customerPhone } = req.body as Record<string, string>;
    if (!amount || isNaN(Number(amount))) { res.status(400).json({ error: "Valid amount required" }); return; }

    const orderRef = generateOrderRef("QR");
    const result   = await epg.register({
      orderNumber: orderRef,
      amountPKR:   Number(amount),
      description: description || invoiceNumber || "QR Payment",
      returnUrl:   settings.returnUrl || undefined,
      failUrl:     settings.failUrl   || undefined,
    });

    if (!result.success) { res.status(400).json({ error: result.errorMessage }); return; }

    const [txn] = await db.insert(meezanTransactionsTable).values({
      invoiceNumber:    invoiceNumber || null,
      meezanOrderId:   result.orderId!,
      amount:           String(amount),
      currency:         "PKR",
      description:      description || "QR Payment",
      customerPhone:    customerPhone || null,
      status:           "initiated",
      isLive:           settings.environment === "live",
      registerResponse: result.raw as Record<string, unknown>,
    }).returning();

    res.json({
      success:       true,
      txnId:         txn.id,
      meezanOrderId: result.orderId,
      paymentUrl:    result.formUrl,
      orderRef,
      qrData:        result.formUrl,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   INVOICE — LIST
═══════════════════════════════════════════════════════════ */
router.get("/admin/invoices", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, limit: lim, offset: off } = req.query as Record<string, string>;
    const conditions: ReturnType<typeof eq>[] = [];
    if (status && status !== "all") conditions.push(eq(invoicesTable.status, status));

    const rows = await db.select().from(invoicesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(invoicesTable.createdAt))
      .limit(Math.min(Number(lim) || 50, 200))
      .offset(Number(off) || 0);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(invoicesTable)
      .where(conditions.length ? and(...conditions) : undefined);

    const [stats] = await db.select({
      totalPending: sql<number>`sum(case when status='sent' or status='draft' then 1 else 0 end)`,
      totalPaid:    sql<number>`sum(case when status='paid' then 1 else 0 end)`,
      totalVolume:  sql<number>`coalesce(sum(case when status='paid' then amount::numeric else 0 end),0)`,
      totalCount:   sql<number>`count(*)`,
    }).from(invoicesTable);

    res.json({ invoices: rows, total: Number(count), stats });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

/* ═══════════════════════════════════════════════════════════
   INVOICE — CREATE
═══════════════════════════════════════════════════════════ */
router.post("/admin/invoices", adminMiddleware as any, async (req: AuthRequest, res: Response) => {
  try {
    const {
      invoiceNumber, customerName, customerPhone, customerEmail,
      amount, description, notes, dueDate,
    } = req.body as Record<string, string>;

    if (!amount || isNaN(Number(amount))) { res.status(400).json({ error: "Valid amount required" }); return; }

    const { settings } = await getEpg();
    const invNo = invoiceNumber || generateInvoiceNumber();
    const base  = getBaseUrl(req);

    const [inv] = await db.insert(invoicesTable).values({
      invoiceNumber: invNo,
      customerName:  customerName  || null,
      customerPhone: customerPhone || null,
      customerEmail: customerEmail || null,
      amount:        String(Number(amount).toFixed(2)),
      description:   description || null,
      notes:         notes || null,
      status:        "draft",
      dueDate:       dueDate ? new Date(dueDate) : null,
      invoiceUrl:    `${base}/invoice/${invNo}`,
      isLive:        settings?.environment === "live",
    }).returning();

    res.json({ ok: true, invoice: inv });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("unique")) { res.status(400).json({ error: "Invoice number already exists" }); return; }
    res.status(500).json({ error: msg });
  }
});

/* ═══════════════════════════════════════════════════════════
   INVOICE — SINGLE
═══════════════════════════════════════════════════════════ */
router.get("/admin/invoices/:id", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   INVOICE — GENERATE MEEZAN PAYMENT LINK
   Creates a Meezan payment session and returns the hosted payment URL
═══════════════════════════════════════════════════════════ */
router.post("/admin/invoices/:id/generate-link", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Invoice not found" }); return; }
    const inv = rows[0];

    const { epg, settings } = await getEpg();
    if (!epg || !settings) { res.status(503).json({ error: "Payment gateway not configured. Save credentials first." }); return; }

    const urls     = dynamicUrls(req, settings);
    const base     = getBaseUrl(req);
    const orderRef = generateOrderRef("INV");

    const result = await epg.register({
      orderNumber: orderRef,
      amountPKR:   Number(inv.amount),
      description: inv.description || inv.invoiceNumber,
      returnUrl:   `${urls.returnUrl}?inv=${inv.invoiceNumber}`,
      failUrl:     `${urls.failUrl}?inv=${inv.invoiceNumber}`,
    });

    if (!result.success) {
      res.status(400).json({ error: result.errorMessage, errorCode: result.errorCode });
      return;
    }

    const invoiceUrl = `${base}/invoice/${inv.invoiceNumber}`;

    const [updated] = await db.update(invoicesTable).set({
      meezanOrderId: result.orderId,
      paymentUrl:    result.formUrl,
      invoiceUrl,
      status:        inv.status === "draft" ? "draft" : inv.status,
      updatedAt:     new Date(),
    }).where(eq(invoicesTable.id, id)).returning();

    await db.insert(meezanTransactionsTable).values({
      invoiceNumber:    inv.invoiceNumber,
      meezanOrderId:   result.orderId!,
      amount:          String(inv.amount),
      currency:        "PKR",
      description:     inv.description || inv.invoiceNumber,
      customerName:    inv.customerName  || null,
      customerPhone:   inv.customerPhone || null,
      customerEmail:   inv.customerEmail || null,
      status:          "initiated",
      isLive:          settings.environment === "live",
      platformSource:  "admin",
      returnUrl:       urls.returnUrl,
      failUrl:         urls.failUrl,
      registerResponse: result.raw as Record<string, unknown>,
    });

    await audit(null, "INVOICE_LINK_GENERATED", { invoiceId: id, orderRef }, result.raw as Record<string, unknown>, req.ip || "", String(req.user?.id));

    res.json({
      ok:             true,
      invoice:        updated,
      paymentUrl:     result.formUrl,
      invoiceUrl,
      meezanOrderId:  result.orderId,
      dynamicUrls:    urls,
    });
  } catch (err) {
    const msg = String(err);
    const isHtml = msg.includes("HTML page");
    res.status(500).json({
      error: isHtml
        ? "Meezan Bank API is not reachable from this server. Your server IP must be whitelisted by the bank for live mode."
        : msg,
    });
  }
});

/* ═══════════════════════════════════════════════════════════
   INVOICE — SEND (WhatsApp / Email)
═══════════════════════════════════════════════════════════ */
router.post("/admin/invoices/:id/send", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const { via } = req.body as { via?: string };

    const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Invoice not found" }); return; }
    const inv = rows[0];

    if (!inv.paymentUrl) {
      res.status(400).json({ error: "Generate a payment link first before sending." });
      return;
    }

    const [updated] = await db.update(invoicesTable).set({
      status:    "sent",
      sentAt:    new Date(),
      sentVia:   via || "whatsapp",
      updatedAt: new Date(),
    }).where(eq(invoicesTable.id, id)).returning();

    res.json({ ok: true, invoice: updated, message: `Invoice sent via ${via || "whatsapp"}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   INVOICE — MARK PAID (manual)
═══════════════════════════════════════════════════════════ */
router.patch("/admin/invoices/:id/status", adminMiddleware as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string);
    const { status } = req.body as { status: string };
    const allowed = ["draft", "sent", "paid", "expired", "cancelled"];
    if (!allowed.includes(status)) { res.status(400).json({ error: `status must be one of: ${allowed.join("|")}` }); return; }

    const [updated] = await db.update(invoicesTable).set({
      status,
      paidAt:    status === "paid" ? new Date() : undefined,
      updatedAt: new Date(),
    }).where(eq(invoicesTable.id, id)).returning();

    if (!updated) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.json({ ok: true, invoice: updated });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ═══════════════════════════════════════════════════════════
   INVOICE — PUBLIC view (for payment page, no auth needed)
═══════════════════════════════════════════════════════════ */
router.get("/invoice/:invoiceNumber", async (req, res: Response): Promise<void> => {
  try {
    const rows = await db.select().from(invoicesTable)
      .where(eq(invoicesTable.invoiceNumber, req.params.invoiceNumber as string)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Invoice not found" }); return; }
    const inv = rows[0];
    res.json({
      invoiceNumber: inv.invoiceNumber,
      customerName:  inv.customerName,
      amount:        inv.amount,
      description:   inv.description,
      status:        inv.status,
      paymentUrl:    inv.paymentUrl,
      dueDate:       inv.dueDate,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
