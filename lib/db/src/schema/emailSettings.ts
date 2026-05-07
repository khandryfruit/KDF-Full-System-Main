import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const emailSettingsTable = pgTable("email_settings", {
  id:                     serial("id").primaryKey(),
  emailEnabled:           boolean("email_enabled").notNull().default(false),
  smtpHost:               text("smtp_host").notNull().default(""),
  smtpPort:               integer("smtp_port").notNull().default(587),
  smtpUser:               text("smtp_user").notNull().default(""),
  smtpPass:               text("smtp_pass").notNull().default(""),
  smtpFrom:               text("smtp_from").notNull().default(""),
  orderConfirmEnabled:    boolean("order_confirm_enabled").notNull().default(true),
  orderConfirmSubject:    text("order_confirm_subject").notNull().default("Your KDF Nuts Order Confirmation"),
  orderConfirmTemplate:   text("order_confirm_template").notNull().default(""),
  updatedAt:              timestamp("updated_at").notNull().defaultNow(),
});

export type EmailSettings = typeof emailSettingsTable.$inferSelect;
