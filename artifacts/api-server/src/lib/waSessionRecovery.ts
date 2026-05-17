/**
 * WhatsApp checkout session recovery — TTL, stale-state escape, recovery buttons.
 * New customer intent always wins over expired/trapped checkout states.
 */
import { sendInteractiveButtons } from "./whatsapp.js";
import { resolveWaLang, parseLanguageChoice, buildLanguageWelcomeMessage, WA_AWAIT_LANGUAGE_STATE } from "./waPremiumJourney.js";
import { isPureGreetingMessage, isProductInquiryMessage, productRootsInMessage } from "./waProductBrain.js";
import { isConversationOpenerNotCatalog } from "./waIntentSwitch.js";
import { isPaymentIssueMessage, isAddressFaqMessage, isPaymentInfoMessage } from "./waIntentClassifier.js";
import { isWaCheckoutCollectionState } from "./waOrderJourney.js";
import { resolveCityInput } from "./waPakistanCities.js";
import { WA_AWAIT_PRODUCT_INTENT_STATE } from "./waSalesConversation.js";

export const WA_SESSION_TTL_MS = 30 * 60 * 1000;

/** States that trap free-text but are not active checkout steps */
export const WA_UI_TRAP_STATES = new Set([
  WA_AWAIT_LANGUAGE_STATE,
  WA_AWAIT_PRODUCT_INTENT_STATE,
  "menu_shown",
  "quick_order_menu",
  "quick_order_category",
  "quick_price_category",
]);

export const WA_ACTIVE_CHECKOUT_STATES = new Set([
  "wa_order_await_product",
  "wa_order_await_product_choice",
  "wa_order_await_variant",
  "wa_order_await_preconfirm",
  "wa_order_await_quantity",
  "wa_order_await_name",
  "wa_order_await_phone",
  "wa_order_await_city",
  "wa_order_await_city_search",
  "wa_order_await_area",
  "wa_order_await_landmark",
  "wa_order_await_address",
  "wa_order_await_address_detail",
  "wa_order_await_address_extras",
  "wa_order_await_delivery_notes",
  "wa_order_await_payment",
  "wa_order_await_cod_confirm",
  "wa_order_await_bank_screenshot",
  "wa_order_await_easypaisa_screenshot",
  "wa_order_await_notes",
  "wa_order_await_confirm",
  "wa_order_await_address_confirm",
  "wa_catalog_pick_category",
]);

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export type ConvRow = {
  state?: string | null;
  stateData?: string | null;
  updatedAt?: Date | string | null;
} | null;

export function parseStateData(conv: ConvRow): Record<string, any> {
  try {
    return JSON.parse(String(conv?.stateData ?? "{}"));
  } catch {
    return {};
  }
}

export function stampSessionData(state: string, data: Record<string, any>): Record<string, any> {
  const now = new Date().toISOString();
  const next = { ...data, sessionUpdatedAt: now };
  if (WA_ACTIVE_CHECKOUT_STATES.has(state) || state === WA_AWAIT_PRODUCT_INTENT_STATE) {
    if (!next.sessionStartedAt) next.sessionStartedAt = now;
  }
  if (state === "idle" || state === "wa_sales_chat" || state === "ai_chat") {
    delete next.sessionStartedAt;
  }
  return next;
}

export function getSessionAgeMs(conv: ConvRow): number {
  const data = parseStateData(conv);
  const raw = data.sessionUpdatedAt ?? conv?.updatedAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? Date.now() - t : 0;
}

export function isWaSessionExpired(conv: ConvRow, state?: string): boolean {
  const st = state ?? String(conv?.state ?? "");
  if (!WA_ACTIVE_CHECKOUT_STATES.has(st) && !WA_UI_TRAP_STATES.has(st)) return false;
  const age = getSessionAgeMs(conv);
  return age > WA_SESSION_TTL_MS;
}

export function isUiTrapState(state: string): boolean {
  return WA_UI_TRAP_STATES.has(state);
}

export function shouldPrioritizeNewIntent(text: string, intent?: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (isPaymentIssueMessage(t) || isPaymentInfoMessage(t) || isAddressFaqMessage(t)) return true;
  if (isPureGreetingMessage(t)) return true;
  if (/^(hello|hi|hey|salam|salaam|assalam|assalamu|aoa|aslam)\b/i.test(t)) return true;
  const roots = productRootsInMessage(t);
  if (roots.length > 0 && t.length >= 3) return true;
  if (isProductInquiryMessage(t) && !/^\d+$/.test(t)) return true;
  if (intent === "greeting" || intent === "conversation" || intent === "general" || intent === "support") return true;
  if (intent === "product_search" || intent === "order_start" || intent === "pricing") return true;
  if (/\b(track|delivery|price|rate|order)\b/i.test(t) && t.length >= 4) return true;
  return false;
}

