import nodemailer from "nodemailer";
import { db, emailSettingsTable } from "@workspace/db";

async function getMailTransport() {
  const [settings] = await db.select().from(emailSettingsTable).limit(1);
  if (!settings?.emailEnabled || !settings.smtpHost || !settings.smtpUser) return null;
  return {
    transport: nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
    }),
    from: settings.smtpFrom || settings.smtpUser,
    settings,
  };
}

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  paymentMethod: string;
  items: Array<{ name: string; variant?: string; price: number; qty: number }>;
  subtotal: number;
  deliveryFee: number;
  total: number;
  customerEmail?: string;
}

function buildOrderConfirmHtml(data: OrderEmailData): string {
  const itemRows = data.items.map(it => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">
        <strong>${it.name}</strong>${it.variant ? ` <span style="color:#888;font-size:12px">(${it.variant})</span>` : ""}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${it.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right">Rs. ${(it.price * it.qty).toLocaleString()}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%">
        <tr><td style="background:linear-gradient(135deg,#5FA800,#4d8a00);padding:32px 40px;text-align:center">
          <h1 style="margin:0;color:#fff;font-size:28px;font-weight:900;letter-spacing:-0.5px">KDF Nuts</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px">Premium Dry Fruits & Nuts</p>
        </td></tr>
        <tr><td style="padding:32px 40px">
          <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px">Order Confirmed! 🎉</h2>
          <p style="color:#555;margin:0 0 24px;font-size:15px">Hi ${data.customerName}, your order has been received and is being processed.</p>
          <div style="background:#f8f9fa;border-radius:10px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.5px">Order Number</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:900;color:#5FA800;font-family:monospace">${data.orderNumber}</p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:10px;overflow:hidden;margin-bottom:24px">
            <thead><tr style="background:#f8f9fa">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase">Item</th>
              <th style="padding:10px 12px;text-align:center;font-size:12px;color:#888;text-transform:uppercase">Qty</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#888;text-transform:uppercase">Price</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr><td style="padding:4px 0;color:#555">Subtotal</td><td style="padding:4px 0;text-align:right;color:#555">Rs. ${data.subtotal.toLocaleString()}</td></tr>
            <tr><td style="padding:4px 0;color:#555">Delivery</td><td style="padding:4px 0;text-align:right;color:#555">Rs. ${data.deliveryFee.toLocaleString()}</td></tr>
            <tr><td style="padding:8px 0 4px;font-weight:bold;font-size:17px;border-top:2px solid #eee;color:#1a1a1a">Total</td><td style="padding:8px 0 4px;text-align:right;font-weight:bold;font-size:17px;border-top:2px solid #eee;color:#5FA800">Rs. ${data.total.toLocaleString()}</td></tr>
          </table>
          <div style="background:#f0f8e8;border:1px solid #c8e6a0;border-radius:10px;padding:16px 20px;margin-bottom:24px">
            <p style="margin:0 0 8px;font-weight:bold;color:#1a1a1a;font-size:14px">Delivery Details</p>
            <p style="margin:0;color:#555;font-size:14px;line-height:1.6">${data.customerName}<br>${data.phone}<br>${data.address}, ${data.city}</p>
            <p style="margin:8px 0 0;font-size:13px;color:#888">Payment: ${data.paymentMethod === "bank_transfer" ? "Bank Transfer" : "Cash on Delivery"}</p>
          </div>
          <p style="color:#888;font-size:13px;line-height:1.6;margin:0">Our team will confirm your order shortly. For any queries, contact us on WhatsApp or reply to this email.</p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:20px 40px;text-align:center;border-top:1px solid #eee">
          <p style="margin:0;color:#aaa;font-size:12px">© ${new Date().getFullYear()} KDF Nuts · Pakistan's Premium Dry Fruits Store</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendOrderConfirmation(data: OrderEmailData): Promise<void> {
  if (!data.customerEmail) return;
  const conn = await getMailTransport();
  if (!conn) return;
  if (!conn.settings.orderConfirmEnabled) return;
  try {
    await conn.transport.sendMail({
      from: conn.from,
      to: data.customerEmail,
      subject: conn.settings.orderConfirmSubject || "Your KDF Nuts Order Confirmation",
      html: buildOrderConfirmHtml(data),
    });
  } catch (err) {
    console.error("Email send failed:", err);
  }
}
