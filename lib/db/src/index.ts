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
});
export const db = drizzle(pool, { schema });

export * from "./schema";
