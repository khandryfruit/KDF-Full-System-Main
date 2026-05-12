import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/runMigrations";
import { startAbandonedRecoveryScheduler } from "./lib/whatsappRecovery";
import { startCampaignQueueProcessor } from "./lib/campaignQueue";
import { startShopifyAutoSync, autoRegisterWebhooksOnStartup } from "./lib/shopifyAutoSync";
import { startWaAutomationEngine } from "./lib/waAutomationEngine";
import { startRiderReportScheduler } from "./lib/riderDailyReport.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Warm up the DB connection pool before the server accepts traffic.
 *
 * On Railway (and other managed PG providers) the database may be cold after
 * a period of inactivity. Without a warm-up the very first inbound request
 * (e.g. admin login) hits a pool that has no open connections; establishing
 * the first SSL connection can take 5–20 s. If that first request also has
 * to run runMigrations(), the total time easily exceeds Railway's 30-second
 * proxy timeout, producing an empty HTTP 500 before Express ever responds.
 *
 * This function:
 *   1. Issues a lightweight `SELECT 1` to force-open one pool connection.
 *   2. Times out after 12 s so startup never hangs indefinitely.
 *   3. Never throws — a warmup failure is logged as a warning and startup
 *      continues normally (the pool will retry on the next real request).
 */
async function warmUpDb(): Promise<void> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("DB warmup timed out after 12 s")), 12_000)
  );
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      timeout,
    ]);
    logger.info("DB warmup: connection pool ready");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "DB warmup failed — continuing startup (pool will retry on first request)");
  }
}

// Startup sequence:
//  1. Warm up DB connection (so first real request isn't cold)
//  2. Run idempotent SQL migrations (best-effort, never aborts startup)
//  3. Start HTTP server and background schedulers
warmUpDb()
  .then(() => runMigrations())
  .catch((err) => {
    // Should never happen (runMigrations catches internally), but guard anyway.
    logger.warn({ err }, "runMigrations() threw unexpectedly — continuing startup");
  })
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startAbandonedRecoveryScheduler();
      startCampaignQueueProcessor();
      startShopifyAutoSync(15); /* incremental sync every 15 minutes */
      autoRegisterWebhooksOnStartup(); /* auto-register all webhook topics with Shopify */
      startWaAutomationEngine(); /* IF/THEN WA automation rules every 5 min */
      startRiderReportScheduler(); /* rider daily report at 8 PM PKT */
    });
  });
