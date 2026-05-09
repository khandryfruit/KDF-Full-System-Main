import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Applies SQL migration files from the migrations/ directory at server startup.
 * Files are applied in lexicographic order and are idempotent (each file uses
 * IF NOT EXISTS / IF EXISTS guards so it is safe to re-run).
 *
 * This project uses drizzle-kit push for schema management during development,
 * but SQL migration files under artifacts/api-server/migrations/ serve as the
 * canonical, version-controlled record of schema changes and are the safe
 * deployment path for production databases that cannot use interactive pushes.
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = join(__dirname, "../../migrations");

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    logger.info("No migrations directory found — skipping");
    return;
  }

  if (files.length === 0) {
    logger.info("No SQL migrations to apply");
    return;
  }

  for (const file of files) {
    const filePath = join(migrationsDir, file);
    try {
      const statements = readFileSync(filePath, "utf-8");
      await db.execute(sql.raw(statements));
      logger.info({ migration: file }, "Applied migration");
    } catch (err) {
      logger.error({ migration: file, err }, "Migration failed");
      throw err;
    }
  }
}
