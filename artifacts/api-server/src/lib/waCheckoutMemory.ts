/**
 * Persist checkout fields (city, address, phone) across steps until order completes.
 */
export type CheckoutMemoryPatch = {
  city?: string;
  area?: string;
  address?: string;
  streetAddress?: string;
  landmark?: string;
  customerName?: string;
  customerPhone?: string;
  locationLat?: number;
  locationLng?: number;
  locationName?: string;
};

export function mergeCheckoutMemory(
  stateData: Record<string, any>,
  patch: CheckoutMemoryPatch,
): Record<string, any> {
  const next = { ...stateData, ...patch };
  const saved = {
    ...(typeof stateData.checkoutSaved === "object" ? stateData.checkoutSaved : {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  next.checkoutSaved = saved;
  if (patch.city) next.city = patch.city;
  if (patch.address || patch.streetAddress) {
    next.address = patch.address ?? patch.streetAddress ?? next.address;
    next.streetAddress = patch.streetAddress ?? patch.address ?? next.streetAddress;
  }
  if (patch.area) next.area = patch.area;
  if (patch.landmark != null) next.landmark = patch.landmark;
  if (patch.customerName) next.customerName = patch.customerName;
  if (patch.customerPhone) next.customerPhone = patch.customerPhone;
  return next;
}

export function buildFullDeliveryAddress(stateData: Record<string, any>): string {
  const parts = [
    stateData.streetAddress ?? stateData.address,
    stateData.area,
    stateData.landmark,
    stateData.city,
  ].filter(Boolean);
  return parts.join(", ");
}

export function restoreCheckoutFields(stateData: Record<string, any>): Record<string, any> {
  const saved = stateData.checkoutSaved;
  if (!saved || typeof saved !== "object") return stateData;
  return mergeCheckoutMemory(stateData, saved as CheckoutMemoryPatch);
}
