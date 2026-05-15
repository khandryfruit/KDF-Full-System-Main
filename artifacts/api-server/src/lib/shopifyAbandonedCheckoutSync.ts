/**
 * Shopify ↔ Marketing Hub abandoned checkout sync
 * - Normalizes webhook + REST + GraphQL abandoned_checkout payloads
 * - Upserts into abandoned_checkouts with stable session keys
 * - Marks carts recovered when Shopify orders complete
 * - Backfill: Admin GraphQL `abandonedCheckouts` (primary), REST `/abandoned_checkouts.json` (fallback)
 */
import { db } from "@workspace/db";
import { abandonedCheckoutsTable } from "@workspace/db/schema";
import { and, eq, or } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Abandoned checkout listing: REST is legacy/removed for many apps (often HTTP 404).
 * GraphQL `abandonedCheckouts` is supported from 2024-10+; we default to a current stable version.
 */
const ABANDONED_SYNC_API_VERSION =
  process.env.SHOPIFY_ABANDONED_SYNC_API_VERSION?.trim() || "2025-01";

function shopDomainHost(shopDomain: string): string {
  return String(shopDomain ?? "")
    .replace(/^https?:\/\//i, "")
    .split("/")[0]!
    .trim();
}

/** Admin REST + GraphQL must target the shop's *.myshopify.com host — custom storefront domains return 404. */
export function shopifyAdminHostWarning(shopDomain: string): string | undefined {
  const h = shopDomainHost(shopDomain);
  if (!h.endsWith(".myshopify.com")) {
    return `Configured shop domain "${h}" is not *.myshopify.com. Save the permanent Shopify admin hostname (e.g. your-store.myshopify.com) in Store settings — Admin API calls will 404 on a public storefront domain.`;
  }
  return undefined;
}

function adminApiBaseUrl(shopDomain: string): string {
  const host = shopDomainHost(shopDomain);
  return `https://${host}/admin/api/${ABANDONED_SYNC_API_VERSION}`;
}

async function shopifyAdminFetch(
  store: { shopDomain: string; accessToken?: string | null },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${adminApiBaseUrl(store.shopDomain)}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": store.accessToken ?? "",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function shopifyAdminGraphql<T = any>(
  store: { shopDomain: string; accessToken?: string | null },
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; url: string; json: T; rawText: string }> {
  const url = `${adminApiBaseUrl(store.shopDomain)}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": store.accessToken ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  const rawText = await res.text().catch(() => "");
  let json: any = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = { parseError: true, rawText: rawText.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, url, json, rawText };
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
  syncSource: "shopify_webhook" | "shopify_rest" | "shopify_graphql",
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

const ABANDONED_CHECKOUTS_GQL = `#graphql
  query AbandonedCheckoutsSync($cursor: String) {
    abandonedCheckouts(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        abandonedCheckoutUrl
        createdAt
        updatedAt
        completedAt
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        shippingAddress {
          firstName
          lastName
          address1
          address2
          city
          provinceCode
          zip
          countryCode
          phone
        }
        billingAddress {
          firstName
          lastName
          address1
          address2
          city
          provinceCode
          zip
          countryCode
          phone
        }
        customer {
          firstName
          lastName
          email
          defaultPhoneNumber {
            phoneNumber
          }
        }
        lineItems(first: 100) {
          nodes {
            quantity
            title
            variantTitle
            discountedUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            image {
              url
            }
            product {
              legacyResourceId
              title
            }
            variant {
              legacyResourceId
              title
            }
          }
        }
      }
    }
  }
`;

function gqlIdToLegacyNumeric(id: string | undefined | null): string | null {
  if (!id) return null;
  const s = String(id);
  const m = s.match(/(\d+)\s*$/);
  return m?.[1] ?? null;
}

/** Token segment in recovery URLs: /checkouts/ac/<token>/recover */
export function tokenFromAbandonedCheckoutUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/\/checkouts\/ac\/([^/?]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Map Admin GraphQL AbandonedCheckout node → REST-like object consumed by normalizeShopifyCheckoutPayload */
export function graphQlAbandonedCheckoutToRestShape(node: any): any {
  const url = node?.abandonedCheckoutUrl ? String(node.abandonedCheckoutUrl) : "";
  const token = tokenFromAbandonedCheckoutUrl(url) ?? gqlIdToLegacyNumeric(node?.id) ?? "";
  const numericId = gqlIdToLegacyNumeric(node?.id);
  const lineNodes: any[] = node?.lineItems?.nodes ?? [];
  const line_items = lineNodes.map((li: any) => ({
    product_id: li.product?.legacyResourceId ? parseInt(String(li.product.legacyResourceId), 10) : 0,
    title: li.title ?? li.product?.title ?? "Product",
    price: String(li.discountedUnitPriceSet?.shopMoney?.amount ?? "0"),
    quantity: li.quantity ?? 1,
    variant_id: li.variant?.legacyResourceId ?? undefined,
    variant_title: li.variantTitle ?? li.variant?.title ?? undefined,
    image_url: li.image?.url ?? undefined,
  }));

  const ship = node?.shippingAddress;
  const bill = node?.billingAddress;
  const cust = node?.customer;

  const toRestAddr = (a: any) =>
    a
      ? {
          first_name: a.firstName ?? null,
          last_name: a.lastName ?? null,
          address1: a.address1 ?? null,
          address2: a.address2 ?? null,
          city: a.city ?? null,
          province_code: a.provinceCode ?? null,
          zip: a.zip ?? null,
          country_code: a.countryCode ?? null,
          phone: a.phone ?? null,
        }
      : null;

  const phone =
    ship?.phone ?? bill?.phone ?? cust?.defaultPhoneNumber?.phoneNumber ?? null;
  const email = cust?.email ? String(cust.email) : null;

  return {
    id: numericId,
    token: token || undefined,
    abandoned_checkout_url: url || undefined,
    email,
    phone,
    customer: cust
      ? {
          first_name: cust.firstName,
          last_name: cust.lastName,
          email: cust.email,
          phone: cust.defaultPhoneNumber?.phoneNumber,
        }
      : null,
    shipping_address: toRestAddr(ship),
    billing_address: toRestAddr(bill),
    line_items,
    subtotal_price: node?.subtotalPriceSet?.shopMoney?.amount ?? "0",
    total_discounts: node?.totalDiscountSet?.shopMoney?.amount ?? "0",
    currency: node?.subtotalPriceSet?.shopMoney?.currencyCode ?? null,
    updated_at: node?.updatedAt,
  };
}

async function syncAbandonedCheckoutsGraphQlPages(store: {
  shopDomain: string;
  accessToken?: string | null;
}): Promise<{
  upserted: number;
  pages: number;
  error?: string;
  lastUrl?: string;
  lastStatus?: number;
  lastBodySnippet?: string;
}> {
  let upserted = 0;
  let pages = 0;
  let cursor: string | null = null;
  let lastUrl = "";
  let lastStatus = 0;
  let lastBodySnippet = "";

  try {
    while (true) {
      const { ok, status, url, json } = await shopifyAdminGraphql(store, ABANDONED_CHECKOUTS_GQL, {
        cursor,
      });
      pages++;
      lastUrl = url;
      lastStatus = status;
      lastBodySnippet = JSON.stringify(json).slice(0, 800);

      if (!ok) {
        logger.warn({ url, status, body: lastBodySnippet }, "Shopify GraphQL abandonedCheckouts HTTP failure");
        return { upserted, pages, error: `GraphQL HTTP ${status}`, lastUrl, lastStatus, lastBodySnippet };
      }

      const gqlErrs = (json as any)?.errors as any[] | undefined;
      if (gqlErrs?.length) {
        const msg = gqlErrs.map((e: any) => e?.message ?? JSON.stringify(e)).join("; ");
        logger.warn({ url, errors: gqlErrs }, "Shopify GraphQL abandonedCheckouts application errors");
        return { upserted, pages, error: msg, lastUrl, lastStatus, lastBodySnippet };
      }

      const conn = (json as any)?.data?.abandonedCheckouts;
      const nodes: any[] = conn?.nodes ?? [];

      for (const node of nodes) {
        if (node?.completedAt) continue;
        const payload = graphQlAbandonedCheckoutToRestShape(node);
        const r = await upsertAbandonedCheckoutFromShopifyPayload(store, payload, "shopify_graphql");
        if (r.ok) upserted++;
      }

      const pageInfo = conn?.pageInfo;
      if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
      cursor = pageInfo.endCursor;
    }

    logger.info({ upserted, pages, source: "graphql" }, "Shopify abandonedCheckouts GraphQL sync completed");
    return { upserted, pages, lastUrl, lastStatus };
  } catch (err: any) {
    logger.error({ err: err?.message }, "syncAbandonedCheckoutsGraphQlPages fatal");
    return {
      upserted,
      pages,
      error: err?.message,
      lastUrl,
      lastStatus,
      lastBodySnippet,
    };
  }
}

async function syncAbandonedCheckoutsRestPages(store: {
  shopDomain: string;
  accessToken?: string | null;
}): Promise<{
  upserted: number;
  pages: number;
  error?: string;
  lastUrl?: string;
  lastStatus?: number;
  lastBodySnippet?: string;
}> {
  let upserted = 0;
  let pages = 0;
  let path: string | null = "/abandoned_checkouts.json?limit=250";
  let lastUrl = "";
  let lastStatus = 0;
  let lastBodySnippet = "";

  try {
    while (path) {
      const fullUrl = `${adminApiBaseUrl(store.shopDomain)}${path}`;
      lastUrl = fullUrl;
      const res = await shopifyAdminFetch(store, path);
      pages++;
      lastStatus = res.status;
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        lastBodySnippet = t.slice(0, 800);
        logger.warn(
          { url: fullUrl, status: res.status, body: lastBodySnippet },
          "abandoned_checkouts REST page failed",
        );
        return { upserted, pages, error: `HTTP ${res.status}`, lastUrl, lastStatus, lastBodySnippet };
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
    logger.info({ upserted, pages, source: "rest" }, "Shopify abandoned_checkouts REST sync completed");
    return { upserted, pages, lastUrl, lastStatus };
  } catch (err: any) {
    logger.error({ err: err?.message }, "syncAbandonedCheckoutsRestPages fatal");
    return { upserted, pages, error: err?.message, lastUrl, lastStatus, lastBodySnippet };
  }
}

export type AbandonedCheckoutSyncResult = {
  upserted: number;
  pages: number;
  error?: string;
  source?: "graphql" | "rest";
  /** Which Admin API version was used for this run */
  apiVersion?: string;
  adminHost?: string;
  hostWarning?: string;
  graphqlError?: string;
  restError?: string;
  lastRequestUrl?: string;
  lastHttpStatus?: number;
  debugBodySnippet?: string;
  /** Human-readable remediation (shown in admin UI) */
  hint?: string;
};

/**
 * Marketing Hub backfill: GraphQL first (required for many current apps), REST fallback.
 */
export async function syncAbandonedCheckoutsFromShopifyRest(store: {
  shopDomain: string;
  accessToken?: string | null;
}): Promise<AbandonedCheckoutSyncResult> {
  const host = shopDomainHost(store.shopDomain);
  const hostWarning = shopifyAdminHostWarning(store.shopDomain);
  if (hostWarning) {
    logger.warn({ shopDomain: host }, hostWarning);
  }

  const gql = await syncAbandonedCheckoutsGraphQlPages(store);

  /* GraphQL listing is the supported path for current apps; treat HTTP 2xx without application errors as success (including 0 rows). */
  if (!gql.error && (!gql.lastStatus || gql.lastStatus < 400)) {
    return {
      upserted: gql.upserted,
      pages: gql.pages,
      source: "graphql",
      apiVersion: ABANDONED_SYNC_API_VERSION,
      adminHost: host,
      hostWarning,
      lastRequestUrl: gql.lastUrl,
      lastHttpStatus: gql.lastStatus,
      debugBodySnippet: gql.lastBodySnippet,
    };
  }

  /* Partial GraphQL progress — do not duplicate via REST */
  if (gql.upserted > 0) {
    return {
      upserted: gql.upserted,
      pages: gql.pages,
      error: gql.error,
      source: "graphql",
      apiVersion: ABANDONED_SYNC_API_VERSION,
      adminHost: host,
      hostWarning,
      graphqlError: gql.error,
      lastRequestUrl: gql.lastUrl,
      lastHttpStatus: gql.lastStatus,
      debugBodySnippet: gql.lastBodySnippet,
      hint: [
        hostWarning,
        gql.error,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  const rest = await syncAbandonedCheckoutsRestPages(store);
  const parts: string[] = [];
  if (gql.error) parts.push(`GraphQL: ${gql.error}`);
  if (rest.error) parts.push(`REST: ${rest.error}`);

  const scopeHint =
    "Confirm the Admin API token has read_orders access and the Shopify staff user can manage abandoned checkouts (Admin: Orders → Abandoned checkouts).";

  return {
    upserted: rest.upserted,
    pages: gql.pages + rest.pages,
    error: rest.upserted > 0 ? undefined : parts.join(" | ") || undefined,
    source: rest.upserted > 0 ? "rest" : undefined,
    apiVersion: ABANDONED_SYNC_API_VERSION,
    adminHost: host,
    hostWarning,
    graphqlError: gql.error,
    restError: rest.error,
    lastRequestUrl: rest.lastUrl ?? gql.lastUrl,
    lastHttpStatus: rest.lastStatus || gql.lastStatus,
    debugBodySnippet: rest.lastBodySnippet ?? gql.lastBodySnippet,
    hint: [hostWarning, rest.upserted === 0 ? scopeHint : ""].filter(Boolean).join(" ").trim() || undefined,
  };
}
