import { db, waProductSearchLogsTable } from "@workspace/db";
import { logger } from "./logger.js";

export type ProductSearchLogMatch = {
  shopifyProductId: string;
  name: string;
  score: number;
  method: string;
  similarity?: number;
};

export async function logProductSearch(opts: {
  phone?: string | null;
  channel?: string;
  userQuery: string;
  matchMethod: string;
  matches: ProductSearchLogMatch[];
  gptOutput?: string | null;
}): Promise<void> {
  const payload = {
    phone: opts.phone ?? null,
    channel: opts.channel ?? "whatsapp",
    userQuery: opts.userQuery.slice(0, 500),
    matchMethod: opts.matchMethod,
    matchedProducts: opts.matches.map((m) => ({
      shopifyProductId: m.shopifyProductId,
      name: m.name,
      score: m.score,
      method: m.method,
    })),
    similarityScores: opts.matches.map((m) => ({
      shopifyProductId: m.shopifyProductId,
      score: m.score,
      similarity: m.similarity ?? null,
      method: m.method,
    })),
    gptOutput: opts.gptOutput ? opts.gptOutput.slice(0, 4000) : null,
  };

  try {
    await db.insert(waProductSearchLogsTable).values(payload as any);
  } catch (err) {
    logger.warn({ err, query: opts.userQuery }, "wa_product_search_logs insert failed");
  }
}
