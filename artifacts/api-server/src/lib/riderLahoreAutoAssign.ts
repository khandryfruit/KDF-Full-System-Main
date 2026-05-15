/**
 * Auto-assign Lahore Shopify orders — delegates to unified lahoreOrderAssign.
 */
import { assignLahoreOrderWithNotifications, type LahoreAssignInput } from "./lahoreOrderAssign.js";
import { isLahoreShippingAddress } from "./lahoreShipping.js";

export type LahoreOrderRow = {
  id: number;
  shopify_order_id?: string | null;
  order_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  shipping_address?: unknown;
  total_price?: string | number | null;
  financial_status?: string | null;
  line_items?: unknown;
};

/** Assign one Lahore order if unassigned. */
export async function autoAssignLahoreOrder(order: LahoreOrderRow): Promise<{
  assigned: boolean;
  deliveryId?: number;
  riderId?: number;
  riderName?: string;
}> {
  if (!isLahoreShippingAddress(order.shipping_address)) {
    return { assigned: false };
  }

  const input: LahoreAssignInput = {
    shopifyOrderDbId: order.id,
    shopifyOrderId: String(order.shopify_order_id ?? ""),
    orderNumber: String(order.order_number ?? ""),
    customerPhone: order.customer_phone ?? null,
    customerName: order.customer_name ?? null,
    shippingAddress: order.shipping_address,
    totalPrice: order.total_price != null ? String(order.total_price) : null,
    financialStatus: order.financial_status ?? null,
    lineItems: Array.isArray(order.line_items) ? order.line_items : [],
  };

  const result = await assignLahoreOrderWithNotifications(input);
  return {
    assigned: result.assigned,
    deliveryId: result.deliveryId,
    riderId: result.riderId,
    riderName: result.riderName,
  };
}
