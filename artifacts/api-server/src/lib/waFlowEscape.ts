/**
 * Escape stale WhatsApp order/menu states when customer sends free-text
 * (product name, FAQ, delivery) instead of a menu number.
 */
import {
  isProductInquiryMessage,
  isPureGreetingMessage,
  isVariantMenuSelection,
  isPreOrderConfirmSelection,
  productRootsInMessage,
} from "./waProductBrain.js";

export const ORDER_FLOW_TRAP_STATES = new Set([
  "wa_catalog_pick_category",
  "wa_order_await_product",
  "wa_order_await_product_choice",
  "wa_order_await_variant",
  "wa_order_await_preconfirm",
  "wa_order_await_quantity",
  "wa_order_await_name",
  "wa_order_await_phone",
  "wa_order_await_address",
  "wa_order_await_city",
  "wa_order_await_payment",
  "wa_order_await_notes",
  "wa_order_await_confirm",
  "quick_order_menu",
  "quick_order_category",
  "quick_price_category",
  "menu_shown",
]);

const ESCAPE_INTENTS = new Set([
  "greeting",
  "conversation",
  "general",
  "support",
  "delivery",
  "tracking",
  "complaint",
  "product_search",
  "pricing",
  "recommendation",
  "bulk_order",
]);

/** True when customer message should exit template/order trap and run product search or AI */
export function shouldEscapeOrderFlowForProductSearch(
  text: string,
  state: string,
  intent?: string,
): boolean {
  const t = String(text ?? "").trim();
  if (!t || !ORDER_FLOW_TRAP_STATES.has(state)) return false;

  if (isPureGreetingMessage(t)) return true;
  if (intent && ESCAPE_INTENTS.has(intent)) return true;

  if (isProductInquiryMessage(t)) {
    if (state === "wa_order_await_preconfirm" && isPreOrderConfirmSelection(t)) return false;
    if ((state === "wa_order_await_variant" || state === "wa_order_await_product_choice") && isVariantMenuSelection(t)) {
      return false;
    }
    return true;
  }

  if (productRootsInMessage(t).length > 0 && t.length >= 3 && !/^\d+$/.test(t)) return true;

  if (/\b(delivery|shipping|track|order status|complaint|refund|human|agent|support)\b/i.test(t)) return true;

  return false;
}

export function isOfficialCatalogProductSource(source?: string | null): boolean {
  return source === "shopify" || source === "commerce" || source === "local";
}
