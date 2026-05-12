import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Applies SQL migration files from the migrations/ directory at server startup.
 * Uses a `schema_migrations` tracking table so each file is applied exactly once.
 * Files must end in .sql and are applied in lexicographic order.
 *
 * Supports two formats:
 *  1. drizzle-kit generated files → statements separated by --> statement-breakpoint
 *  2. Hand-written migration files → statements separated by semicolons
 *
 * Each statement is executed individually. "Already exists" errors (e.g. when
 * running against a dev DB that was previously set up with drizzle-kit push)
 * are logged as warnings and skipped so the migration can still be recorded as
 * applied — keeping dev and production in sync without crashing the server.
 */

/** Returns true if this PostgreSQL error means the object already existed. */
function isAlreadyExistsError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "").toLowerCase();
  return (
    msg.includes("already exists") ||
    msg.includes("duplicate_object") ||
    msg.includes("duplicate column") ||
    msg.includes("duplicate key") ||
    // "relation X of type index already exists" etc.
    msg.includes("relation") && msg.includes("already exists")
  );
}

export async function runMigrations(): Promise<void> {
  // esbuild bundles everything into dist/index.mjs, so __dirname = dist/
  // The migrations folder sits at artifacts/api-server/migrations/ = dist/../migrations
  const migrationsDir = join(__dirname, "../migrations");

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

  // Ensure migration tracking table exists (idempotent)
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `));

  for (const file of files) {
    // Skip already-applied migrations
    const result = await db.execute(
      sql.raw(`SELECT 1 FROM schema_migrations WHERE filename = '${file.replace(/'/g, "''")}'`)
    );
    const rows = (result as any).rows ?? result;
    if (Array.isArray(rows) && rows.length > 0) {
      logger.info({ migration: file }, "Migration already applied — skipping");
      continue;
    }

    const filePath = join(migrationsDir, file);
    let statements: string[];

    try {
      const content = readFileSync(filePath, "utf-8");

      if (content.includes("-->")) {
        // drizzle-kit format: split on --> statement-breakpoint markers
        statements = content
          .split(/-->[\s]*statement-breakpoint/g)
          .map((s) => s.trim().replace(/;$/, "").trim())
          .filter(Boolean);
      } else {
        // Hand-written format: split on semicolons
        statements = content
          .split(/;\s*\n/)
          .map((s) => s.replace(/--[^\n]*/g, "").trim())
          .filter(Boolean);
      }
    } catch (err) {
      logger.error({ migration: file, err }, "Failed to read migration file — skipping");
      continue;
    }

    logger.info({ migration: file, statements: statements.length }, "Applying migration");

    let skipped = 0;
    let applied = 0;

    for (const statement of statements) {
      const clean = statement.replace(/;$/, "").trim();
      if (!clean) continue;

      try {
        await db.execute(sql.raw(clean));
        applied++;
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          // Object already created (e.g. dev DB had drizzle-kit push run before).
          // Log at debug level and continue — this is expected behaviour.
          logger.debug(
            { migration: file, preview: clean.slice(0, 80) },
            "Statement skipped — object already exists"
          );
          skipped++;
        } else {
          // Unexpected error — abort so the problem is visible.
          logger.error({ migration: file, err }, "Migration failed — aborting startup");
          throw err;
        }
      }
    }

    // Record migration as applied regardless of skipped count.
    // Skipped = already-exists = schema is already correct.
    await db.execute(
      sql.raw(`INSERT INTO schema_migrations (filename) VALUES ('${file.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`)
    );
    logger.info({ migration: file, applied, skipped }, "Migration recorded as applied");
  }
}
