import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const googleMapSettingsTable = pgTable("google_map_settings", {
  id: serial("id").primaryKey(),
  apiKey: text("api_key"),
  serverApiKey: text("server_api_key"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  autoDetectLocation: boolean("auto_detect_location").notNull().default(true),
  defaultCountry: text("default_country").notNull().default("Pakistan"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const citiesPakistanTable = pgTable("cities_pakistan", {
  id: serial("id").primaryKey(),
  cityName: text("city_name").notNull(),
  province: text("province"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userLocationsTable = pgTable("user_locations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  sessionId: text("session_id"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  fullAddress: text("full_address"),
  city: text("city"),
  country: text("country").default("Pakistan"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGoogleMapSettingsSchema = createInsertSchema(googleMapSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCityPakistanSchema = createInsertSchema(citiesPakistanTable).omit({ id: true, createdAt: true });
export const insertUserLocationSchema = createInsertSchema(userLocationsTable).omit({ id: true, createdAt: true });

export type GoogleMapSettings = typeof googleMapSettingsTable.$inferSelect;
export type CityPakistan = typeof citiesPakistanTable.$inferSelect;
export type UserLocation = typeof userLocationsTable.$inferSelect;
