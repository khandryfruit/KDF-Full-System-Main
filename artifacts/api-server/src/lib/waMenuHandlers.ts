import {
  sendWhatsAppMessage,
  sendInteractiveButtons,
  sendCtaUrlMessage,
  setConversationState,
  getConversationState,
} from "./whatsapp.js";
import {
  findMenuItem,
  KHAN_WEBSITE_URL,
  type WaMenuItem,
} from "./waMenuDefaults.js";
import { isActiveCheckoutState, sendCheckoutBlockedMenuReply } from "./waCheckoutFlow.js";
import { sendStandalonePaymentMenu } from "./waPaymentInChat.js";
import { resolveWaLang } from "./waPremiumJourney.js";
import { attachQuickActions } from "./waQuickActions.js";

type Settings = { isActive?: boolean; accessToken?: string; phoneNumberId?: string };

function resolveMenuReplyText(
  interactionId: string,
  item: WaMenuItem | undefined,
  chatbot: Record<string, unknown> | null | undefined,
): string {
  if (item?.replyMessage?.trim()) return item.replyMessage.trim();
  const defaults: Record<string, string> = {
    shop_products: "🛒 *Khan Dry Fruits*\n\nBrowse premium dry fruits, nuts & grocery.\n\nTap below to shop 👇",
    hot_deals:
      (chatbot?.hotDealsMessage as string) ??
      "🔥 *Today's Deals at Khan Dry Fruits*\n\nView latest offers, bundles & discounts 👇",
    get_discount:
      (chatbot?.discountMessage as string) ??
      "🎁 *Exclusive offer from Khan Dry Fruits* — tap below to shop.",
    visit_website: "🌐 *Khan Dry Fruits*\n\nShop our full collection online 🚚",
    delivery_info:
      "🚚 *Delivery — Khan Dry Fruits*\n\nLahore same-day · nationwide shipping · charges at checkout.",
    payment_methods:
      "💳 *Payment methods* — COD, bank transfer & Easypaisa. All handled in this chat.",
  };
  return defaults[interactionId] ?? `*Khan Dry Fruits*\n\nTap below for more information 👇`;
}

function defaultCtaButton(interactionId: string, item?: WaMenuItem): string {
  if (item?.ctaButtonText?.trim()) return item.ctaButtonText.trim().slice(0, 20);
  const labels: Record<string, string> = {
    shop_products: "Shop Now",
    hot_deals: "See Deals",
    visit_website: "Visit Website",
    get_discount: "Shop Now",
  };
  return labels[interactionId] ?? "Open Link";
}

const MENU_IDS_BLOCKED_IN_CHECKOUT = new Set([
  "shop_products",
  "hot_deals",
  "get_discount",
  "visit_website",
  "delivery_info",
  "payment_methods",
  "talk_support",
  "main_menu",
]);

