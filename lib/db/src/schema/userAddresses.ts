import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userAddressesTable = pgTable("user_addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  area: text("area"),
  city: text("city").notNull(),
  postalCode: text("postal_code"),
  country: text("country").notNull().default("Pakistan"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UserAddress = typeof userAddressesTable.$inferSelect;
