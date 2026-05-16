import { createHash } from "crypto";
import { db, whatsappLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getConversationState, setConversationState } from "./whatsapp.js";

const REPETITIVE_PHRASES = [
  "main madad ke liye yahin hoon",
  "میں مدد کے لیے موجود ہوں",
  "aap product, price, order status ya delivery",
  "assalam o alaikum",
  "وعلیکم السلام",
];

function normalizeMemoryText(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function hashReply(text: string): string {
  return createHash("sha256").update(normalizeMemoryText(text)).digest("hex").slice(0, 16);
}

function parseStateData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function loadConversationMemory(phone: string) {
  const conv = await getConversationState(phone).catch(() => null);
  const stateData = parseStateData(conv?.stateData ?? undefined);

  const recentLogs = await db
    .select({ message: whatsappLogsTable.message, templateName: whatsappLogsTable.templateName })
    .from(whatsappLogsTable)
    .where(eq(whatsappLogsTable.phone, phone))
    .orderBy(desc(whatsappLogsTable.createdAt))
    .limit(14)
    .catch(() => []);

  const assistantReplies = recentLogs
    .filter((row) => row.templateName === "ai_reply" || row.templateName === "deterministic_reply" || row.templateName === "ai_fallback")
    .map((row) => String(row.message ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    state: conv?.state ?? "idle",
    stateData,
    lastIntent: String(stateData.lastIntent ?? ""),
    lastTopic: String(stateData.topic ?? stateData.lastTopic ?? ""),
    deliveryDiscussed: Boolean(stateData.deliveryDiscussed),
    selectedCategory: stateData.selectedCategory ? String(stateData.selectedCategory) : "",
    selectedProductName: String(stateData.selectedProductName ?? stateData.product?.name ?? ""),
    selectedVariantTitle: String(stateData.selectedVariantTitle ?? stateData.variantTitle ?? ""),
    quantity: stateData.quantity != null ? Number(stateData.quantity) : null,
    cart: Array.isArray(stateData.cart) ? stateData.cart : [],
    city: stateData.city ? String(stateData.city) : "",
    customerName: stateData.customerName ? String(stateData.customerName) : "",
    lastAssistantHash: stateData.lastAssistantHash ? String(stateData.lastAssistantHash) : "",
    lastAssistantReply: stateData.lastAssistantReply ? String(stateData.lastAssistantReply) : "",
    recentAssistantReplies: assistantReplies,
  };
}

export async function persistConversationTurn(
  phone: string,
  patch: {
    intent?: string;
    topic?: string;
    assistantReply?: string;
    deliveryDiscussed?: boolean;
    mergeStateData?: Record<string, unknown>;
  },
) {
  const conv = await getConversationState(phone).catch(() => null);
  const existing = parseStateData(conv?.stateData ?? undefined);
  const next: Record<string, unknown> = { ...existing, ...(patch.mergeStateData ?? {}) };

  if (patch.intent) {
    next.lastIntent = patch.intent;
    next.topic = patch.topic ?? patch.intent;
    if (patch.intent === "delivery" || patch.intent === "shipping" || patch.topic === "delivery") {
      next.deliveryDiscussed = true;
    }
  }
  if (patch.deliveryDiscussed) next.deliveryDiscussed = true;
  if (patch.assistantReply) {
    next.lastAssistantReply = patch.assistantReply;
    next.lastAssistantHash = hashReply(patch.assistantReply);
    const hashes = Array.isArray(next.recentAssistantHashes) ? [...(next.recentAssistantHashes as string[])] : [];
    hashes.unshift(hashReply(patch.assistantReply));
    next.recentAssistantHashes = hashes.slice(0, 5);
  }

  await setConversationState(phone, conv?.state ?? "idle", next);
}

export function shouldBlockRepeatedReply(
  candidateReply: string,
  mem: Awaited<ReturnType<typeof loadConversationMemory>>,
): boolean {
  const normalized = normalizeMemoryText(candidateReply);
  if (!normalized) return false;

  const lower = normalized;
  if (REPETITIVE_PHRASES.some((p) => lower.includes(p))) {
    const recent = mem.recentAssistantReplies.map(normalizeMemoryText);
    if (recent.some((r) => REPETITIVE_PHRASES.some((p) => r.includes(p)))) return true;
  }

  if (mem.lastAssistantHash && hashReply(candidateReply) === mem.lastAssistantHash) return true;
  const lastNorm = normalizeMemoryText(mem.lastAssistantReply);
  if (lastNorm && normalized === lastNorm) return true;
  if (lastNorm.length > 50 && normalized.slice(0, 80) === lastNorm.slice(0, 80)) return true;

  for (const prev of mem.recentAssistantReplies) {
    const prevNorm = normalizeMemoryText(prev);
    if (prevNorm && normalized === prevNorm) return true;
    if (prevNorm.length > 50 && normalized.slice(0, 80) === prevNorm.slice(0, 80)) return true;
  }
  return false;
}

export function buildMemorySummaryBlock(mem: Awaited<ReturnType<typeof loadConversationMemory>>): string {
  const parts: string[] = [];
  if (mem.state && mem.state !== "idle") parts.push(`Active flow: ${mem.state}`);
  if (mem.lastIntent) parts.push(`Last intent: ${mem.lastIntent}`);
  if (mem.lastTopic) parts.push(`Current topic: ${mem.lastTopic}`);
  if (mem.deliveryDiscussed) parts.push("Customer already asked about delivery in this chat");
  if (mem.selectedCategory) parts.push(`Selected category: ${mem.selectedCategory}`);
  if (mem.selectedProductName) parts.push(`Selected product: ${mem.selectedProductName}`);
  if (mem.selectedVariantTitle) parts.push(`Selected variant: ${mem.selectedVariantTitle}`);
  if (mem.quantity != null) parts.push(`Quantity: ${mem.quantity}`);
  if (mem.city) parts.push(`City: ${mem.city}`);
  if (mem.customerName) parts.push(`Customer name: ${mem.customerName}`);
  if (mem.cart.length) {
    parts.push(`Cart: ${mem.cart.map((i: any) => `${i.productName ?? i.name ?? "item"} x${i.quantity ?? 1}`).join(", ")}`);
  }
  return parts.length ? parts.join("\n") : "";
}

export function isActiveCommerceFlow(state: string | null | undefined): boolean {
  if (!state || state === "idle" || state === "ai_chat") return false;
  return /^(wa_order_|quick_|order_await_|menu_shown|human_requested)/.test(state);
}
