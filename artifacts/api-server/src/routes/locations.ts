import { Router } from "express";
import { db, googleMapSettingsTable, citiesPakistanTable, userLocationsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth";

const router = Router();

const PAKISTAN_CITIES = [
  { cityName: "Karachi", province: "Sindh" },
  { cityName: "Lahore", province: "Punjab" },
  { cityName: "Islamabad", province: "Federal Capital" },
  { cityName: "Rawalpindi", province: "Punjab" },
  { cityName: "Faisalabad", province: "Punjab" },
  { cityName: "Multan", province: "Punjab" },
  { cityName: "Peshawar", province: "KPK" },
  { cityName: "Quetta", province: "Balochistan" },
  { cityName: "Sialkot", province: "Punjab" },
  { cityName: "Hyderabad", province: "Sindh" },
  { cityName: "Gujranwala", province: "Punjab" },
  { cityName: "Bahawalpur", province: "Punjab" },
  { cityName: "Sargodha", province: "Punjab" },
  { cityName: "Sukkur", province: "Sindh" },
  { cityName: "Larkana", province: "Sindh" },
  { cityName: "Sheikhupura", province: "Punjab" },
  { cityName: "Mardan", province: "KPK" },
  { cityName: "Gujrat", province: "Punjab" },
  { cityName: "Rahim Yar Khan", province: "Punjab" },
  { cityName: "Abbottabad", province: "KPK" },
  { cityName: "Okara", province: "Punjab" },
  { cityName: "Sahiwal", province: "Punjab" },
  { cityName: "Mirpur Khas", province: "Sindh" },
  { cityName: "Kasur", province: "Punjab" },
  { cityName: "Dera Ghazi Khan", province: "Punjab" },
  { cityName: "Nawabshah", province: "Sindh" },
  { cityName: "Muzaffarabad", province: "AJK" },
  { cityName: "Mirpur", province: "AJK" },
  { cityName: "Turbat", province: "Balochistan" },
  { cityName: "Kohat", province: "KPK" },
];

/* ─── Public: Get Cities ─────────────────────────────── */
router.get("/cities", async (req, res) => {
  try {
    const cities = await db
      .select()
      .from(citiesPakistanTable)
      .where(eq(citiesPakistanTable.isActive, true))
      .orderBy(asc(citiesPakistanTable.cityName));

    if (cities.length === 0) {
      return res.json(PAKISTAN_CITIES.map((c) => c.cityName));
    }
    return res.json(cities.map((c) => c.cityName));
  } catch (err) {
    req.log.error(err);
    return res.json(PAKISTAN_CITIES.map((c) => c.cityName));
  }
});

/* ─── Public: Auto-save City (from checkout) ─────────── */
router.post("/cities/auto-save", async (req, res) => {
  try {
    const { cityName } = req.body as { cityName?: string };
    if (!cityName?.trim()) return res.status(400).json({ error: "cityName required" });
    const trimmed = cityName.trim();
    const existing = await db
      .select()
      .from(citiesPakistanTable)
      .where(eq(citiesPakistanTable.cityName, trimmed))
      .limit(1);
    if (existing.length > 0) return res.json(existing[0]);
    const [city] = await db.insert(citiesPakistanTable).values({ cityName: trimmed }).returning();
    return res.status(201).json(city);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Public: Get Location Settings (frontend needs API key) ─── */
router.get("/location-settings", async (req, res) => {
  try {
    const [settings] = await db.select().from(googleMapSettingsTable).limit(1);
    if (!settings || !settings.isEnabled) {
      return res.json({ isEnabled: false, apiKey: null, autoDetectLocation: true });
    }
    return res.json({
      isEnabled: settings.isEnabled,
      apiKey: settings.apiKey,
      autoDetectLocation: settings.autoDetectLocation,
      defaultCountry: settings.defaultCountry,
    });
  } catch (err) {
    req.log.error(err);
    return res.json({ isEnabled: false, apiKey: null, autoDetectLocation: true });
  }
});

/* ─── Public: Save User Location ────────────────────── */
router.post("/user-locations", async (req, res) => {
  try {
    const { userId, sessionId, latitude, longitude, fullAddress, city, country } = req.body;
    const [loc] = await db
      .insert(userLocationsTable)
      .values({
        userId: userId ?? null,
        sessionId: sessionId ?? null,
        latitude: latitude ? String(latitude) : null,
        longitude: longitude ? String(longitude) : null,
        fullAddress: fullAddress ?? null,
        city: city ?? null,
        country: country ?? "Pakistan",
      })
      .returning();
    res.status(201).json(loc);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save location" });
  }
});

/* ─── Admin: Get Full Location Settings ─────────────── */
router.get("/admin/location-settings", adminMiddleware as any, async (req, res) => {
  try {
    const [settings] = await db.select().from(googleMapSettingsTable).limit(1);
    res.json(settings ?? null);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Test Google Maps API Key ────────────────── */
router.post("/admin/location-settings/test", adminMiddleware as any, async (req, res) => {
  try {
    const { apiKey, serverApiKey } = req.body;
    const keyToTest = serverApiKey || apiKey;
    if (!keyToTest) {
      return res.status(400).json({ success: false, error: "No API key provided to test." });
    }
    const testUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=Karachi,Pakistan&key=${keyToTest}`;
    const geoRes = await fetch(testUrl);
    const geoData = await geoRes.json() as any;
    if (geoData.status === "OK") {
      return res.json({ success: true, message: "API key is valid! Google Maps is working correctly." });
    } else if (geoData.status === "REQUEST_DENIED") {
      return res.json({ success: false, error: "Key rejected: " + (geoData.error_message ?? "REQUEST_DENIED — check key restrictions or enabled APIs.") });
    } else {
      return res.json({ success: false, error: `Unexpected status: ${geoData.status}` });
    }
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ success: false, error: err.message ?? "Test request failed." });
  }
});

/* ─── Admin: Save/Update Location Settings ───────────── */
router.put("/admin/location-settings", adminMiddleware as any, async (req, res) => {
  try {
    const { apiKey, serverApiKey, isEnabled, autoDetectLocation, defaultCountry } = req.body;
    const existing = await db.select().from(googleMapSettingsTable).limit(1);
    if (existing.length > 0) {
      const [updated] = await db
        .update(googleMapSettingsTable)
        .set({ apiKey, serverApiKey, isEnabled, autoDetectLocation, defaultCountry, updatedAt: new Date() })
        .where(eq(googleMapSettingsTable.id, existing[0]!.id))
        .returning();
      return res.json(updated);
    } else {
      const [created] = await db
        .insert(googleMapSettingsTable)
        .values({ apiKey, serverApiKey, isEnabled, autoDetectLocation, defaultCountry })
        .returning();
      return res.status(201).json(created);
    }
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: List All Cities ─────────────────────────── */
router.get("/admin/cities", adminMiddleware as any, async (req, res) => {
  try {
    const cities = await db
      .select()
      .from(citiesPakistanTable)
      .orderBy(asc(citiesPakistanTable.cityName));
    return res.json(cities);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Seed Cities (if table empty) ────────────── */
router.post("/admin/cities/seed", adminMiddleware as any, async (req, res) => {
  try {
    const existing = await db.select().from(citiesPakistanTable).limit(1);
    if (existing.length > 0) {
      return res.json({ message: "Cities already seeded", count: existing.length });
    }
    await db.insert(citiesPakistanTable).values(PAKISTAN_CITIES);
    return res.json({ message: "Cities seeded", count: PAKISTAN_CITIES.length });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to seed cities" });
  }
});

/* ─── Admin: Add City ─────────────────────────────────── */
router.post("/admin/cities", adminMiddleware as any, async (req, res) => {
  try {
    const { cityName, province } = req.body;
    if (!cityName) { res.status(400).json({ error: "cityName is required" }); return; }
    const [city] = await db.insert(citiesPakistanTable).values({ cityName, province }).returning();
    res.status(201).json(city);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Update City ─────────────────────────────── */
router.patch("/admin/cities/:id", adminMiddleware as any, async (req, res) => {
  try {
    const [city] = await db
      .update(citiesPakistanTable)
      .set(req.body)
      .where(eq(citiesPakistanTable.id, parseInt(req.params.id)))
      .returning();
    if (!city) { res.status(404).json({ error: "City not found" }); return; }
    res.json(city);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

/* ─── Admin: Delete City ─────────────────────────────── */
router.delete("/admin/cities/:id", adminMiddleware as any, async (req, res) => {
  try {
    await db.delete(citiesPakistanTable).where(eq(citiesPakistanTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
