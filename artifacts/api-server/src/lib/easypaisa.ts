/**
 * Easypaisa Payment Gateway Integration
 * Docs: https://sandbox.easypay.pk/api-pay-doc/
 *
 * Flow: Customer enters mobile + OTP on hosted page → EP callbacks to /api/payments/easypaisa/callback
 * Auth: AES-128-CBC encrypted payload with storeId + hashKey
 */

import crypto from "crypto";

export interface EasypaisaSettings {
  storeId: string;
  hashKey: string;
  returnUrl: string;
  isSandbox?: boolean;
}

export interface EasypaisaInitiateParams {
  amount: number;       // PKR
  orderId: string;
  orderDesc: string;
  customerEmail?: string;
  customerMobile?: string;
  returnUrl: string;
}

const SANDBOX_URL = "https://easypaystg.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction";
const LIVE_URL    = "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction";

const SANDBOX_WEB_URL = "https://easypaystg.easypaisa.com.pk/easypay/";
const LIVE_WEB_URL    = "https://easypay.easypaisa.com.pk/easypay/";

export function buildEasypaisaPayload(
  settings: EasypaisaSettings,
  params: EasypaisaInitiateParams
): { payload: Record<string, string>; apiUrl: string; webUrl: string } {
  const orderId = params.orderId.replace(/\W/g, "").slice(0, 20);
  const expiryDateTime = new Date(Date.now() + 30 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const payload: Record<string, string> = {
    storeId:          settings.storeId,
    amount:           params.amount.toFixed(2),
    postBackURL:      params.returnUrl,
    orderRefNum:      orderId,
    expiryDate:       expiryDateTime,
    storeName:        "KDF NUTS",
    tokenExpiry:      expiryDateTime,
    transactionType:  "MA",
    mobileAccountNo:  params.customerMobile ?? "",
    emailAddress:     params.customerEmail ?? "",
  };

  const hash = buildEasypaisaHash(payload, settings.hashKey);
  payload.encryptedHashRequest = hash;

  return {
    payload,
    apiUrl: settings.isSandbox ? SANDBOX_URL : LIVE_URL,
    webUrl: settings.isSandbox ? SANDBOX_WEB_URL : LIVE_WEB_URL,
  };
}

function buildEasypaisaHash(params: Record<string, string>, hashKey: string): string {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  return crypto.createHmac("sha256", hashKey).update(sorted).digest("base64");
}

export function verifyEasypaisaCallback(
  postData: Record<string, string>,
  hashKey: string
): boolean {
  const { encryptedHashRequest, ...rest } = postData;
  if (!encryptedHashRequest) return false;
  const expected = buildEasypaisaHash(rest, hashKey);
  try {
    return crypto.timingSafeEqual(Buffer.from(encryptedHashRequest), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isEasypaisaSuccess(responseCode: string): boolean {
  return responseCode === "0000";
}

export const EASYPAISA_RESPONSE_CODES: Record<string, string> = {
  "0000": "Transaction Successful",
  "0001": "Invalid Hash",
  "0002": "Invalid Store ID",
  "0003": "Invalid Amount",
  "0004": "Invalid Order Reference",
  "0005": "Transaction Already Exists",
  "0006": "Invalid Expiry Date",
  "0007": "Transaction Expired",
  "0008": "Account Not Registered",
  "0009": "Insufficient Balance",
  "0010": "Transaction Failed",
  "9999": "Internal Error",
};
