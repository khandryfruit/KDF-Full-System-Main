export type InvoiceShareInput = {
  orderNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string;
  items: Array<{ title?: string; name?: string; variant_title?: string; quantity?: number; price?: number }>;
  codAmount: number;
  isPaid: boolean;
  deliveryCharge?: number;
  invoiceUrl: string;
};

export function buildRiderInvoiceUrl(apiBase: string, deliveryId: string | number, token: string): string {
  const base = apiBase.replace(/\/+$/, "");
  return `${base}/api/rider/deliveries/${deliveryId}/invoice?token=${encodeURIComponent(token)}`;
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
    `*View invoice:*\n${input.invoiceUrl}\n\n` +
    `Thank you for shopping with Khan Dry Fruits 🌰`
  );
}

export function whatsAppUrlForPhone(phone: string, message: string): string {
  const digits = String(phone).replace(/\D/g, "");
  const intl = digits.startsWith("92") ? digits : digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}
