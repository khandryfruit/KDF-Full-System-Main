/**
 * Meta Conversions API (CAPI) — Server-Side Events
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * Fires purchase/checkout/cart events from the server for accurate ad attribution,
 * bypassing browser ad-blockers and iOS/Safari tracking restrictions.
 *
 * Setup: Admin → Integrations → Facebook Pixel → paste Access Token + Pixel ID
 */

import crypto from "crypto";
import { db } from "@workspace/db";
import { marketingIntegrationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface CapiUserData {
  email?:     string;
  phone?:     string;
  firstName?: string;
  lastName?:  string;
  city?:      string;
  country?:   string;
  clientIp?:  string;
  clientUserAgent?: string;
  fbc?:       string;  // Facebook click ID (_fbc cookie)
  fbp?:       string;  // Facebook browser ID (_fbp cookie)
  externalId?: string; // hashed user ID
}

export interface CapiOrderItem {
  id:       string;
  name:     string;
  price:    number;
  quantity: number;
  category?: string;
}

export interface CapiEvent {
  eventName:    "Purchase" | "InitiateCheckout" | "AddToCart" | "ViewContent" | "Lead" | "Search";
  eventTime?:   number;
  eventSourceUrl?: string;
  userData:     CapiUserData;
  value?:       number;
  currency?:    string;
  orderId?:     string;
  items?:       CapiOrderItem[];
  contentIds?:  string[];
  contentType?: string;
  searchString?: string;
  numItems?:    number;
  testEventCode?: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

function hashUserData(userData: CapiUserData): Record<string, string | string[]> {
  const hashed: Record<string, string | string[]> = {};
  if (userData.email)     hashed.em  = sha256(userData.email);
  if (userData.phone)     hashed.ph  = sha256(userData.phone.replace(/\D/g, ""));
  if (userData.firstName) hashed.fn  = sha256(userData.firstName);
  if (userData.lastName)  hashed.ln  = sha256(userData.lastName);
  if (userData.city)      hashed.ct  = sha256(userData.city);
  if (userData.country)   hashed.country = sha256(userData.country);
  if (userData.externalId) hashed.external_id = sha256(userData.externalId);
  if (userData.clientIp)  hashed.client_ip_address = userData.clientIp;
  if (userData.clientUserAgent) hashed.client_user_agent = userData.clientUserAgent;
  if (userData.fbc)       hashed.fbc = userData.fbc;
  if (userData.fbp)       hashed.fbp = userData.fbp;
  return hashed;
}

async function getCapiConfig(): Promise<{ pixelId: string; accessToken: string } | null> {
  try {
    const rows = await db.select({
      pixelId: marketingIntegrationsTable.pixelId,
      accessToken: marketingIntegrationsTable.accessToken,
      isActive: marketingIntegrationsTable.isActive,
    })
      .from(marketingIntegrationsTable)
      .where(eq(marketingIntegrationsTable.platform, "facebook"))
      .limit(1);

    const cfg = rows[0];
    if (!cfg?.isActive || !cfg.pixelId || !cfg.accessToken) return null;
    return { pixelId: cfg.pixelId, accessToken: cfg.accessToken };
  } catch {
    return null;
  }
}

export async function sendCapiEvent(event: CapiEvent): Promise<void> {
  const cfg = await getCapiConfig();
  if (!cfg) return; // CAPI not configured — silently skip

  const eventTime = event.eventTime ?? Math.floor(Date.now() / 1000);

  const customData: Record<string, any> = {};
  if (event.value !== undefined) customData.value = event.value;
  if (event.currency)  customData.currency = event.currency ?? "PKR";
  if (event.orderId)   customData.order_id = event.orderId;
  if (event.numItems)  customData.num_items = event.numItems;
  if (event.searchString) customData.search_string = event.searchString;

  if (event.items?.length) {
    customData.contents = event.items.map(i => ({
      id:         i.id,
      quantity:   i.quantity,
      item_price: i.price,
      title:      i.name,
    }));
    customData.content_type = event.contentType ?? "product";
    customData.content_ids  = event.items.map(i => i.id);
    customData.num_items    = event.items.reduce((s, i) => s + i.quantity, 0);
  } else if (event.contentIds?.length) {
    customData.content_ids  = event.contentIds;
    customData.content_type = event.contentType ?? "product";
  }

  const payload: Record<string, any> = {
    data: [{
      event_name:        event.eventName,
      event_time:        eventTime,
      action_source:     "website",
      event_source_url:  event.eventSourceUrl ?? "https://kdfnuts.com",
      user_data:         hashUserData(event.userData),
      custom_data:       customData,
    }],
  };

  if (event.testEventCode) {
    payload.test_event_code = event.testEventCode;
  }

  const url = `https://graph.facebook.com/v21.0/${cfg.pixelId}/events?access_token=${cfg.accessToken}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const result = await resp.json() as Record<string, any>;
    if (!resp.ok) {
      logger.warn({ pixelId: cfg.pixelId, event: event.eventName, error: result }, "CAPI event failed");
    } else {
      logger.info({ pixelId: cfg.pixelId, event: event.eventName, eventsReceived: result.events_received }, "CAPI event sent");
    }
  } catch (err: any) {
    logger.warn({ event: event.eventName, err: err.message }, "CAPI event send error (non-fatal)");
  }
}

/** Convenience: fire Purchase event from a completed order */
export async function fireCapiPurchase(order: {
  id: number;
  orderNumber: string;
  total: string | number;
  items: { name: string; productId?: number | null; price: string | number; qty: number; }[];
  shippingAddress?: { name?: string; phone?: string; city?: string; };
  userEmail?: string;
}, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }): Promise<void> {
  const addr = order.shippingAddress ?? {};
  const [firstName, ...rest] = (addr.name ?? "").split(" ");
  const lastName = rest.join(" ");

  await sendCapiEvent({
    eventName: "Purchase",
    eventSourceUrl: "https://kdfnuts.com/checkout",
    userData: {
      email:     order.userEmail,
      phone:     addr.phone,
      firstName: firstName || undefined,
      lastName:  lastName || undefined,
      city:      addr.city,
      country:   "PK",
      clientIp:  req?.ip,
      clientUserAgent: req?.headers?.["user-agent"] as string | undefined,
      fbc:  req?.headers?.["x-fbc"] as string | undefined,
      fbp:  req?.headers?.["x-fbp"] as string | undefined,
      externalId: String(order.id),
    },
    value:    Number(order.total),
    currency: "PKR",
    orderId:  order.orderNumber,
    items: order.items.map(i => ({
      id:       String(i.productId ?? i.name),
      name:     i.name,
      price:    Number(i.price),
      quantity: i.qty,
    })),
    numItems: order.items.reduce((s, i) => s + i.qty, 0),
  });
}

/** Convenience: fire InitiateCheckout event */
export async function fireCapiInitiateCheckout(params: {
  value: number;
  numItems: number;
  contentIds: string[];
  userData: CapiUserData;
}): Promise<void> {
  await sendCapiEvent({
    eventName: "InitiateCheckout",
    eventSourceUrl: "https://kdfnuts.com/checkout",
    userData: params.userData,
    value: params.value,
    currency: "PKR",
    numItems: params.numItems,
    contentIds: params.contentIds,
    contentType: "product",
  });
}

/** Convenience: fire AddToCart event */
export async function fireCapiAddToCart(params: {
  productId: string;
  name: string;
  price: number;
  qty: number;
  userData: CapiUserData;
}): Promise<void> {
  await sendCapiEvent({
    eventName: "AddToCart",
    eventSourceUrl: "https://kdfnuts.com",
    userData: params.userData,
    value: params.price * params.qty,
    currency: "PKR",
    items: [{ id: params.productId, name: params.name, price: params.price, quantity: params.qty }],
  });
}
