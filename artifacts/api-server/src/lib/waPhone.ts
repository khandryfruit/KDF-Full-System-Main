/** WhatsApp group JID (Meta Cloud API). */
export function isWaGroupId(phone: string): boolean {
  const p = String(phone ?? "").trim().toLowerCase();
  return p.includes("@g.us") || /^120\d{10,}$/.test(p.replace(/\D/g, ""));
}

/** Contact key for inbox + state — groups keep JID, 1:1 chats normalize to 92… */
export function normalizeWaContactKey(phone: string): string {
  const raw = String(phone ?? "").trim();
  if (!raw || raw === "unknown") return raw;
  if (isWaGroupId(raw)) return raw.toLowerCase();
  return normalizePhone(raw);
}

/** Shared phone normalization — no imports from whatsapp.ts (avoids circular bundle init). */
export function normalizePhone(phone: string): string {
  if (isWaGroupId(phone)) return String(phone).trim().toLowerCase();
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return "92" + digits.slice(1);
  return "92" + digits;
}
