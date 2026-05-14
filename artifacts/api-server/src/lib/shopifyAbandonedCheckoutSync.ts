/**
 * Shopify ↔ Marketing Hub abandoned checkout sync
 * - Normalizes webhook + REST abandoned_checkout payloads
 * - Upserts into abandoned_checkouts with stable session keys
 * - Marks carts recovered when Shopify orders complete
 * - REST backfill via GET /abandoned_checkouts.json (covers stores without checkout webhooks)
 */
import { db } from "@workspace/db";
import { abandonedCheckoutsTable } from "@workspace/db/schema";
import { and, eq, or } from "drizzle-orm";
import { logger } from "./logger";

const SHOPIFY_API_VERSION = "2024-01";

function shopDomainHost(shopDomain: string): string {
  return String(shopDomain ?? "")
    .replace(/^https?:\/\//i, "")
    .split("/")[0]!
    .trim();
}

async function shopifyAdminFetch(
  store: { shopDomain: string; accessToken?: string | null },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const host = shopDomainHost(store.shopDomain);
  const url = `https://${host}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": store.accessToken ?? "",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? decodeURIComponent(match[1]) : null;
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function extractLineItems(payload: any): any[] {
  const li = payload?.line_items ?? payload?.lineItems;
  return Array.isArray(li) ? li : [];
}

function lineItemPrice(li: any): string {
  const raw =
    li?.discounted_price ??
    li?.price ??
    li?.final_line_price ??
    li?.line_price ??
    "0";
  return String(num(raw));
}

function lineItemImage(li: any): string | undefined {
  const u =
    li?.image_url ??
    li?.featured_image?.url ??
    li?.variant_image?.url ??
    li?.image?.src;
  return u ? String(u) : undefined;
}

function formatAddress(addr: any): string | null {
  if (!addr || typeof addr !== "object") return null;
  const parts = [
    [addr.first_name, addr.last_name].filter(Boolean).join(" "),
    addr.address1,
    addr.address2,
    addr.city,
    addr.province ?? addr.province_code,
    addr.zip,
    addr.country ?? addr.country_code,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function inferCheckoutStep(payload: any): string {
  if (payload?.billing_address?.address1 || payload?.credit_card?.last_digits) return "payment";
  if (payload?.shipping_address?.address1) return "address";
  if (extractLineItems(payload).length) return "checkout";
  return "cart";
}

function payloadCheckoutUrl(p: any): string | null {
  const u =
    p?.abandoned_checkout_url ??
    p?.abandonedCheckoutUrl ??
    p?.customer_visit?.landing_page;
  if (u && String(u).startsWith("http")) return String(u);
  return null;
}

export function buildShopifyCheckoutResumeUrl(shopDomain: string, payload: any): string | null {
  const direct = payloadCheckoutUrl(payload);
  if (direct) return direct;
  const token = payload?.token ?? payload?.cart_token;
  if (token) {
    const host = shopDomainHost(shopDomain);
    return `https://${host}/checkouts/cn/${encodeURIComponent(String(token))}`;
  }
  return null;
}

/** Stable session id for upsert — prefer token so it matches Order.checkout_token */
export function shopifyAbandonedSessionId(payload: any): string {
  const token = payload?.token ? String(payload.token) : "";
  const id = payload?.id != null ? String(payload.id) : "";
  if (token) return `shopify_ac_${token}`;
  if (id) return `shopify_ac_${id}`;
  return "";
}

