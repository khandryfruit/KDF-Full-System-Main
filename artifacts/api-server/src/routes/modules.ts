import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { adminMiddleware } from "../lib/auth.js";

const router = Router();

/* SSE clients waiting for module updates */
const sseClients = new Set<{ id: string; res: any }>();

function broadcastModuleUpdate(module: any) {
  const payload = `data: ${JSON.stringify({ type: "module_update", module })}\n\n`;
  sseClients.forEach(client => {
    try { client.res.write(payload); } catch { sseClients.delete(client); }
  });
}

/* ── GET all modules (admin) ── */
router.get("/admin/modules", adminMiddleware, async (req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM system_modules ORDER BY sort_order`);
    res.json({ modules: rows.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/* ── GET active modules (public — for mobile apps) ── */
router.get("/modules/active", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT module_key, module_name, description, icon, app_visible, web_visible, sort_order
      FROM system_modules
      WHERE is_enabled = true
      ORDER BY sort_order
    `);
    res.json({ modules: rows.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/* ── PUT toggle module ── */
router.put("/admin/modules/:key/toggle", adminMiddleware, async (req, res) => {
  try {
    const key = req.params["key"] as string;
    const rows = await db.execute(sql`
      UPDATE system_modules
      SET is_enabled = NOT is_enabled, updated_at = NOW()
      WHERE module_key = ${key}
      RETURNING *
    `);
    const mod = rows.rows[0];
    if (!mod) return res.status(404).json({ error: "Module not found" });
    broadcastModuleUpdate(mod);
    /* also push to global SSE channel so LahoreDeliveriesPage / other listeners receive it */
    try {
      const { broadcastSSE } = await import("../lib/sse.js");
      broadcastSSE("module_toggled", {
        module_key: mod.module_key, is_enabled: mod.is_enabled,
        module_name: mod.module_name, timestamp: new Date().toISOString(),
      });
    } catch {}
    res.json({ ok: true, module: mod });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/* ── PUT update module settings ── */
router.put("/admin/modules/:key", adminMiddleware, async (req, res) => {
  try {
    const key = req.params["key"] as string;
    const { module_name, description, app_visible, web_visible, sort_order, role_access } = req.body as any;
    await db.execute(sql`
      UPDATE system_modules SET
        module_name  = COALESCE(${module_name},  module_name),
        description  = COALESCE(${description},  description),
        app_visible  = COALESCE(${app_visible},  app_visible),
        web_visible  = COALESCE(${web_visible},  web_visible),
        sort_order   = COALESCE(${sort_order},   sort_order),
        role_access  = COALESCE(${role_access ? JSON.stringify(role_access) : null}::jsonb, role_access),
        updated_at   = NOW()
      WHERE module_key = ${key}
    `);
    const rows = await db.execute(sql`SELECT * FROM system_modules WHERE module_key = ${key}`);
    res.json({ ok: true, module: rows.rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/* ── SSE stream for live module updates ── */
router.get("/admin/modules/events", adminMiddleware, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client = { id: `${Date.now()}-${Math.random()}`, res };
  sseClients.add(client);

  res.write(`data: ${JSON.stringify({ type: "connected", clientCount: sseClients.size })}\n\n`);

  const hb = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(hb); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(hb);
    sseClients.delete(client);
  });
});

export default router;
