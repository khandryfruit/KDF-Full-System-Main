import { logger } from "./logger";

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;
const FCM_URL = "https://fcm.googleapis.com/fcm/send";

interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface FcmResult {
  success: number;
  failure: number;
  errors: string[];
}

/* ── Single token send ───────────────────────────────── */
export async function sendToToken(token: string, payload: FcmPayload): Promise<boolean> {
  if (!FCM_SERVER_KEY) {
    logger.warn("FCM_SERVER_KEY not set — notification stored but not sent");
    return false;
  }
  try {
    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        notification: { title: payload.title, body: payload.body, sound: "default" },
        data: payload.data ?? {},
        priority: "high",
      }),
    });
    const json = await res.json() as any;
    return json.success === 1;
  } catch (err) {
    logger.error({ err }, "FCM send failed");
    return false;
  }
}

/* ── Multiple tokens send ────────────────────────────── */
export async function sendToTokens(tokens: string[], payload: FcmPayload): Promise<FcmResult> {
  if (!FCM_SERVER_KEY) {
    logger.warn("FCM_SERVER_KEY not set — notification stored but not sent");
    return { success: 0, failure: tokens.length, errors: ["FCM_SERVER_KEY not configured"] };
  }
  if (tokens.length === 0) return { success: 0, failure: 0, errors: [] };

  /* FCM allows up to 1000 tokens per batch */
  const BATCH_SIZE = 1000;
  const result: FcmResult = { success: 0, failure: 0, errors: [] };

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(FCM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=${FCM_SERVER_KEY}`,
        },
        body: JSON.stringify({
          registration_ids: batch,
          notification: { title: payload.title, body: payload.body, sound: "default" },
          data: payload.data ?? {},
          priority: "high",
        }),
      });
      const json = await res.json() as any;
      result.success += json.success ?? 0;
      result.failure += json.failure ?? 0;
      if (json.results) {
        json.results.forEach((r: any) => {
          if (r.error) result.errors.push(r.error);
        });
      }
    } catch (err: any) {
      result.failure += batch.length;
      result.errors.push(err?.message ?? "Unknown error");
      logger.error({ err }, "FCM batch send failed");
    }
  }
  return result;
}

/* ── Topic broadcast ─────────────────────────────────── */
export async function sendToTopic(topic: string, payload: FcmPayload): Promise<boolean> {
  if (!FCM_SERVER_KEY) {
    logger.warn("FCM_SERVER_KEY not set — broadcast stored but not sent");
    return false;
  }
  try {
    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: `/topics/${topic}`,
        notification: { title: payload.title, body: payload.body, sound: "default" },
        data: payload.data ?? {},
        priority: "high",
      }),
    });
    const json = await res.json() as any;
    return !json.error;
  } catch (err) {
    logger.error({ err }, "FCM topic send failed");
    return false;
  }
}
