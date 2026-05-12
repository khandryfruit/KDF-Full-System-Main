import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Best-effort idempotent migration runner.
 *
 * Design goals (production-safe):
 *  - NEVER aborts server startup — all errors are caught and logged.
 *  - Each SQL file is applied at most once (tracked in schema_migrations).
 *  - Each statement inside a file is tried individually in a fresh transaction.
 *  - "Already exists" errors → skipped silently (object is already there).
 *  - Any other error → logged as WARN, skipped, execution continues.
 *  - Migration is recorded as applied at the end regardless of skipped count.
 *  - Supports both drizzle-kit format (-->statement-breakpoint) and semicolons.
 *
 * Path resolution:
 *  esbuild bundles everything into dist/index.mjs → __dirname = dist/
 *  build.mjs copies migrations/ → dist/migrations/ during build
 *  So the correct path is join(__dirname, "migrations")
 */

/** Classify a caught error into a short category string for structured logging. */
function classifyError(err: unknown): { category: string; safe: boolean } {
  const msg = String(
    (err as any)?.message ?? (err as any)?.cause?.message ?? ""
  ).toLowerCase();

  // PostgreSQL "already exists" family — completely safe to skip
  if (
    msg.includes("already exists") ||
    msg.includes("duplicate_object") ||
    msg.includes("duplicate column") ||
    msg.includes("duplicate key value")
  ) {
    return { category: "already_exists", safe: true };
  }

  // "does not exist" — dependency not yet created; skip, warn
  if (msg.includes("does not exist")) {
    return { category: "dependency_missing", safe: false };
  }

  // Syntax / type errors in the SQL itself
  if (msg.includes("syntax error") || msg.includes("parse error")) {
    return { category: "syntax_error", safe: false };
  }

  return { category: "unknown", safe: false };
}

/** Split a migration file into individual statements. */
function splitStatements(content: string): string[] {
  if (content.includes("-->")) {
    // drizzle-kit generated: split on --> statement-breakpoint markers
    return content
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.replace(/;$/, "").trim())
      .filter(Boolean);
  }
  // Hand-written: split on semicolons followed by newline
  return content
    .split(/;\s*\n/)
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
}

export async function runMigrations(): Promise<void> {
  // build.mjs copies migrations/ → dist/migrations/ so __dirname/migrations works
  const migrationsDir = join(__dirname, "migrations");

  let files: string[];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    logger.warn(
      { migrationsDir },
      "Migrations directory not found — skipping schema migrations"
    );
    return;
  }

  if (files.length === 0) {
    logger.info("No SQL migration files found — skipping");
    return;
  }

  // Ensure tracking table exists — this is the only statement that can throw
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));
  } catch (err) {
    logger.error({ err }, "Cannot create schema_migrations table — skipping all migrations");
    return;
  }

  for (const file of files) {
    // ── Already applied? ────────────────────────────────────────────────────
    try {
      const result = await db.execute(
        sql.raw(
          `SELECT 1 FROM schema_migrations WHERE filename = '${file.replace(/'/g, "''")}'`
        )
      );
      const rows = (result as any).rows ?? result;
      if (Array.isArray(rows) && rows.length > 0) {
        logger.info({ migration: file }, "Migration already applied — skipping");
        continue;
      }
    } catch (err) {
      logger.warn({ migration: file, err }, "Could not check migration status — attempting anyway");
    }

    // ── Parse statements ────────────────────────────────────────────────────
    let statements: string[];
    try {
      const content = readFileSync(join(migrationsDir, file), "utf-8");
      statements = splitStatements(content);
    } catch (err) {
      logger.error({ migration: file, err }, "Failed to read migration file — skipping");
      continue;
    }

    logger.info({ migration: file, total: statements.length }, "Applying migration");

    let applied = 0;
    let alreadyExists = 0;
    let warnings = 0;

    // ── Execute each statement ───────────────────────────────────────────────
    for (const statement of statements) {
      const clean = statement.replace(/;$/, "").trim();
      if (!clean) continue;

      try {
        await db.execute(sql.raw(clean));
        applied++;
      } catch (err) {
        const { category, safe } = classifyError(err);

        if (safe) {
          // "already exists" — the object is already there, nothing to do
          alreadyExists++;
          logger.debug(
            { migration: file, category, preview: clean.slice(0, 100) },
            "Statement skipped (object already exists)"
          );
        } else {
          // Unexpected error — log as WARN and keep going.
          // We NEVER abort startup; partial schema is better than no server.
          warnings++;
          logger.warn(
            {
              migration: file,
              category,
              preview: clean.slice(0, 120),
              err: (err as any)?.message ?? String(err),
            },
            "Statement failed — continuing (best-effort)"
          );
        }
      }
    }

    // ── Record as applied ────────────────────────────────────────────────────
    // Always record — even if some statements had warnings — so we don't
    // re-run the same migration on every restart and cause thundering-herd
    // errors on a live production database.
    try {
      await db.execute(
        sql.raw(
          `INSERT INTO schema_migrations (filename) VALUES ('${file.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`
        )
      );
    } catch (err) {
      logger.warn({ migration: file, err }, "Could not record migration as applied");
    }

    if (warnings > 0) {
      logger.warn(
        { migration: file, applied, alreadyExists, warnings },
        "Migration recorded with warnings — some statements were skipped"
      );
    } else {
      logger.info(
        { migration: file, applied, alreadyExists },
        "Migration applied successfully"
      );
    }
  }

  logger.info({ files: files.length }, "Migration run complete");
}
