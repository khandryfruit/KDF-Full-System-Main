/**
 * JazzCash Payment Gateway Integration
 * Docs: https://sandbox.jazzcash.com.pk/ApplicationAPI/API/index.html
 *
 * Flow: POST to JazzCash hosted checkout → customer pays → JazzCash POSTs callback to /api/payments/jazzcash/callback
 * Auth: HMAC-SHA256 hash of sorted params with IntegrationSalt
 */

import crypto from "crypto";

export interface JazzCashSettings {
  merchantId: string;
  password: string;
  integrationSalt: string;
  returnUrl: string;
  isSandbox?: boolean;
}

export interface JazzCashInitiateParams {
  amount: number;       // in PKR
  orderId: string;
  orderDesc: string;
  customerEmail?: string;
  customerMobile?: string;
  returnUrl: string;
}

const SANDBOX_URL = "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
const LIVE_URL    = "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";

function formatAmount(amount: number): string {
  return String(Math.round(amount * 100)).padStart(1, "0");
}

function getDateTime(): { txnDateTime: string; txnExpiryDateTime: string } {
  const now = new Date();
  const exp = new Date(now.getTime() + 30 * 60 * 1000); // 30 min expiry
  const fmt = (d: Date) =>
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") +
    String(d.getSeconds()).padStart(2, "0");
  return { txnDateTime: fmt(now), txnExpiryDateTime: fmt(exp) };
}

function buildHash(params: Record<string, string>, salt: string): string {
  const sorted = Object.keys(params).sort().map(k => params[k]).join("&");
  const str = `${salt}&${sorted}`;
  return crypto.createHmac("sha256", salt).update(str).digest("hex");
}

export function buildJazzCashForm(settings: JazzCashSettings, params: JazzCashInitiateParams): {
  actionUrl: string;
  formFields: Record<string, string>;
} {
  const { txnDateTime, txnExpiryDateTime } = getDateTime();
  const txnRefNo = `T${params.orderId.replace(/\W/g, "").slice(0, 14)}${Date.now().toString().slice(-4)}`;

  const fields: Record<string, string> = {
    pp_Version:          "1.1",
    pp_TxnType:          "MWALLET",
    pp_Language:         "EN",
    pp_MerchantID:       settings.merchantId,
    pp_Password:         settings.password,
    pp_TxnRefNo:         txnRefNo,
    pp_Amount:           formatAmount(params.amount),
    pp_TxnCurrency:      "PKR",
    pp_TxnDateTime:      txnDateTime,
    pp_BillReference:    params.orderId,
    pp_Description:      params.orderDesc.slice(0, 100),
    pp_TxnExpiryDateTime: txnExpiryDateTime,
    pp_ReturnURL:        params.returnUrl,
    pp_SecureHash:       "",
  };
  if (params.customerEmail) fields["pp_CustomerEmail"] = params.customerEmail;
  if (params.customerMobile) fields["pp_MobileNumber"] = params.customerMobile;

  // Remove pp_SecureHash before hashing
  const { pp_SecureHash: _, ...hashable } = fields;
  fields.pp_SecureHash = buildHash(hashable, settings.integrationSalt);

  return {
    actionUrl: settings.isSandbox ? SANDBOX_URL : LIVE_URL,
    formFields: fields,
  };
}

export function verifyJazzCashCallback(
  postData: Record<string, string>,
  salt: string
): boolean {
  const { pp_SecureHash, ppmpf_1, ppmpf_2, ppmpf_3, ppmpf_4, ppmpf_5, ...rest } = postData;
  if (!pp_SecureHash) return false;
  const expected = buildHash(rest, salt);
  return crypto.timingSafeEqual(Buffer.from(pp_SecureHash), Buffer.from(expected));
}

export function isJazzCashSuccess(responseCode: string): boolean {
  return responseCode === "000";
}

export const JAZZCASH_RESPONSE_CODES: Record<string, string> = {
  "000": "Transaction Successful",
  "121": "Transaction Failed — Insufficient Funds",
  "122": "Transaction Failed — Invalid PIN",
  "124": "Transaction Failed — PIN Tries Exceeded",
  "157": "Transaction Failed — Account Blocked",
  "200": "Transaction Failed",
  "400": "Transaction Failed — Invalid Merchant",
  "401": "Transaction Failed — Invalid Password",
  "402": "Transaction Failed — Invalid Security Hash",
  "404": "Transaction Failed — Duplicate Transaction",
  "500": "Transaction Failed — Internal Error",
};
