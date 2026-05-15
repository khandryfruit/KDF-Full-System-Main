/** Detect Lahore local-delivery orders from Shopify shipping JSON. */
export function isLahoreShippingAddress(shippingAddress: unknown): boolean {
  try {
    const a =
      typeof shippingAddress === "string"
        ? JSON.parse(shippingAddress)
        : (shippingAddress ?? {}) as Record<string, unknown>;
    const parts = [
      a.city,
      a.province,
      a.address1,
      a.address2,
      a.zip,
      a.country,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return /lahore|لاہور|لاهور/.test(parts);
  } catch {
    return false;
  }
}

export function parseShippingAddress(shippingAddress: unknown): {
  full: string;
  city: string;
  phone: string | null;
} {
  try {
    const a =
      typeof shippingAddress === "string"
        ? JSON.parse(shippingAddress)
        : (shippingAddress ?? {}) as Record<string, unknown>;
    const full = [a.address1, a.address2, a.city, a.province].filter(Boolean).join(", ");
    return {
      full: full || "Lahore",
      city: String(a.city ?? "Lahore"),
      phone: a.phone ? String(a.phone) : null,
    };
  } catch {
    return { full: "Lahore", city: "Lahore", phone: null };
  }
}
