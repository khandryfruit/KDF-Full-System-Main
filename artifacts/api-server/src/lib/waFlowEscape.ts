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
import {
  isWaCheckoutCollectionState,
  isShowMoreProductsMessage,
  isCheckoutCancellationMessage,
  WA_PRODUCT_PICK_STATES,
} from "./waOrderJourney.js";
import { WA_AWAIT_PRODUCT_INTENT_STATE } from "./waSalesConversation.js";

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
  "wa_order_await_delivery_notes",
  "wa_order_await_payment",
  "wa_order_await_notes",
  "wa_order_await_confirm",
  "quick_order_menu",
  "quick_order_category",
  "quick_price_category",
  "menu_shown",
]);

/** True when customer message should exit template/order trap and run product search or AI */
export function shouldEscapeOrderFlowForProductSearch(
  text: string,
  state: string,
  intent?: string,
): boolean {
  const t = String(text ?? "").trim();
  if (!t || !ORDER_FLOW_TRAP_STATES.has(state)) return false;

  if (isCheckoutCancellationMessage(t)) return false;
  if (isShowMoreProductsMessage(t)) return false;

  /* Never restart catalog during checkout data collection (name/phone/address) */
  if (isWaCheckoutCollectionState(state)) return false;
  if (state === WA_AWAIT_PRODUCT_INTENT_STATE) return false;

  if (isPureGreetingMessage(t)) return true;
  if (intent === "greeting" || intent === "tracking" || intent === "support" || intent === "complaint") return true;

  if (WA_PRODUCT_PICK_STATES.has(state)) {
    if (state === "wa_order_await_preconfirm" && isPreOrderConfirmSelection(t)) return false;
    if ((state === "wa_order_await_variant" || state === "wa_order_await_product_choice") && isVariantMenuSelection(t)) {
      return false;
    }
    if (isProductInquiryMessage(t) && !/^\d+$/.test(t)) return true;
    if (productRootsInMessage(t).length > 0 && t.length >= 3 && !/^\d+$/.test(t)) return true;
    return false;
  }

  if (/\b(track order|order status|tracking)\b/i.test(t)) return true;

  return false;
}

export function isOfficialCatalogProductSource(source?: string | null): boolean {
  return source === "shopify" || source === "commerce" || source === "local";
}