/** Customer typing city/address during checkout — must NOT reset the cart */
const CHECKOUT_TYPED_ENTRY_STATES = new Set([
  "wa_order_await_city",
  "wa_order_await_city_search",
  "wa_order_await_area",
  "wa_order_await_address_detail",
  "wa_order_await_landmark",
  "wa_order_await_address",
  "wa_order_await_address_extras",
  "wa_order_await_address_confirm",
  "wa_order_await_delivery_notes",
]);

export function isCheckoutTypedEntryState(state: string): boolean {
  return CHECKOUT_TYPED_ENTRY_STATES.has(state);
}

export function shouldResetCheckoutForMessage(
  text: string,
  state: string,
  intent?: string,
): boolean {
  if (isUiTrapState(state)) return true;
  if (state === "wa_order_await_confirm") return shouldPrioritizeNewIntent(text, intent);

  if (isCheckoutTypedEntryState(state)) {
    if (isPureGreetingMessage(text)) return true;
    const roots = productRootsInMessage(text);
    if (roots.length > 0 && intent === "product_search") return true;
    if (state === "wa_order_await_city" || state === "wa_order_await_city_search") {
      const cityGuess = resolveCityInput(text);
      if (cityGuess.kind === "confirm" || cityGuess.kind === "suggest") return false;
    }
    return false;
  }

  if (isWaCheckoutCollectionState(state) && state !== "wa_order_await_confirm") {
    return shouldPrioritizeNewIntent(text, intent);
  }
  return false;
}

export function archiveCheckoutSnapshot(stateData: Record<string, any>, reason: string): Record<string, any> {
  const cart = stateData.cart ?? stateData.product;
  if (!cart && !stateData.productName) return {};
  return {
    archivedCheckout: {
      at: new Date().toISOString(),
      reason,
      productName: stateData.productName,
      variantTitle: stateData.variantTitle,
      quantity: stateData.quantity,
      cart: stateData.cart,
      city: stateData.city,
      paymentMethod: stateData.paymentMethod,
    },
  };
}

export function preservedIdleState(stateData: Record<string, any>): Record<string, any> {
  return {
    preferredLanguage: stateData.preferredLanguage ?? stateData.waLang,
    waLang: stateData.waLang ?? stateData.preferredLanguage,
    waContactName: stateData.waContactName,
    lastOrderNumber: stateData.lastOrderNumber,
    lastUserMessage: stateData.lastUserMessage,
    ...(stateData.archivedCheckout ? { archivedCheckout: stateData.archivedCheckout } : {}),
  };
}

function recoveryBody(lang: ReturnType<typeof resolveWaLang>, repeatCount: number): string {
  if (repeatCount >= 2) {
    if (lang === "en") {
      return `No worries 😊\n\nPick an option below — or just type a product name (e.g. *almonds*, *pistachio*).`;
    }
    return `Koi baat nahi 😊\n\nNeeche button select karein — ya product naam likh dein (jaise *badam*, *pista*).`;
  }
  if (lang === "en") {
    return `Yes 😊\n\nIt looks like your last session wasn't finished.\n\nWhat would you like to do?`;
  }
  if (lang === "ps") {
    return `هو 😊\n\nستاسو پخوانی session بشپړ نه شو.\n\nاوس څه غواړئ؟`;
  }
  return `Ji 😊\n\nLagta hai aapka pichla session complete nahi hua.\n\nAap kya karna chahenge? 👇`;
}

export async function sendSessionRecoveryButtons(opts: {
  phone: string;
  waSettings: WaSettings;
  stateData?: Record<string, any>;
  reason: string;
  repeatCount?: number;
  templateName?: string;
}): Promise<void> {
  const lang = resolveWaLang(opts.stateData ?? {});
  const repeat = opts.repeatCount ?? 0;
  await sendInteractiveButtons({
    phone: opts.phone,
    text: recoveryBody(lang, repeat),
    buttons: [
      { id: "wa_session_resume", title: "🔄 Resume Order" },
      { id: "wa_session_new_order", title: "🛍 New Order" },
      { id: "wa_session_general", title: "💬 Questions" },
    ],
    settings: opts.waSettings,
    templateName: opts.templateName ?? "session_recovery",
  });
}

export async function sendStaleConfirmRecovery(opts: {
  phone: string;
  waSettings: WaSettings;
  stateData?: Record<string, any>;
}): Promise<void> {
  await sendSessionRecoveryButtons({
    ...opts,
    reason: "stale_confirm_button",
    templateName: "stale_confirm_recovery",
  });
}

