import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/runMigrations";
import { startAbandonedRecoveryScheduler } from "./lib/whatsappRecovery";
import { startCampaignQueueProcessor } from "./lib/campaignQueue";
import { startShopifyAutoSync, autoRegisterWebhooksOnStartup } from "./lib/shopifyAutoSync";
import { startWaAutomationEngine } from "./lib/waAutomationEngine";
import { startRiderReportScheduler } from "./lib/riderDailyReport.js";

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

// Apply idempotent SQL migrations before accepting traffic so any new
// schema columns (e.g. shopify_product_id) exist before sync routes run.
runMigrations()
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
  })
  .catch((err) => {
    logger.error({ err }, "Failed to apply migrations — aborting startup");
    process.exit(1);
  });
