/** Shared WhatsApp interactive menu defaults — Khan Dry Fruits */

export const KHAN_BRAND_NAME = "Khan Dry Fruits";
export const KHAN_WEBSITE_URL = "https://www.khandryfruit.com";
export const MENU_CONFIG_ID = "__menu_config__";

export type WaMenuActionType = "default" | "cta" | "text" | "track" | "support" | "buttons";

export interface WaMenuItem {
  id: string;
  emoji?: string;
  label: string;
  description?: string;
  sectionTitle?: string;
  enabled?: boolean;
  sortOrder?: number;
  replyMessage?: string;
  url?: string;
  /** WhatsApp CTA button label (max 20 chars) when url is set */
  ctaButtonText?: string;
  actionType?: WaMenuActionType;
}

export const DEFAULT_MENU_CONFIG: WaMenuItem = {
  id: MENU_CONFIG_ID,
  label: KHAN_BRAND_NAME,
  description: "Browse • Order • Pay • Track • Support",
  sectionTitle: "View Menu",
  enabled: false,
};

export const DEFAULT_GREETING =
  "Hello! 👋\n\nWelcome to *Khan Dry Fruits* — premium dry fruits, nuts & grocery.\n\nTap *View Menu* below to browse, track orders, or chat with us.";

export const DEFAULT_MENU_ITEMS: WaMenuItem[] = [
  {
    id: "shop_products",
    emoji: "🛒",
    label: "Shop Products",
    description: "Premium dry fruits, nuts & grocery",
    sectionTitle: "🛒 Shop",
    enabled: true,
    sortOrder: 0,
    actionType: "cta",
    url: KHAN_WEBSITE_URL,
    replyMessage:
      "🛒 *Khan Dry Fruits*\n\nBrowse our premium dry fruits, nuts & grocery items.\n\nTap the button below to shop online 👇",
  },
  {
    id: "hot_deals",
    emoji: "🔥",
    label: "Today's Deals",
    description: "Latest offers, bundles & discounts",
    sectionTitle: "🛒 Shop",
    enabled: true,
    sortOrder: 1,
    actionType: "cta",
    replyMessage: "🔥 *Today's Deals at Khan Dry Fruits*\n\nView our latest offers, bundles & limited-time discounts 👇",
  },
  {
    id: "get_discount",
    emoji: "🎁",
    label: "Claim Discount",
    description: "Exclusive coupons & first-order offers",
    sectionTitle: "🛒 Shop",
    enabled: true,
    sortOrder: 2,
    actionType: "buttons",
    replyMessage: "🎁 Here's your exclusive offer from *Khan Dry Fruits*!",
  },
  {
    id: "track_order",
    emoji: "📦",
    label: "Track My Order",
    description: "Enter order number · live status",
    sectionTitle: "📦 Orders",
    enabled: true,
    sortOrder: 3,
    actionType: "track",
    replyMessage:
      "📦 *Track Your Order*\n\nPlease send your *order number* (e.g. KDF-123456) and we'll check your tracking status right away. 🔍",
  },
  {
    id: "talk_support",
    emoji: "💬",
    label: "Talk to Support",
    description: "Connect with our team instantly",
    sectionTitle: "💬 Help & Info",
    enabled: true,
    sortOrder: 4,
    actionType: "support",
    replyMessage:
      "💬 *Khan Dry Fruits Support*\n\nOur team will assist you shortly. Type your question below — we're here to help! 👇",
  },
  {
    id: "delivery_info",
    emoji: "🚚",
    label: "Delivery Information",
    description: "Lahore same-day · nationwide shipping",
    sectionTitle: "💬 Help & Info",
    enabled: true,
    sortOrder: 5,
    actionType: "text",
    replyMessage:
      "🚚 *Delivery — Khan Dry Fruits*\n\n• *Lahore:* Same-day delivery available\n• *Nationwide:* Reliable shipping across Pakistan\n• *Charges:* Calculated at checkout by city\n\nShare your city for exact delivery details. 📍",
  },
  {
    id: "payment_methods",
    emoji: "💳",
    label: "Payment Methods",
    description: "COD, bank transfer & more",
    sectionTitle: "💬 Help & Info",
    enabled: true,
    sortOrder: 6,
    actionType: "text",
    replyMessage:
      "💳 *Payment Methods*\n\n• 💵 Cash on Delivery (COD)\n• 🏦 Bank Transfer\n• 📱 Easypaisa\n\nTap below — all details in this chat, no website needed.",
  },
  {
    id: "visit_website",
    emoji: "🌐",
    label: "Visit Website",
    description: "Shop online anytime",
    sectionTitle: "💬 Help & Info",
    enabled: true,
    sortOrder: 7,
    actionType: "cta",
    url: KHAN_WEBSITE_URL,
    replyMessage: "🌐 Visit *Khan Dry Fruits* online for our full premium catalog.",
  },
];

export function filterMenuItems(items: WaMenuItem[] | null | undefined): WaMenuItem[] {
  if (!items?.length) return [];
  return items.filter((i) => i.id !== MENU_CONFIG_ID && i.enabled !== false);
}

export function getMenuConfig(items: WaMenuItem[] | null | undefined): {
  header: string;
  footer: string;
  button: string;
} {
  const cfg = items?.find((i) => i.id === MENU_CONFIG_ID);
  return {
    header: cfg?.label?.trim() || KHAN_BRAND_NAME,
    footer: cfg?.description?.trim() || "Browse • Order • Pay • Track • Support",
    button: cfg?.sectionTitle?.trim() || "View Menu",
  };
}

export function findMenuItem(items: WaMenuItem[] | null | undefined, id: string): WaMenuItem | undefined {
  return items?.find((i) => i.id === id);
}

export function withMenuConfig(
  items: WaMenuItem[],
  config: { header: string; footer: string; button: string },
): WaMenuItem[] {
  const rest = items.filter((i) => i.id !== MENU_CONFIG_ID);
  return [
    ...rest,
    {
      id: MENU_CONFIG_ID,
      label: config.header,
      description: config.footer,
      sectionTitle: config.button,
      enabled: false,
    },
  ];
}
