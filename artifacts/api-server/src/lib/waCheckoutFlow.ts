/**
 * Focused WhatsApp checkout — one step at a time, block distracting menus.
 */
import { sendInteractiveButtons } from "./whatsapp.js";
import { WA_ACTIVE_CHECKOUT_STATES } from "./waSessionRecovery.js";
import type { WaLang } from "./waPremiumJourney.js";

export const WA_ORDER_AWAIT_CITY_SEARCH = "wa_order_await_city_search";
export const WA_ORDER_AWAIT_AREA = "wa_order_await_area";
export const WA_ORDER_AWAIT_LANDMARK = "wa_order_await_landmark";
export const WA_ORDER_AWAIT_COD_CONFIRM = "wa_order_await_cod_confirm";

export const CHECKOUT_FLOW_STATES = new Set([
  ...WA_ACTIVE_CHECKOUT_STATES,
  WA_ORDER_AWAIT_CITY_SEARCH,
  WA_ORDER_AWAIT_AREA,
  WA_ORDER_AWAIT_LANDMARK,
  WA_ORDER_AWAIT_COD_CONFIRM,
  "wa_order_await_variant",
  "wa_order_await_quantity",
  "wa_order_await_preconfirm",
]);

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export function isActiveCheckoutState(state: string): boolean {
  return CHECKOUT_FLOW_STATES.has(state);
}

export function getCheckoutBackState(current: string): string | null {
  const back: Record<string, string> = {
    wa_order_await_cod_confirm: "wa_order_await_payment",
    wa_order_await_payment: "wa_order_await_landmark",
    wa_order_await_bank_screenshot: "wa_order_await_payment",
    wa_order_await_easypaisa_screenshot: "wa_order_await_payment",
    wa_order_await_landmark: "wa_order_await_address_detail",
    wa_order_await_address_detail: "wa_order_await_area",
    wa_order_await_address_extras: "wa_order_await_address_detail",
    wa_order_await_area: "wa_order_await_city",
    wa_order_await_city_search: "wa_order_await_city",
    wa_order_await_city: "wa_order_await_phone",
    wa_order_await_phone: "wa_order_await_name",
    wa_order_await_name: "wa_order_await_quantity",
    wa_order_await_quantity: "wa_order_await_variant",
    wa_order_await_confirm: "wa_order_await_payment",
  };
  return back[current] ?? null;
}

/** Re-show the UI for a checkout step (after Back / Continue). */
export async function resumeCheckoutStepUi(opts: {
  phone: string;
  state: string;
  stateData: Record<string, any>;
  lang: WaLang;
  waSettings: WaSettings;
  sendPaymentMethodButtons: (phone: string, data: Record<string, any>, settings: WaSettings) => Promise<void>;
}): Promise<void> {
  const ui = await import("./waPremiumUi.js");
  const { suggestCityFromPhone } = await import("./waPakistanCities.js");
  const s = opts.state;
  const d = opts.stateData;

  if (s === "wa_order_await_quantity") {
    await ui.sendQuantityPicker({ phone: opts.phone, stateData: d, lang: opts.lang, waSettings: opts.waSettings });
    return;
  }
  if (s === "wa_order_await_name") {
    await ui.sendNamePicker({ phone: opts.phone, contactName: d.waContactName, lang: opts.lang, waSettings: opts.waSettings });
    return;
  }
  if (s === "wa_order_await_phone") {
    const { buildPhonePrompt } = await import("./waPremiumJourney.js");
    const { sendInteractiveButtons } = await import("./whatsapp.js");
    await sendInteractiveButtons({
      phone: opts.phone,
      text: buildPhonePrompt({ name: d.customerName ?? "Customer", detectedPhone: d.customerPhone ?? opts.phone, lang: opts.lang }),
      buttons: [
        { id: "wa_phone_same", title: "✅ Use This Number" },
        { id: "wa_phone_other", title: "✏️ Change Number" },
      ],
      settings: opts.waSettings,
      templateName: "wa_phone_confirm",
    });
    return;
  }
  if (s === "wa_order_await_city") {
    await ui.sendCityPicker({
      phone: opts.phone,
      lang: opts.lang,
      waSettings: opts.waSettings,
      suggestedCity: suggestCityFromPhone(String(d.customerPhone ?? opts.phone)),
    });
    return;
  }
  if (s === "wa_order_await_city_search") {
    await ui.sendCitySearchPrompt(opts.phone, opts.lang, opts.waSettings);
    return;
  }
  if (s === "wa_order_await_area") {
    await ui.sendAreaPrompt(opts.phone, opts.lang, opts.waSettings, String(d.city ?? ""));
    return;
  }
  if (s === "wa_order_await_address_detail") {
    await ui.sendAddressDetailPrompt(opts.phone, opts.lang, opts.waSettings);
    return;
  }
  if (s === "wa_order_await_landmark") {
    await ui.sendLandmarkPrompt(opts.phone, opts.lang, opts.waSettings);
    return;
  }
  if (s === "wa_order_await_payment") {
    await opts.sendPaymentMethodButtons(opts.phone, d, opts.waSettings);
    return;
  }
  if (s === "wa_order_await_cod_confirm") {
    const { sendCodCheckoutConfirm } = await import("./waPaymentInChat.js");
    await sendCodCheckoutConfirm({ phone: opts.phone, lang: opts.lang, waSettings: opts.waSettings });
    return;
  }
  if (s === "wa_order_await_bank_screenshot" || s === "wa_order_await_easypaisa_screenshot") {
    const { sendBankDetailsInChat, sendEasypaisaDetailsInChat } = await import("./waPaymentInChat.js");
    if (s === "wa_order_await_easypaisa_screenshot") {
      await sendEasypaisaDetailsInChat({ phone: opts.phone, lang: opts.lang, waSettings: opts.waSettings, checkoutMode: true });
    } else {
      await sendBankDetailsInChat({ phone: opts.phone, lang: opts.lang, waSettings: opts.waSettings, checkoutMode: true });
    }
  }
}

export async function sendCheckoutBlockedMenuReply(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
  stepHint?: string;
}): Promise<void> {
  const hint = opts.stepHint ?? (opts.lang === "en"
    ? "You're in checkout — finish this order first 😊"
    : "Aap order complete kar rahe hain — pehle yeh step finish karein 😊");
  await sendInteractiveButtons({
    phone: opts.phone,
    text: hint,
    buttons: [
      { id: "wa_checkout_continue", title: "➡️ Continue" },
      { id: "wa_checkout_back", title: "⬅️ Back" },
      { id: "wa_checkout_cancel", title: "❌ Cancel" },
    ],
    settings: opts.waSettings,
    templateName: "checkout_focus",
  });
}
