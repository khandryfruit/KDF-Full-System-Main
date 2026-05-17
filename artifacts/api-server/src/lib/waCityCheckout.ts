/**
 * Smart city step — auto-detect → address (no extra city search trap).
 */
import { resolveCityInput, smartSearchCities } from "./waPakistanCities.js";
import { resolveWaLang } from "./waPremiumJourney.js";
import { mergeCheckoutMemory } from "./waCheckoutMemory.js";
import { WA_ORDER_AWAIT_CITY_SEARCH } from "./waCheckoutFlow.js";

type WaSettings = Awaited<ReturnType<typeof import("./whatsapp.js").getSettings>>;

export async function handleSmartCityTextInput(opts: {
  phone: string;
  text: string;
  stateData: Record<string, any>;
  waSettings: WaSettings;
  setConversationState: (phone: string, state: string, data: Record<string, any>) => Promise<void>;
  goToAddressStep: (city: string, data: Record<string, any>) => Promise<void>;
}): Promise<void> {
  const trimmed = String(opts.text ?? "").trim();
  const lang = resolveWaLang(opts.stateData);
  const ui = await import("./waPremiumUi.js");
  const resolved = resolveCityInput(trimmed);

  if (resolved.kind === "confirm" && resolved.city) {
    const data = mergeCheckoutMemory(opts.stateData, { city: resolved.city });
    delete data.pendingCity;
    await opts.goToAddressStep(resolved.city, data);
    return;
  }

  if (resolved.suggestions.length > 0 && resolved.kind === "suggest") {
    opts.stateData.citySearchQuery = trimmed.slice(0, 80);
    await opts.setConversationState(opts.phone, "wa_order_await_city", opts.stateData);
    await ui.sendCitySuggestionList({
      phone: opts.phone,
      query: trimmed,
      cities: resolved.suggestions,
      lang,
      waSettings: opts.waSettings,
    });
    return;
  }

  if (resolved.suggestions.length === 1 && resolved.suggestions[0]) {
    const data = mergeCheckoutMemory(opts.stateData, { city: resolved.suggestions[0]! });
    await opts.goToAddressStep(resolved.suggestions[0]!, data);
    return;
  }

  const fuzzy = smartSearchCities(trimmed, 5);
  if (fuzzy.length === 1 && fuzzy[0]!.score >= 75) {
    const data = mergeCheckoutMemory(opts.stateData, { city: fuzzy[0]!.city });
    await opts.goToAddressStep(fuzzy[0]!.city, data);
    return;
  }
  if (fuzzy.length > 1) {
    await ui.sendCitySuggestionList({
      phone: opts.phone,
      query: trimmed,
      cities: fuzzy.map((f) => f.city),
      lang,
      waSettings: opts.waSettings,
    });
    return;
  }

  await ui.sendCityNotFoundPrompt({
    phone: opts.phone,
    query: trimmed,
    lang,
    waSettings: opts.waSettings,
  });
}

export async function resumeCitySearchMode(opts: {
  phone: string;
  stateData: Record<string, any>;
  waSettings: WaSettings;
  setConversationState: (phone: string, state: string, data: Record<string, any>) => Promise<void>;
}): Promise<void> {
  const lang = resolveWaLang(opts.stateData);
  const ui = await import("./waPremiumUi.js");
  delete opts.stateData.pendingCity;
  await opts.setConversationState(opts.phone, WA_ORDER_AWAIT_CITY_SEARCH, opts.stateData);
  await ui.sendCitySearchPrompt(opts.phone, lang, opts.waSettings);
}
