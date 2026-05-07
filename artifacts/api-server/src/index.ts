import app from "./app";
import { logger } from "./lib/logger";
import { startAbandonedRecoveryScheduler } from "./lib/whatsappRecovery";
import { startCampaignQueueProcessor } from "./lib/campaignQueue";
import { startShopifyAutoSync, autoRegisterWebhooksOnStartup } from "./lib/shopifyAutoSync";

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
});
