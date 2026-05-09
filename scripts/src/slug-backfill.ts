/**
 * One-time slug cleanup script — safe to run multiple times (idempotent).
 *
 * Calls POST /api/admin/products/backfill-slugs with an admin JWT
 * to sanitise all existing product slugs in the database.
 *
 * Usage (preferred — supply a real admin JWT):
 *   ADMIN_JWT=<token> API_BASE=http://localhost:80 \
 *     pnpm --filter @workspace/scripts run backfill-slugs
 *
 * Fallback (ops-only — mint a short-lived token from the server secret):
 *   SESSION_SECRET=<secret> API_BASE=http://localhost:80 \
 *     pnpm --filter @workspace/scripts run backfill-slugs
 *
 * Environment variables:
 *   ADMIN_JWT       — preferred; a valid admin Bearer token obtained from login
 *   SESSION_SECRET  — fallback; mints a 5-minute admin JWT using the server secret
 *   API_BASE        — optional, defaults to http://localhost:80
 */

import jwt from "jsonwebtoken";
const { sign } = jwt;

const apiBase = (process.env.API_BASE ?? "http://localhost:80").replace(/\/$/, "");

let token: string;

if (process.env.ADMIN_JWT) {
  token = process.env.ADMIN_JWT;
  console.log("[slug-backfill] Using provided ADMIN_JWT.");
} else {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error(
      "ERROR: Provide either ADMIN_JWT (preferred) or SESSION_SECRET (fallback).",
    );
    process.exit(1);
  }
  token = sign({ id: 1, role: "admin" }, secret, { expiresIn: "5m" });
  console.log("[slug-backfill] Minted short-lived admin JWT from SESSION_SECRET (fallback).");
}

console.log(`[slug-backfill] Calling ${apiBase}/api/admin/products/backfill-slugs …`);

const res = await fetch(`${apiBase}/api/admin/products/backfill-slugs`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
});

if (!res.ok) {
  console.error(`[slug-backfill] HTTP ${res.status}:`, await res.text());
  process.exit(1);
}

const data = (await res.json()) as {
  success: boolean;
  fixed: number;
  skipped: number;
  log: { id: number; old: string; new: string }[];
};

console.log(`[slug-backfill] Done — fixed: ${data.fixed}, skipped: ${data.skipped}`);
if (data.log.length > 0) {
  console.log("[slug-backfill] Changed slugs:");
  for (const entry of data.log) {
    console.log(`  id=${entry.id}  "${entry.old}" → "${entry.new}"`);
  }
}