export async function handleMenuItemTap(opts: {
  phone: string;
  interactionId: string;
  chatbot: Record<string, unknown> | null | undefined;
  waSettings: Settings;
}): Promise<boolean> {
  const { phone, interactionId, chatbot, waSettings } = opts;
  const conv = await getConversationState(phone);
  const currentState = String(conv?.state ?? "idle");

  if (isActiveCheckoutState(currentState) && MENU_IDS_BLOCKED_IN_CHECKOUT.has(interactionId)) {
    let stateData: Record<string, unknown> = {};
    try { stateData = JSON.parse(String(conv?.stateData ?? "{}")); } catch { /* ignore */ }
    const lang = resolveWaLang(stateData);
    await sendCheckoutBlockedMenuReply({ phone, lang, waSettings, stepHint: undefined });
    return true;
  }

  const menuItems = (chatbot?.menuItems as WaMenuItem[] | null) ?? null;
  const item = findMenuItem(menuItems, interactionId);
  const websiteUrl = (chatbot?.websiteUrl as string) || KHAN_WEBSITE_URL;
  const action = item?.actionType ?? "default";
  const customUrl = item?.url?.trim();
  const isTrack =
    interactionId === "track_order" ||
    interactionId === "track_again" ||
    action === "track";
  const isSupport = interactionId === "talk_support" || action === "support";

  /* Payment methods — human text first, then payment template */
  if (interactionId === "payment_methods") {
    let stateData: Record<string, unknown> = {};
    try { stateData = JSON.parse(String(conv?.stateData ?? "{}")); } catch { /* ignore */ }
    const lang = resolveWaLang(stateData);
    const intro =
      lang === "en"
        ? "Ji 😊 Here are our payment options:"
        : "Ji 😊 Payment options neeche hain 👇";
    await sendWhatsAppMessage({
      phone,
      message: intro,
      templateName: "menu_payment_intro",
    });
    await sendStandalonePaymentMenu({ phone, lang, waSettings });
    return true;
  }

  /* Admin-set link on any item (except track / support / payment) */
  if (customUrl && !isTrack && !isSupport && interactionId !== "payment_methods") {
    await sendCtaUrlMessage({
      phone,
      text: resolveMenuReplyText(interactionId, item, chatbot),
      buttonText: defaultCtaButton(interactionId, item),
      url: customUrl,
      settings: waSettings,
      templateName: `menu_${interactionId}`,
    });
    await setConversationState(phone, "idle");
    return true;
  }

  switch (interactionId) {
    case "shop_products": {
      let stateData: Record<string, unknown> = {};
      try { stateData = JSON.parse(String(conv?.stateData ?? "{}")); } catch { /* ignore */ }
      const lang = resolveWaLang(stateData);
      const text =
        item?.replyMessage ??
        (lang === "en"
          ? "Ji 😊 Which product would you like?\n\nExample: *badam*, *pista*, *kaju*"
          : "Ji 😊 Kaun sa product chahiye?\n\nJaise: *badam*, *pista*, *kaju*");
      await sendWhatsAppMessage({
        phone,
        message: text,
        templateName: "menu_shop_intro",
      });
      await attachQuickActions({
        phone,
        waSettings,
        context: "greeting",
        stateData,
      });
      await setConversationState(phone, "wa_sales_chat", {
        ...stateData,
        checkoutIntent: "order",
      });
      return true;
    }

    case "hot_deals": {
      const text =
        item?.replyMessage ??
        (chatbot?.hotDealsMessage as string) ??
        "🔥 *Today's Deals at Khan Dry Fruits*\n\nView latest offers, bundles & discounts 👇";
      await sendCtaUrlMessage({
        phone,
        text,
        buttonText: "See Deals",
        url: item?.url || websiteUrl,
        settings: waSettings,
        templateName: "menu_hot_deals",
      });
      await setConversationState(phone, "idle");
      return true;
    }

    case "get_discount": {
      const discountCode = (chatbot?.discountCode as string) ?? "WELCOME10";
      const discountMsg =
        item?.replyMessage ??
        (chatbot?.discountMessage as string) ??
        `🎁 *Exclusive offer from Khan Dry Fruits*\n\n*Code:* ${discountCode}\n*Save:* 10% on your next order\n\nUse at checkout on our website 🛒`;
      await sendInteractiveButtons({
        phone,
        text: discountMsg,
        buttons: [
          { id: "shop_products", title: "🛒 Shop Now" },
          { id: "main_menu", title: "🏠 Main Menu" },
        ],
        settings: waSettings,
        templateName: "menu_discount",
      });
      await setConversationState(phone, "idle");
      return true;
    }

    case "track_order": {
      const msg =
        item?.replyMessage ??
        "📦 *Track Your Order*\n\nPlease send your *order number* (e.g. KDF-123456) and we'll check status right away. 🔍";
      await sendWhatsAppMessage({
        phone,
        message: msg,
        templateName: "menu_track_prompt",
      });
      await setConversationState(phone, "track_order_wait");
      return true;
    }

    case "talk_support": {
      const text =
        item?.replyMessage ??
        "💬 *Khan Dry Fruits Support*\n\nType your question below — our assistant is ready to help, with access to your order history when available. 👇";
      await sendInteractiveButtons({
        phone,
        text,
        buttons: [{ id: "main_menu", title: "🏠 Main Menu" }],
        settings: waSettings,
        templateName: "menu_support",
      });
      await setConversationState(phone, "ai_chat");
      return true;
    }

    case "delivery_info": {
      const msg =
        item?.replyMessage ??
        "🚚 *Delivery — Khan Dry Fruits*\n\n• *Lahore:* Same-day delivery available\n• *Nationwide:* Reliable shipping across Pakistan\n• *Charges:* Calculated at checkout by city\n\nShare your city for exact delivery details. 📍";
      await sendInteractiveButtons({
        phone,
        text: msg,
        buttons: [
          { id: "shop_products", title: "🛒 Shop Now" },
          { id: "main_menu", title: "🏠 Main Menu" },
        ],
        settings: waSettings,
        templateName: "menu_delivery_info",
      });
      await setConversationState(phone, "idle");
      return true;
    }

    case "visit_website": {
      const text =
        item?.replyMessage ??
        "🌐 *Khan Dry Fruits*\n\nShop our full collection online — premium dry fruits & nuts, fast delivery across Pakistan. 🚚";
      await sendCtaUrlMessage({
        phone,
        text,
        buttonText: "Visit Website",
        url: item?.url || websiteUrl,
        settings: waSettings,
        templateName: "menu_website",
      });
      await setConversationState(phone, "idle");
      return true;
    }

    case "track_again": {
      await sendWhatsAppMessage({
        phone,
        message: "📦 Please reply with another *order number* to track:",
        templateName: "menu_track_prompt",
      });
      await setConversationState(phone, "track_order_wait");
      return true;
    }

    default:
      break;
  }

  /* Custom menu items (admin-added) */
  if (item?.replyMessage) {
    if (action === "cta" && interactionId !== "payment_methods") {
      await sendCtaUrlMessage({
        phone,
        text: item.replyMessage,
        buttonText: defaultCtaButton(interactionId, item),
        url: item.url?.trim() || websiteUrl,
        settings: waSettings,
        templateName: `menu_${interactionId}`,
      });
      await setConversationState(phone, "idle");
      return true;
    }
    if (action === "track") {
      await sendWhatsAppMessage({ phone, message: item.replyMessage, templateName: `menu_${interactionId}` });
      await setConversationState(phone, "track_order_wait");
      return true;
    }
    if (action === "support") {
      await sendInteractiveButtons({
        phone,
        text: item.replyMessage,
        buttons: [{ id: "main_menu", title: "🏠 Main Menu" }],
        settings: waSettings,
        templateName: `menu_${interactionId}`,
      });
      await setConversationState(phone, "ai_chat");
      return true;
    }
    await sendInteractiveButtons({
      phone,
      text: item.replyMessage,
      buttons: [
        { id: "shop_products", title: "🛒 Shop" },
        { id: "main_menu", title: "🏠 Menu" },
      ],
      settings: waSettings,
      templateName: `menu_${interactionId}`,
    });
    await setConversationState(phone, "idle");
    return true;
  }

  return false;
}