export function trackBotReply(stateData: Record<string, any>, template: string): Record<string, any> {
  const prev = String(stateData.lastBotTemplate ?? "");
  const count = prev === template ? Number(stateData.lastBotTemplateCount ?? 0) + 1 : 1;
  return { ...stateData, lastBotTemplate: template, lastBotTemplateCount: count };
}

export async function handleLanguageTrapText(opts: {
  phone: string;
  text: string;
  waSettings: WaSettings;
  stateData: Record<string, any>;
  sendText: (phone: string, text: string, template?: string) => Promise<void>;
}): Promise<boolean> {
  const langChoice = parseLanguageChoice(opts.text);
  if (langChoice) {
    const { buildLanguageSavedAck } = await import("./waPremiumJourney.js");
    await opts.sendText(opts.phone, buildLanguageSavedAck(langChoice), "language_selected");
    const { setConversationState } = await import("./whatsapp.js");
    await setConversationState(opts.phone, "wa_sales_chat", stampSessionData("wa_sales_chat", {
      ...opts.stateData,
      preferredLanguage: langChoice,
      waLang: langChoice,
    }));
    return true;
  }
  if (isPureGreetingMessage(opts.text) || shouldPrioritizeNewIntent(opts.text, "greeting")) {
    const { resetSalesContextForGreeting } = await import("./waIntentSwitch.js");
    const { buildHumanWelcomeText } = await import("./waConversationFlows.js");
    const { resolveWaLang } = await import("./waPremiumJourney.js");
    const { sendWhatsAppMessage } = await import("./whatsapp.js");
    const { attachQuickActions } = await import("./waQuickActions.js");
    const lang = resolveWaLang(opts.stateData, opts.text);
    await resetSalesContextForGreeting({ phone: opts.phone, preserve: opts.stateData });
    await sendWhatsAppMessage({
      phone: opts.phone,
      message: buildHumanWelcomeText(opts.text, lang),
      templateName: "human_greeting",
    });
    await attachQuickActions({
      phone: opts.phone,
      waSettings: opts.waSettings,
      textBody: opts.text,
      context: "greeting",
    });
    return true;
  }
  const { sendLanguagePicker } = await import("./waPremiumUi.js");
  const { setConversationState } = await import("./whatsapp.js");
  await sendLanguagePicker(opts.phone, buildLanguageWelcomeMessage(), opts.waSettings);
  await setConversationState(opts.phone, WA_AWAIT_LANGUAGE_STATE, opts.stateData);
  return true;
}

/** Guaranteed reply when session reset routing finds no handler — bot must never stay silent. */
export async function sendWaSessionResetFallback(opts: {
  phone: string;
  text: string;
  waSettings: WaSettings;
  stateData?: Record<string, any>;
}): Promise<void> {
  const { buildHumanWelcomeText, buildUniversalFallbackText } = await import("./waConversationFlows.js");
  const { resolveWaLang } = await import("./waPremiumJourney.js");
  const { sendWhatsAppMessage } = await import("./whatsapp.js");
  const { attachQuickActions } = await import("./waQuickActions.js");
  const lang = resolveWaLang(opts.stateData ?? {}, opts.text);
  const message = isConversationOpenerNotCatalog(opts.text)
    ? buildHumanWelcomeText(opts.text, lang)
    : buildUniversalFallbackText(lang);
  await sendWhatsAppMessage({
    phone: opts.phone,
    message,
    templateName: isConversationOpenerNotCatalog(opts.text) ? "human_greeting" : "conversation_fallback",
  });
  await attachQuickActions({
    phone: opts.phone,
    waSettings: opts.waSettings,
    textBody: opts.text,
    context: "greeting",
  });
}

async function routeAfterSessionReset(opts: {
  phone: string;
  text: string;
  waSettings: WaSettings;
  stateData: Record<string, any>;
  tryCustomerMessage: () => Promise<boolean>;
  freshProductSearch: () => Promise<boolean>;
  aiReply?: () => Promise<void>;
}): Promise<boolean> {
  const { isCheckoutContinuationMessage } = await import("./waAddressFlow.js");
  if (await opts.tryCustomerMessage()) return true;
  if (!isCheckoutContinuationMessage(opts.text) && (await opts.freshProductSearch())) return true;
  if (opts.aiReply) {
    await opts.aiReply();
    return true;
  }
  await sendWaSessionResetFallback({
    phone: opts.phone,
    text: opts.text,
    waSettings: opts.waSettings,
    stateData: opts.stateData,
  });
  return true;
}

