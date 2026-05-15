/**
 * Two-way sync: Meta WhatsApp Business Manager → local whatsapp_templates table.
 */
import { db, whatsappSettingsTable, whatsappTemplatesTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { TEMPLATE_TRIGGER_ALIASES } from "./waTemplateEvents.js";

const WA_API = "v22.0";

export type MetaTemplateRow = {
  id?: string;
  name: string;
  status: string;
  language: string;
  category?: string;
  components?: Array<{ type: string; text?: string; format?: string; buttons?: unknown[] }>;
  rejected_reason?: string;
};

export type SyncResult = {
  ok: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  error?: string;
  syncedAt: string;
  mapping: Array<{ metaName: string; triggerEvent: string | null; status: string }>;
};

/** In-memory cache for live Meta list (admin test panel). */
const metaListCache: { data: MetaTemplateRow[]; at: number } = { data: [], at: 0 };

export function clearMetaTemplateListCache(): void {
  metaListCache.data = [];
  metaListCache.at = 0;
}

export function mapMetaStatus(status: string): "draft" | "pending" | "approved" | "rejected" | "paused" {
  switch (String(status ?? "").toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "rejected";
    case "PAUSED":
    case "DISABLED":
      return "paused";
    default:
      return "draft";
  }
}

/** Infer automation trigger_event from Meta template name. */
export function inferTriggerEvent(templateName: string): string | null {
  const raw = templateName.toLowerCase().trim();
  const norm = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const exact: Record<string, string> = {
    order_confirmation: "order_confirmation",
    order_confirmed: "order_confirmation",
    order_confirm: "order_confirmation",
    paid_order_message: "paid_order_message",
    payment_confirmation: "paid_order_message",
    payment_received: "paid_order_message",
    payment_confirmed: "paid_order_message",
    order_shipped: "order_shipped",
    shipment_update: "order_shipped",
    shipment_updates: "order_shipped",
    order_shipped_update: "order_shipped",
    cancel_order: "cancel_order",
    order_cancelled: "cancel_order",
    cancelled_order: "cancel_order",
    cancel_order_message: "cancel_order",
    shipment_return_update: "shipment_return_update",
    return_update: "shipment_return_update",
    order_return: "shipment_return_update",
    return_refund_update: "shipment_return_update",
    abandoned_cart_recovery: "abandoned_cart_recovery",
    abandoned_cart: "abandoned_cart_recovery",
    cart_recovery: "abandoned_cart_recovery",
    rider_assigned: "rider_assigned",
    rider_assignment: "rider_assigned",
    order_delivered: "order_delivered",
    delivery_confirmation: "order_delivered",
    order_out_for_delivery: "order_out_for_delivery",
    out_for_delivery: "order_out_for_delivery",
    order_processing: "order_processing",
    order_failed_delivery: "order_failed_delivery",
  };

  if (exact[norm]) return exact[norm];

  const patterns: Array<[RegExp, string]> = [
    [/order.?confirm|confirm.?order/, "order_confirmation"],
    [/payment|paid.?order/, "paid_order_message"],
    [/shipment|shipped|dispatch/, "order_shipped"],
    [/cancel/, "cancel_order"],
    [/return|refund/, "shipment_return_update"],
    [/abandon|cart.?recover/, "abandoned_cart_recovery"],
    [/rider|assign/, "rider_assigned"],
    [/delivered|delivery.?confirm/, "order_delivered"],
    [/out.?for.?delivery|near.?customer/, "order_out_for_delivery"],
    [/process|packed|pick/, "order_processing"],
    [/failed.?deliver/, "order_failed_delivery"],
  ];

  for (const [re, event] of patterns) {
    if (re.test(norm) || re.test(raw)) return event;
  }

  return null;
}

function countBodyParams(body: string): number {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  if (!matches?.length) return 0;
  return Math.max(...matches.map((m) => parseInt(m.replace(/\D/g, ""), 10)));
}

function parseMetaComponents(components: MetaTemplateRow["components"]) {
  let body = "";
  let headerText: string | null = null;
  let footerText: string | null = null;

  for (const c of components ?? []) {
    const type = String(c.type ?? "").toUpperCase();
    if (type === "BODY") body = c.text ?? "";
    if (type === "HEADER") headerText = c.text ?? (c.format ? `[${c.format}]` : null);
    if (type === "FOOTER") footerText = c.text ?? null;
  }

  if (!body.trim()) body = "(No body — view in Meta Business Manager)";

  return {
    messageBody: body,
    headerText,
    footerText,
    paramCount: countBodyParams(body),
  };
}

export async function fetchAllMetaTemplates(accessToken: string, businessAccountId: string): Promise<MetaTemplateRow[]> {
  const fields = "id,name,status,language,category,components,rejected_reason";
  let url: string | null =
    `https://graph.facebook.com/${WA_API}/${businessAccountId}/message_templates?limit=100&fields=${fields}`;
  const all: MetaTemplateRow[] = [];

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = (await res.json()) as {
      data?: MetaTemplateRow[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Meta API HTTP ${res.status}`);
    }
    all.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }

  return all;
}

async function findExistingRow(meta: MetaTemplateRow) {
  if (meta.id) {
    const [byMetaId] = await db
      .select()
      .from(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.metaTemplateId, meta.id))
      .limit(1);
    if (byMetaId) return byMetaId;
  }

  const [byNameLang] = await db
    .select()
    .from(whatsappTemplatesTable)
    .where(
      and(
        eq(whatsappTemplatesTable.name, meta.name),
        eq(whatsappTemplatesTable.language, meta.language ?? "en_US"),
      ),
    )
    .limit(1);
  return byNameLang ?? null;
}

/** Pull all Meta templates into whatsapp_templates (upsert). */
export async function syncMetaTemplatesToDatabase(): Promise<SyncResult> {
  const syncedAt = new Date().toISOString();
  const [settings] = await db.select().from(whatsappSettingsTable).limit(1);
  if (!settings?.accessToken) {
    return { ok: false, total: 0, created: 0, updated: 0, skipped: 0, error: "Access token not configured", syncedAt, mapping: [] };
  }
  if (!settings.businessAccountId) {
    return {
      ok: false,
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      error: "WhatsApp Business Account ID not configured",
      syncedAt,
      mapping: [],
    };
  }

  try {
    const metaTemplates = await fetchAllMetaTemplates(settings.accessToken, settings.businessAccountId);
    metaListCache.data = metaTemplates;
    metaListCache.at = Date.now();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const mapping: SyncResult["mapping"] = [];

    for (const meta of metaTemplates) {
      const parsed = parseMetaComponents(meta.components);
      const approvalStatus = mapMetaStatus(meta.status);
      const triggerEvent = inferTriggerEvent(meta.name);
      const fromMeta = true;

      mapping.push({
        metaName: meta.name,
        triggerEvent,
        status: meta.status,
      });

      const existing = await findExistingRow(meta);

      const row = {
        name: meta.name,
        templateId: meta.id ?? null,
        metaTemplateId: meta.id ?? null,
        category: (meta.category ?? "UTILITY").toUpperCase(),
        language: meta.language ?? "en_US",
        messageBody: parsed.messageBody,
        headerText: parsed.headerText,
        footerText: parsed.footerText,
        paramCount: parsed.paramCount,
        triggerEvent: triggerEvent ?? existing?.triggerEvent ?? null,
        approvalStatus,
        rejectionReason: meta.rejected_reason ?? null,
        submittedToMeta: fromMeta,
        metaSubmittedAt: new Date(),
        isActive: approvalStatus === "approved" || approvalStatus === "pending",
      };

      if (existing) {
        await db
          .update(whatsappTemplatesTable)
          .set(row)
          .where(eq(whatsappTemplatesTable.id, existing.id));
        updated += 1;
      } else {
        await db.insert(whatsappTemplatesTable).values(row);
        created += 1;
      }
    }

    logger.info({ total: metaTemplates.length, created, updated }, "Meta WhatsApp templates synced to database");

    return {
      ok: true,
      total: metaTemplates.length,
      created,
      updated,
      skipped,
      syncedAt,
      mapping,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Meta template sync failed");
    return { ok: false, total: 0, created: 0, updated: 0, skipped: 0, error: message, syncedAt, mapping: [] };
  }
}

/** Scheduled + startup sync (non-blocking). */
export function startMetaTemplateSyncScheduler(intervalMinutes = 30): void {
  const run = () => {
    void syncMetaTemplatesToDatabase().then((r) => {
      if (!r.ok) logger.warn({ error: r.error }, "Scheduled Meta template sync failed");
    });
  };
  setTimeout(run, 15_000);
  setInterval(run, intervalMinutes * 60_000);
  logger.info({ intervalMinutes }, "Meta template sync scheduler started");
}

/** Resolve approved template by trigger OR Meta template name. */
export async function getSyncedApprovedTemplate(triggerEvent: string) {
  const keys = TEMPLATE_TRIGGER_ALIASES[triggerEvent] ?? [triggerEvent];
  const allNames = [...new Set([...keys, triggerEvent])];

  const rows = await db
    .select()
    .from(whatsappTemplatesTable)
    .where(
      or(
        inArray(whatsappTemplatesTable.triggerEvent, allNames),
        inArray(whatsappTemplatesTable.name, allNames),
      ),
    );

  const usable = rows.filter(
    (r) =>
      r.approvalStatus === "approved" &&
      (r.submittedToMeta || r.metaTemplateId),
  );

  for (const key of keys) {
    const byTrigger = usable.find((r) => r.triggerEvent === key);
    if (byTrigger) return byTrigger;
    const byName = usable.find((r) => r.name === key);
    if (byName) return byName;
  }

  return usable[0] ?? null;
}
