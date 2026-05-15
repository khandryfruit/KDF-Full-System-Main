import type { NewOrderData } from "@/components/NewOrderAlert";

export function deliveryRowToAlert(d: Record<string, unknown>): NewOrderData {
  const addr = String(d.delivery_address ?? "");
  const city = String(d.city ?? "").trim() || guessCityFromAddress(addr);
  return {
    id: Number(d.id),
    shopify_order_number: String(d.shopify_order_number ?? d.id ?? ""),
    customer_name: String(d.customer_name ?? "Customer"),
    customer_phone: String(d.customer_phone ?? ""),
    cod_amount: Number(d.cod_amount ?? 0),
    is_paid: Boolean(d.is_paid),
    delivery_address: addr,
    city,
    assigned_at: String(d.assigned_at ?? new Date().toISOString()),
  };
}

export function pushDataToAlert(data: Record<string, unknown>): NewOrderData | null {
  const id = Number(data.deliveryId);
  if (!id || Number.isNaN(id)) return null;
  const addr = String(data.delivery_address ?? "");
  return {
    id,
    shopify_order_number: String(data.orderNumber ?? id),
    customer_name: String(data.customerName ?? "Customer"),
    customer_phone: String(data.customer_phone ?? data.customerPhone ?? ""),
    cod_amount: Number(data.cod_amount ?? data.codAmount ?? 0),
    is_paid: Boolean(data.is_paid ?? data.isPaid),
    delivery_address: addr,
    city: String(data.city ?? "").trim() || guessCityFromAddress(addr),
    assigned_at: new Date().toISOString(),
  };
}

function guessCityFromAddress(addr: string): string {
  if (/lahore/i.test(addr)) return "Lahore";
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? "";
}
