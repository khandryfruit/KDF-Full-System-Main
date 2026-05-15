import { BASE_URL } from "@/context/AuthContext";

export type InvoiceShareInput = {
  orderNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string;
  items: Array<{ title?: string; name?: string; variant_title?: string; quantity?: number; price?: number }>;
  codAmount: number;
  isPaid: boolean;
  deliveryCharge?: number;
  /** Branded public URL only — never API host or auth tokens. */
  invoiceUrl: string;
};

const STOREFRONT_URL =
  (process.env.EXPO_PUBLIC_STOREFRONT_URL ?? "https://khanbabadryfruits.com").replace(/\/+$/, "");

/** Rider in-app WebView only — authenticated API HTML (not for customer WhatsApp). */
export function buildRiderInvoiceUrl(apiBase: string, deliveryId: string | number, token: string): string {
  const base = apiBase.replace(/\/+$/, "");
  return `${base}/api/rider/deliveries/${deliveryId}/invoice?token=${encodeURIComponent(token)}`;
}

/** Fetch expiring branded link from API — safe to send to customers. */
export async function fetchPublicInvoiceShareUrl(
  deliveryId: string | number,
  riderToken: string,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/rider/deliveries/${deliveryId}/invoice-share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${riderToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Invoice link failed (${res.status})`);
  }
  const data = (await res.json()) as { publicUrl?: string };
  if (!data.publicUrl || /\/api\//i.test(data.publicUrl) || /token=/i.test(data.publicUrl)) {
    throw new Error("Invalid invoice link from server");
  }
  return data.publicUrl;
}

export function buildInvoiceWhatsAppMessage(input: InvoiceShareInput): string {
  const lines = input.items.slice(0, 12).map((i) => {
    const qty = i.quantity ?? 1;
    const title = i.title ?? i.name ?? "Item";
    const variant = i.variant_title ? ` (${i.variant_title})` : "";
    const lineTotal = Number(i.price ?? 0) * qty;
    return `• ${qty}× ${title}${variant} — Rs. ${lineTotal.toLocaleString()}`;
  });

  const subtotal = input.items.reduce(
    (s, i) => s + Number(i.price ?? 0) * (i.quantity ?? 1),
    0,
  );
  const dc = Number(input.deliveryCharge ?? 0);
  const grand = subtotal + dc;
  const payment = input.isPaid
    ? "✅ PAID (no cash collection)"
    : `💵 COD — collect Rs. ${Number(input.codAmount || grand).toLocaleString()}`;

  const link = input.invoiceUrl.replace(/\/+$/, "");

  return (
    `*Khan Dry Fruits — Delivery Invoice*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `*Order:* #${input.orderNumber}\n` +
    `*Customer:* ${input.customerName ?? "—"}\n` +
    `*Phone:* ${input.customerPhone ?? "—"}\n` +
    `*Address:* ${input.address ?? "—"}\n\n` +
    `*Items:*\n${lines.join("\n") || "—"}\n\n` +
    (dc > 0 ? `*Delivery charge:* Rs. ${dc.toLocaleString()}\n` : "") +
    `*Subtotal:* Rs. ${subtotal.toLocaleString()}\n` +
    `*Total:* Rs. ${grand.toLocaleString()}\n` +
    `*Payment:* ${payment}\n\n` +
    `📄 *View Invoice*\n${link}\n\n` +
    `Thank you for shopping with Khan Dry Fruits 🌰`
  );
}

export function whatsAppUrlForPhone(phone: string, message: string): string {
  const digits = String(phone).replace(/\D/g, "");
  const intl = digits.startsWith("92") ? digits : digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export { STOREFRONT_URL };