export function normalizeShopifyCheckoutPayload(
  store: { shopDomain: string },
  payload: any,
): {
  sessionId: string;
  shopifyCheckoutToken: string | null;
  shopifyCheckoutId: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  customerAddress: string | null;
  cartItems: Array<{
    productId: number;
    name: string;
    price: string;
    qty: number;
    variant?: string;
    variantLabel?: string;
    image?: string;
  }>;
  subtotal: string;
  totalDiscounts: string | null;
  currency: string | null;
  checkoutUrl: string | null;
  checkoutStep: string;
} | null {
  const sessionId = shopifyAbandonedSessionId(payload);
  if (!sessionId) return null;

  const lineItems = extractLineItems(payload);
  const cartItems = lineItems.map((li: any) => ({
    productId: num(li.product_id ?? li.productId),
    name: String(li.title ?? li.name ?? "Product"),
    price: lineItemPrice(li),
    qty: Math.max(1, Math.round(num(li.quantity ?? li.qty ?? 1))),
    variant: li.variant_id != null ? String(li.variant_id) : undefined,
    variantLabel: li.variant_title ?? undefined,
    image: lineItemImage(li),
  }));

  const phone =
    (payload?.phone as string) ??
    payload?.shipping_address?.phone ??
    payload?.billing_address?.phone ??
    payload?.customer?.phone ??
    null;

  const email =
    (payload?.email as string) ??
    payload?.contact_email ??
    payload?.customer?.email ??
    null;

  const customerName =
    [
      payload?.shipping_address?.first_name ?? payload?.customer?.first_name,
      payload?.shipping_address?.last_name ?? payload?.customer?.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  const customerAddress =
    formatAddress(payload?.shipping_address) ?? formatAddress(payload?.billing_address);

  const subtotalNum =
    num(payload?.subtotal_price) ||
    lineItems.reduce((s: number, li: any) => s + num(lineItemPrice(li)) * num(li.quantity ?? 1), 0);

  const discounts = num(payload?.total_discounts);
  const currency = payload?.currency ?? payload?.presentment_currency ?? null;
  const token = payload?.token ? String(payload.token) : null;
  const checkoutId = payload?.id != null ? String(payload.id) : null;
  const checkoutUrl = buildShopifyCheckoutResumeUrl(store.shopDomain, payload);

  return {
    sessionId,
    shopifyCheckoutToken: token,
    shopifyCheckoutId: checkoutId,
    customerName,
    phone: phone ? String(phone) : null,
    email: email ? String(email).trim() : null,
    customerAddress,
    cartItems,
    subtotal: subtotalNum.toFixed(2),
    totalDiscounts: discounts > 0 ? discounts.toFixed(2) : null,
    currency: currency ? String(currency) : null,
    checkoutUrl,
    checkoutStep: inferCheckoutStep(payload),
  };
}

export async function upsertAbandonedCheckoutFromShopifyPayload(
  store: { shopDomain: string },
  payload: any,
  syncSource: "shopify_webhook" | "shopify_rest",
): Promise<{ ok: boolean; reason?: string }> {
  const row = normalizeShopifyCheckoutPayload(store, payload);
  if (!row) return { ok: false, reason: "empty_session" };

  try {
    await db
      .insert(abandonedCheckoutsTable)
      .values({
        sessionId: row.sessionId,
        customerName: row.customerName ?? undefined,
        phone: row.phone ?? undefined,
        email: row.email ?? undefined,
        customerAddress: row.customerAddress ?? undefined,
        cartItems: row.cartItems,
        subtotal: row.subtotal,
        checkoutStep: row.checkoutStep,
        status: "active",
        lastActivity: new Date(),
        checkoutUrl: row.checkoutUrl ?? undefined,
        shopifyCheckoutToken: row.shopifyCheckoutToken ?? undefined,
        shopifyCheckoutId: row.shopifyCheckoutId ?? undefined,
        totalDiscounts: row.totalDiscounts ?? undefined,
        currency: row.currency ?? undefined,
        syncSource,
      } as any)
      .onConflictDoUpdate({
        target: abandonedCheckoutsTable.sessionId,
        set: {
          customerName: row.customerName ?? undefined,
          phone: row.phone ?? undefined,
          email: row.email ?? undefined,
          customerAddress: row.customerAddress ?? undefined,
          cartItems: row.cartItems,
          subtotal: row.subtotal,
          checkoutStep: row.checkoutStep,
          lastActivity: new Date(),
          checkoutUrl: row.checkoutUrl ?? undefined,
          shopifyCheckoutToken: row.shopifyCheckoutToken ?? undefined,
          shopifyCheckoutId: row.shopifyCheckoutId ?? undefined,
          totalDiscounts: row.totalDiscounts ?? undefined,
          currency: row.currency ?? undefined,
          syncSource,
        },
      });
    return { ok: true };
  } catch (err: any) {
    logger.error({ err: err?.message, sessionId: row.sessionId }, "upsertAbandonedCheckoutFromShopifyPayload failed");
    return { ok: false, reason: err?.message };
  }
}

/** After a Shopify order is created/paid, close matching abandoned rows */
export async function markAbandonedRecoveredFromShopifyOrder(orderPayload: any): Promise<number> {
  const token = orderPayload?.checkout_token ? String(orderPayload.checkout_token) : "";
  const checkoutId = orderPayload?.checkout_id != null ? String(orderPayload.checkout_id) : "";
  const ors: any[] = [];
  if (token) {
    ors.push(eq(abandonedCheckoutsTable.shopifyCheckoutToken, token));
    ors.push(eq(abandonedCheckoutsTable.sessionId, `shopify_ac_${token}`));
    ors.push(eq(abandonedCheckoutsTable.sessionId, token));
  }
  if (checkoutId) {
    ors.push(eq(abandonedCheckoutsTable.shopifyCheckoutId, checkoutId));
    ors.push(eq(abandonedCheckoutsTable.sessionId, `shopify_ac_${checkoutId}`));
  }

  if (!ors.length) return 0;

  const clause = ors.length === 1 ? ors[0]! : or(...(ors as [any, ...any[]]));

  const res = await db
    .update(abandonedCheckoutsTable)
    .set({ status: "recovered", recoveredAt: new Date() })
    .where(and(eq(abandonedCheckoutsTable.status, "active"), clause))
    .returning({ id: abandonedCheckoutsTable.id });

  return res.length;
}

/** Pull abandoned checkouts from Shopify REST (paginated). */
export async function syncAbandonedCheckoutsFromShopifyRest(store: {
  shopDomain: string;
  accessToken?: string | null;
}): Promise<{ upserted: number; pages: number; error?: string }> {
  let upserted = 0;
  let pages = 0;
  let path: string | null = "/abandoned_checkouts.json?limit=250";

  try {
    while (path) {
      const res = await shopifyAdminFetch(store, path);
      pages++;
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        logger.warn({ status: res.status, body: t.slice(0, 200) }, "abandoned_checkouts REST page failed");
        return { upserted, pages, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as any;
      const rows: any[] = data.abandoned_checkouts ?? [];
      for (const ac of rows) {
        const r = await upsertAbandonedCheckoutFromShopifyPayload(store, ac, "shopify_rest");
        if (r.ok) upserted++;
      }
      const next = parseNextPageInfo(res.headers.get("Link"));
      path = next ? `/abandoned_checkouts.json?limit=250&page_info=${encodeURIComponent(next)}` : null;
    }
    logger.info({ upserted, pages }, "Shopify abandoned_checkouts REST sync completed");
    return { upserted, pages };
  } catch (err: any) {
    logger.error({ err: err?.message }, "syncAbandonedCheckoutsFromShopifyRest fatal");
    return { upserted, pages, error: err?.message };
  }
}
