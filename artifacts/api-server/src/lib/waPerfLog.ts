/**
 * WhatsApp webhook performance timing — response latency monitoring.
 */
import { db, whatsappLogsTable } from "@workspace/db";

const timers = new Map<string, number>();

export function startWaPerfTimer(messageId: string | null | undefined): void {
  if (!messageId) return;
  timers.set(messageId, Date.now());
}

export async function logWaPerf(opts: {
  phone: string;
  messageId?: string | null;
  step: string;
  extraMs?: number;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const started = opts.messageId ? timers.get(opts.messageId) : undefined;
  const elapsedMs = started != null ? Date.now() - started : opts.extraMs;
  if (opts.messageId) timers.delete(opts.messageId);

  await db.insert(whatsappLogsTable).values({
    phone: opts.phone,
    messageId: opts.messageId ?? null,
    templateName: `perf:${opts.step}`,
    message: elapsedMs != null ? `${elapsedMs}ms` : opts.step,
    status: "received",
    response: opts.payload ? JSON.stringify({ elapsedMs, ...opts.payload }).slice(0, 4000) : null,
  } as any).catch(() => {});
}

export function isFastCheckoutState(state: string): boolean {
  return /^wa_order_await_(city|city_search|area|address|address_detail|address_confirm|landmark|phone|name|payment|cod)/.test(state);
}
