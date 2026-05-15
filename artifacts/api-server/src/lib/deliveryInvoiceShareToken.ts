import crypto from "crypto";

const SHARE_TTL_SEC = Number(process.env.INVOICE_SHARE_TTL_SEC ?? 14 * 24 * 60 * 60); /* 14 days */

function shareSecret(): string {
  const base = process.env.SESSION_SECRET;
  if (!base) throw new Error("SESSION_SECRET required for invoice share tokens");
  return `${base}:invoice-share-v1`;
}

/** Opaque signed token — not a JWT; encodes delivery id + expiry only. */
export function createInvoiceShareToken(deliveryId: number): string {
  const exp = Math.floor(Date.now() / 1000) + SHARE_TTL_SEC;
  const body = `${deliveryId}.${exp}`;
  const sig = crypto.createHmac("sha256", shareSecret()).update(body).digest("base64url").slice(0, 22);
  const idPart = deliveryId.toString(36);
  const expPart = exp.toString(36);
  return `${idPart}.${expPart}.${sig}`;
}

export function verifyInvoiceShareToken(token: string): { deliveryId: number; exp: number } | null {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  const deliveryId = parseInt(parts[0]!, 36);
  const exp = parseInt(parts[1]!, 36);
  const sig = parts[2]!;
  if (!Number.isFinite(deliveryId) || deliveryId < 1 || !Number.isFinite(exp)) return null;
  const body = `${deliveryId}.${exp}`;
  const expected = crypto.createHmac("sha256", shareSecret()).update(body).digest("base64url").slice(0, 22);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  if (exp < Math.floor(Date.now() / 1000)) return null;
  return { deliveryId, exp };
}

export function storefrontInvoiceShareUrl(token: string): string {
  const base = (process.env.STOREFRONT_URL ?? "https://khanbabadryfruits.com").replace(/\/+$/, "");
  return `${base}/invoice/v/${token}`;
}

export function invoiceShareTtlDays(): number {
  return Math.round(SHARE_TTL_SEC / 86400);
}
