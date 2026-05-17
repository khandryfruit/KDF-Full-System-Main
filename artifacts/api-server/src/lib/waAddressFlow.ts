/**
 * Fast address step — type or share location, confirm once, forward-only.
 */
import { sendInteractiveButtons } from "./whatsapp.js";
import { resolveWaLang, type WaLang } from "./waPremiumJourney.js";
import { mergeCheckoutMemory, buildFullDeliveryAddress } from "./waCheckoutMemory.js";

export const WA_ORDER_AWAIT_ADDRESS_CONFIRM = "wa_order_await_address_confirm";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export async function sendAddressInputPrompt(opts: {
  phone: string;
  city: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? `Ji 😊\n\n🏙 City: *${opts.city}*\n\n📍 *Full address* — type in the next message:\n\n• House #\n• Area / Block\n• Landmark\n\nExample: *M Block Johar Town*`
      : `Ji 😊\n\n🏙 City: *${opts.city}*\n\n📍 *Poora address* agla message mein likhein:\n\n• House #\n• Area / Block\n• Landmark\n\nMisal: *M Block Johar Town*`,
    buttons: [
      { id: "wa_addr_share_loc", title: "📍 Share Location" },
      { id: "wa_addr_type", title: "✍️ Type Address" },
    ],
    settings: opts.waSettings,
    templateName: "address_input_prompt",
  });
}

export async function sendAddressTypeHint(opts: {
  phone: string;
  city: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? `✍️ Type your full address for *${opts.city}* in the next message.`
      : `✍️ *${opts.city}* ka poora address agla message mein likhein.`,
    buttons: [
      { id: "wa_addr_share_loc", title: "📍 Share Location" },
    ],
    settings: opts.waSettings,
    templateName: "address_type_hint",
  });
}

export async function sendLocationShareHint(opts: {
  phone: string;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? "📍 Tap *attachment (+)* → *Location* → *Send your current location*."
      : "📍 *Attachment (+)* → *Location* → apni location bhej dein.",
    buttons: [
      { id: "wa_addr_type", title: "✍️ Type Instead" },
    ],
    settings: opts.waSettings,
    templateName: "address_location_hint",
  });
}

export async function sendAddressConfirmPrompt(opts: {
  phone: string;
  stateData: Record<string, any>;
  lang: WaLang;
  waSettings: WaSettings;
}): Promise<void> {
  const full = buildFullDeliveryAddress(opts.stateData);
  await sendInteractiveButtons({
    phone: opts.phone,
    text: opts.lang === "en"
      ? `Ji 😊\n\nYour address:\n\n📍 *${full}*`
      : `Ji 😊\n\nAapka address:\n\n📍 *${full}*`,
    buttons: [
      { id: "wa_addr_confirm", title: "✅ Confirm" },
      { id: "wa_addr_edit", title: "✏️ Edit" },
    ],
    settings: opts.waSettings,
    templateName: "address_confirm",
  });
}

export function applyAddressText(stateData: Record<string, any>, text: string, city: string): Record<string, any> {
  const trimmed = text.trim();
  let street = trimmed;
  let area = stateData.area ?? "";
  const cityLower = city.toLowerCase();
  if (trimmed.toLowerCase().includes(cityLower)) {
    street = trimmed;
  } else if (city) {
    street = `${trimmed}, ${city}`;
  }
  return mergeCheckoutMemory(stateData, {
    city,
    streetAddress: street,
    address: street,
    area: area || undefined,
  });
}

export function applyLocationShare(
  stateData: Record<string, any>,
  loc: { latitude: number; longitude: number; name?: string; address?: string },
): Record<string, any> {
  const label = loc.name || loc.address || `${loc.latitude}, ${loc.longitude}`;
  const street = loc.address || label;
  return mergeCheckoutMemory(stateData, {
    streetAddress: street,
    address: street,
    locationLat: loc.latitude,
    locationLng: loc.longitude,
    locationName: loc.name ?? label,
  });
}
