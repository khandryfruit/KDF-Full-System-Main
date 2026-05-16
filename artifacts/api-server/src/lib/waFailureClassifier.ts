export type WaHealthSeverity = "connected" | "warning" | "disconnected";

export interface WaFailureClassification {
  category: string;
  code: string;
  severity: WaHealthSeverity;
  title: string;
  detail: string;
  actionRequired: string;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

export function classifyWaFailure(input: unknown): WaFailureClassification {
  const raw = stringify(input).slice(0, 2000);
  const text = raw.toLowerCase();

  if (/token|oauth|access token|session|190|expired/.test(text)) {
    return {
      category: "auth_token",
      code: "TOKEN_EXPIRED_OR_INVALID",
      severity: "disconnected",
      title: "Token expired or invalid",
      detail: raw || "Meta rejected the request because the access token is missing, expired, or invalid.",
      actionRequired: "Reconnect WhatsApp or generate a fresh permanent token, then save it in WhatsApp API Settings.",
    };
  }

  if (/invalid_hmac|hmac|signature|app secret/.test(text)) {
    return {
      category: "webhook",
      code: "WEBHOOK_SIGNATURE_MISMATCH",
      severity: "disconnected",
      title: "Webhook disconnected: App Secret mismatch",
      detail: raw || "Meta webhook signature verification failed.",
      actionRequired: "Copy Meta App Secret from Developer Console and save it in WhatsApp API Settings or META_APP_SECRET.",
    };
  }

  if (/template.*reject|rejected|paused|disabled|quality/.test(text)) {
    return {
      category: "template",
      code: "TEMPLATE_REJECTED_OR_PAUSED",
      severity: "disconnected",
      title: "Template rejected, paused, or disabled",
      detail: raw || "Meta rejected or paused a WhatsApp template.",
      actionRequired: "Open Templates, fix the rejected template, submit it again, and retry affected messages.",
    };
  }

  if (/rate|limit|too many|throttle|131056|4\b/.test(text)) {
    return {
      category: "rate_limit",
      code: "META_RATE_LIMIT",
      severity: "warning",
      title: "Meta rate limit reached",
      detail: raw || "Meta is throttling WhatsApp sends.",
      actionRequired: "Slow campaign/automation sending and retry failed messages after the rate limit window.",
    };
  }

  if (/permission|permissions|not allowed|app mode|development|dev mode|business verification|10\b|200\b/.test(text)) {
    return {
      category: "permission",
      code: "PERMISSION_OR_APP_MODE",
      severity: "disconnected",
      title: "Permission issue or app in development mode",
      detail: raw || "Meta rejected the request because the app lacks permission or is not live.",
      actionRequired: "Verify Business Manager permissions, app mode, and WhatsApp product access in Meta Developer Console.",
    };
  }

  if (/phone|recipient|wa_id|not a whatsapp|131026|131047|undeliverable/.test(text)) {
    return {
      category: "recipient_phone",
      code: "PHONE_NUMBER_DISCONNECTED_OR_INVALID",
      severity: "warning",
      title: "Phone number disconnected or invalid",
      detail: raw || "Meta could not deliver to the recipient phone number.",
      actionRequired: "Check the customer's phone number format and confirm the number can receive WhatsApp messages.",
    };
  }

  if (/payment|balance|credit|billing|account disabled/.test(text)) {
    return {
      category: "billing",
      code: "BALANCE_OR_CREDIT_ISSUE",
      severity: "disconnected",
      title: "Balance or credit issue",
      detail: raw || "Meta billing or account credit is blocking WhatsApp messages.",
      actionRequired: "Check WhatsApp Business billing, payment method, account status, and message credit limits.",
    };
  }

  if (/fetch|network|timeout|econn|socket|5\d\d|server error/.test(text)) {
    return {
      category: "server_error",
      code: "NETWORK_OR_SERVER_ERROR",
      severity: "warning",
      title: "Network or server error",
      detail: raw || "The server could not complete the WhatsApp request.",
      actionRequired: "Retry automatically; if repeated, check API server logs and Meta Graph API status.",
    };
  }

  if (/not configured|inactive|missing|credentials|phone_number_id|phone number id/.test(text)) {
    return {
      category: "configuration",
      code: "INVALID_CREDENTIALS_OR_CONFIGURATION",
      severity: "disconnected",
      title: "Invalid credentials or missing configuration",
      detail: raw || "WhatsApp API settings are incomplete or inactive.",
      actionRequired: "Fill Access Token, Phone Number ID, Business Account ID, App Secret, and enable the integration.",
    };
  }

  return {
    category: "unknown",
    code: "UNKNOWN_META_ERROR",
    severity: "warning",
    title: "Meta API error",
    detail: raw || "WhatsApp failed but Meta did not return a detailed reason.",
    actionRequired: "Open the log response, retry once, and check Meta Developer Console if the failure repeats.",
  };
}
