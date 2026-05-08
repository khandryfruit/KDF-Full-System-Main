import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ── Automation Rules ─────────────────────────────────── */
export const waAutomationRulesTable = pgTable("wa_automation_rules", {
  id:            serial("id").primaryKey(),
  name:          text("name").notNull(),
  triggerType:   text("trigger_type").notNull(), // cart_abandoned | order_delivered | customer_inactive | order_failed_delivery | custom_schedule
  triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().default({}),
  conditionType: text("condition_type").default("always"), // always | order_total_gt | customer_tag | city_match
  conditionConfig: jsonb("condition_config").$type<Record<string, unknown>>().default({}),
  actionType:    text("action_type").notNull().default("send_wa"), // send_wa | send_wa_template
  messageTemplate: text("message_template"),
  templateName:  text("template_name"),
  isActive:      boolean("is_active").notNull().default(true),
  runCount:      integer("run_count").notNull().default(0),
  lastRunAt:     timestamp("last_run_at"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

/* ── Automation Run Log ───────────────────────────────── */
export const waAutomationLogsTable = pgTable("wa_automation_logs", {
  id:          serial("id").primaryKey(),
  ruleId:      integer("rule_id").notNull(),
  ruleName:    text("rule_name"),
  phone:       text("phone"),
  customerName: text("customer_name"),
  orderId:     integer("order_id"),
  status:      text("status").notNull().default("sent"), // sent | failed | skipped
  message:     text("message"),
  error:       text("error"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

/* ── WA Cost Tracking (daily aggregates) ─────────────── */
export const waCostTrackingTable = pgTable("wa_cost_tracking", {
  id:                  serial("id").primaryKey(),
  date:                text("date").notNull().unique(), // YYYY-MM-DD
  totalSent:           integer("total_sent").notNull().default(0),
  totalDelivered:      integer("total_delivered").notNull().default(0),
  totalFailed:         integer("total_failed").notNull().default(0),
  utilityCount:        integer("utility_count").notNull().default(0),
  marketingCount:      integer("marketing_count").notNull().default(0),
  authCount:           integer("auth_count").notNull().default(0),
  serviceCost:         decimal("service_cost", { precision: 10, scale: 4 }).default("0"),
  marketingCost:       decimal("marketing_cost", { precision: 10, scale: 4 }).default("0"),
  utilityCost:         decimal("utility_cost", { precision: 10, scale: 4 }).default("0"),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

/* ── Campaign Schedule ───────────────────────────────── */
export const waCampaignScheduleTable = pgTable("wa_campaign_schedule", {
  id:            serial("id").primaryKey(),
  campaignId:    integer("campaign_id").notNull(),
  scheduledAt:   timestamp("scheduled_at").notNull(),
  status:        text("status").notNull().default("pending"), // pending | sent | cancelled
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export const insertWaAutomationRuleSchema = createInsertSchema(waAutomationRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWaAutomationLogSchema  = createInsertSchema(waAutomationLogsTable).omit({ id: true, createdAt: true });
export const insertWaCostTrackingSchema   = createInsertSchema(waCostTrackingTable).omit({ id: true });

export type WaAutomationRule = typeof waAutomationRulesTable.$inferSelect;
export type WaAutomationLog  = typeof waAutomationLogsTable.$inferSelect;
export type WaCostTracking   = typeof waCostTrackingTable.$inferSelect;
