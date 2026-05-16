import { db, whatsappSettingsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

/** Env secret first (Railway), then DB — both tried on HMAC verify. */
export async function getMetaAppSecrets(): Promise<string[]> {
  const secrets: string[] = [];
  const env = process.env.META_APP_SECRET?.trim();
  if (env) secrets.push(env);
  const [settings] = await db.select({
    appSecret: whatsappSettingsTable.appSecret,
    webhookVerifyToken: whatsappSettingsTable.webhookVerifyToken,
  }).from(whatsappSettingsTable)
    .orderBy(desc(whatsappSettingsTable.isActive), desc(whatsappSettingsTable.updatedAt), desc(whatsappSettingsTable.id))
    .limit(1);
  const dbSecret = settings?.appSecret?.trim();
  if (dbSecret && dbSecret !== env) secrets.push(dbSecret);
  return [...new Set(secrets)];
}

export async function getMetaAppSecret(): Promise<string> {
  const list = await getMetaAppSecrets();
  return list[0] ?? "";
}
