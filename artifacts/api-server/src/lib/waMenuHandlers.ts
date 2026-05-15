import {
  sendWhatsAppMessage,
  sendInteractiveButtons,
  sendCtaUrlMessage,
  setConversationState,
} from "./whatsapp.js";
import {
  findMenuItem,
  KHAN_WEBSITE_URL,
  type WaMenuItem,
} from "./waMenuDefaults.js";

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
    payment_methods: "💳 *Payment:* COD & bank transfer available.",
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

export async function handleMenuItemTap(opts: {
  phone: string;
  interactionId: string;
  chatbot: Record<string, unknown> | null | undefined;
  waSettings: Settings;
}): Promise<boolean> {
  const { phone, interactionId, chatbot, waSettings } = opts;
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

  /* Admin-set link on any item (except track / support flows) */
  if (customUrl && !isTrack && !isSupport) {
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
      const text =
        item?.replyMessage ??
        "🛒 *Khan Dry Fruits*\n\nBrowse premium dry fruits, nuts & grocery.\n\nTap below to shop 👇";
      await sendCtaUrlMessage({
        phone,
        text,
        buttonText: "Shop Now",
        url: item?.url || websiteUrl,
        settings: waSettings,
        templateName: "menu_shop",
      });
      await setConversationState(phone, "idle");
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

    case "delivery_info":
    case "payment_methods": {
      const msg = item?.replyMessage;
      if (msg) {
        await sendInteractiveButtons({
          phone,
          text: msg,
          buttons: [
            { id: "shop_products", title: "🛒 Shop Now" },
            { id: "main_menu", title: "🏠 Main Menu" },
          ],
          settings: waSettings,
          templateName: `menu_${interactionId}`,
        });
        await setConversationState(phone, "idle");
        return true;
      }
      return false;
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
    if (action === "cta") {
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
