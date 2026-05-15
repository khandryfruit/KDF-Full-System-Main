import crypto from "crypto";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!secret || !signature?.startsWith("sha256=") || !rawBody?.length) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const received = signature.slice(7);
    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

/** Try env secret first, then DB — fixes mismatch when DB has stale/wrong secret. */
export function verifyMetaWebhookSignatureAny(
  rawBody: Buffer,
  signature: string | undefined,
  secrets: string[],
): { ok: boolean; matchedIndex: number } {
  if (!signature?.startsWith("sha256=") || !rawBody?.length) return { ok: false, matchedIndex: -1 };
  const unique = [...new Set(secrets.map((s) => s.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i++) {
    if (verifyMetaWebhookSignature(rawBody, signature, unique[i]!)) {
      return { ok: true, matchedIndex: i };
    }
  }
  return { ok: false, matchedIndex: -1 };
}

/** Accept any configured verify token (WA settings + social settings). */
export function isValidMetaWebhookVerifyToken(
  token: string | undefined,
  candidates: Array<string | null | undefined>,
): boolean {
  if (!token) return false;
  const set = new Set(
    candidates.filter((t): t is string => typeof t === "string" && t.length > 0),
  );
  return set.has(token);
}

export { REDIRECT_STATUSES };
