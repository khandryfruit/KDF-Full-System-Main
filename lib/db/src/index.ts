import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Railway and most managed PostgreSQL providers require SSL.
// If the DATABASE_URL already contains sslmode=require the pg library
// handles it automatically. We additionally enable SSL for any URL that
// does NOT already contain an explicit sslmode so deployments on Railway,
// Supabase, Neon, etc. work out of the box. `rejectUnauthorized: false`
// is safe here because the connection is authenticated by the URL credentials.
const isLocal =
  process.env["NODE_ENV"] === "development" ||
  (process.env["DATABASE_URL"] ?? "").includes("localhost") ||
  (process.env["DATABASE_URL"] ?? "").includes("127.0.0.1");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // Maximum connections in the pool — Railway free plan has a 25-connection limit.
  max: 8,
  // How long (ms) to wait for a connection from the pool before throwing.
  // Without this, a cold-start DB on Railway can hang indefinitely and cause
  // Railway's proxy to return an empty 500 before Express responds.
  connectionTimeoutMillis: 15_000,
  // Release idle connections after 30 s to keep Railway's connection count low.
  idleTimeoutMillis: 30_000,
  // Per-query server-side timeout. Prevents runaway queries blocking the pool.
  // Must be lower than Railway's 60 s proxy timeout.
  query_timeout: 25_000,
  // Client-level statement timeout (same value, belt-and-suspenders).
  statement_timeout: 25_000,
});

export const db = drizzle(pool, { schema });

/**
 * Prevent unhandled pool errors from crashing the process.
 * pg.Pool emits 'error' on idle client errors (e.g. Neon auto-suspend,
 * network drops). Without this handler Node exits with an uncaught exception.
 */
pool.on("error", (err) => {
  /* eslint-disable-next-line no-console */
  console.error("[db-pool] idle client error:", err.message);
});

export * from "./schema";