/** Route trapped/expired commerce states before handleCommerceOrderFlow. */
export async function tryRouteStaleCommerceMessage(opts: {
  phone: string;
  text: string;
  currentState: string;
  convState: ConvRow;
  waSettings: WaSettings;
  trappedIntent: { intent: string; productQuery?: string };
  logStep: (detail: Record<string, unknown>) => Promise<void>;
  tryCustomerMessage: () => Promise<boolean>;
  freshProductSearch: () => Promise<boolean>;
  aiReply?: () => Promise<void>;
}): Promise<boolean> {
  const state = opts.currentState;
  const text = opts.text.trim();
  const stateData = parseStateData(opts.convState);
  const intent = opts.trappedIntent.intent;

  if (isUiTrapState(state)) {
    await opts.logStep({ step: "ui_trap_state_routed", previousState: state, text });
    if (state === WA_AWAIT_LANGUAGE_STATE) {
      const { setConversationState } = await import("./whatsapp.js");
      await handleLanguageTrapText({
        phone: opts.phone,
        text,
        waSettings: opts.waSettings,
        stateData,
        sendText: async (p, m, t) => {
          const { sendWhatsAppMessage } = await import("./whatsapp.js");
          await sendWhatsAppMessage({ phone: p, message: m, templateName: t });
        },
      });
      return true;
    }
    const { setConversationState } = await import("./whatsapp.js");
    const archived = archiveCheckoutSnapshot(stateData, "ui_trap_reset");
    const idleData = preservedIdleState({ ...stateData, ...archived });
    await setConversationState(opts.phone, "idle", idleData);
    return routeAfterSessionReset({
      phone: opts.phone,
      text,
      waSettings: opts.waSettings,
      stateData: idleData,
      tryCustomerMessage: opts.tryCustomerMessage,
      freshProductSearch: opts.freshProductSearch,
      aiReply: opts.aiReply,
    });
  }

  const expired = isWaSessionExpired(opts.convState, state);
  const newIntent = shouldPrioritizeNewIntent(text, intent);
  const resetCheckout = shouldResetCheckoutForMessage(text, state, intent);

  if (expired && WA_ACTIVE_CHECKOUT_STATES.has(state)) {
    await opts.logStep({ step: "session_expired", previousState: state, ageMs: getSessionAgeMs(opts.convState), text });
    const archived = archiveCheckoutSnapshot(stateData, "ttl_expired");
    const { setConversationState } = await import("./whatsapp.js");
    await setConversationState(opts.phone, "idle", preservedIdleState({ ...stateData, ...archived }));
    if (newIntent) {
      if (await opts.tryCustomerMessage()) return true;
      if (await opts.freshProductSearch()) return true;
      if (opts.aiReply) { await opts.aiReply(); return true; }
    }
    const tracked = trackBotReply(stateData, "session_recovery");
    await sendSessionRecoveryButtons({
      phone: opts.phone,
      waSettings: opts.waSettings,
      stateData: tracked,
      reason: "ttl_expired",
      repeatCount: Number(tracked.lastBotTemplateCount ?? 1),
    });
    await setConversationState(opts.phone, "wa_session_recovery", tracked);
    return true;
  }

  if (resetCheckout) {
    await opts.logStep({ step: "checkout_reset_new_intent", previousState: state, text, intent });
    const archived = archiveCheckoutSnapshot(stateData, "new_intent_override");
    const { setConversationState } = await import("./whatsapp.js");
    const idleData = preservedIdleState({ ...stateData, ...archived });
    await setConversationState(opts.phone, "idle", idleData);
    return routeAfterSessionReset({
      phone: opts.phone,
      text,
      waSettings: opts.waSettings,
      stateData: idleData,
      tryCustomerMessage: opts.tryCustomerMessage,
      freshProductSearch: opts.freshProductSearch,
      aiReply: opts.aiReply,
    });
  }

  return false;
}

export function buildRestoredCheckoutState(stateData: Record<string, any>): Record<string, any> | null {
  const archived = stateData.archivedCheckout;
  if (!archived?.cart && !archived?.productName) return null;
  const restored = {
    ...stateData,
    cart: archived.cart ?? stateData.cart,
    productName: archived.productName ?? stateData.productName,
    variantTitle: archived.variantTitle ?? stateData.variantTitle,
    quantity: archived.quantity ?? stateData.quantity,
    city: archived.city ?? stateData.city,
    paymentMethod: archived.paymentMethod ?? stateData.paymentMethod,
    sessionStartedAt: new Date().toISOString(),
    sessionUpdatedAt: new Date().toISOString(),
  };
  delete restored.archivedCheckout;
  return restored;
}

export { WA_AWAIT_PRODUCT_INTENT_STATE };
