export interface InvoiceOrder {
  orderNumber: string;
  status: string;
  createdAt?: string | null;
  paymentMethod?: string | null;
  referenceNumber?: string | null;
  paymentStatus?: string;
  deliveryType?: string | null;
  courier?: string | null;
  trackingId?: string | null;
  subtotal: string | number;
  discount?: string | number | null;
  deliveryFee?: string | number | null;
  loyaltyDiscount?: string | number | null;
  walletDiscount?: string | number | null;
  total: string | number;
  couponCode?: string | null;
  notes?: string | null;
  shippingAddress?: {
    name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    postalCode?: string;
  } | null;
  items?: Array<{
    id?: number;
    name: string;
    variant?: string | null;
    price: string | number;
    qty: number;
    gradient?: string | null;
  }>;
}

function rs(n: string | number | null | undefined): string {
  return 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function printInvoice(order: InvoiceOrder): void {
  const addr = order.shippingAddress;
  const items = order.items ?? [];
  const date = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;">
        ${item.name}${item.variant ? ` <span style="font-size:11px;color:#888;">(${item.variant})</span>` : ''}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;">×${item.qty}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;">${rs(item.price)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;"><strong>${rs(Number(item.price) * item.qty)}</strong></td>
    </tr>
  `).join('');

  const pm = (order.paymentMethod ?? 'COD').replace(/_/g, ' ').toUpperCase();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${order.orderNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:13px; color:#1a1a1a; background:#fff; padding:40px; }
    .page { max-width:760px; margin:0 auto; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; border-bottom:3px solid #5FA800; padding-bottom:24px; }
    .brand { display:flex; align-items:center; gap:12px; }
    .logo { width:48px; height:48px; background:#5FA800; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:16px; }
    .brand-name { font-size:24px; font-weight:900; color:#0D2B00; }
    .brand-name span { color:#5FA800; }
    .brand-tagline { font-size:11px; color:#777; margin-top:2px; }
    .invoice-meta { text-align:right; }
    .invoice-title { font-size:20px; font-weight:900; color:#5FA800; text-transform:uppercase; letter-spacing:2px; }
    .invoice-num { font-family:'Courier New',monospace; font-size:14px; font-weight:700; color:#333; margin-top:4px; }
    .invoice-date { font-size:11px; color:#888; margin-top:4px; }
    .status-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background:#eef7e6; color:#5FA800; margin-top:6px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:28px; }
    .info-box { background:#f9fafb; border-radius:10px; padding:16px; border:1px solid #e8ecee; }
    .info-box h3 { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#888; margin-bottom:10px; }
    .info-box p { font-size:13px; color:#333; margin-bottom:4px; line-height:1.5; }
    .info-box p strong { color:#0D2B00; }
    table { width:100%; border-collapse:collapse; margin-bottom:20px; }
    thead tr { background:#0D2B00; color:#fff; }
    thead th { padding:10px 14px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
    thead th:first-child { text-align:left; border-radius:8px 0 0 0; }
    thead th:last-child { border-radius:0 8px 0 0; }
    .totals-wrap { display:flex; justify-content:flex-end; margin-bottom:28px; }
    .totals { width:280px; }
    .total-row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; border-bottom:1px solid #f0f0f0; }
    .total-row.discount { color:#5FA800; }
    .total-row.deduction { color:#6366f1; }
    .total-row.grand { font-size:16px; font-weight:900; color:#0D2B00; border-top:2px solid #0D2B00; border-bottom:none; padding-top:10px; margin-top:4px; }
    .total-row.grand span:last-child { color:#5FA800; }
    .footer { border-top:1px solid #e8ecee; padding-top:16px; display:flex; justify-content:space-between; align-items:center; }
    .footer-note { font-size:11px; color:#aaa; }
    .thank-you { font-size:14px; font-weight:700; color:#5FA800; }
    @media print { body { padding:0; } .page { max-width:100%; } @page { margin:20mm; size:A4; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        <div class="logo">KDF</div>
        <div>
          <div class="brand-name">KDF <span>Plus</span></div>
          <div class="brand-tagline">Smart Shopping. Better Life.</div>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">Invoice</div>
        <div class="invoice-num">${order.orderNumber}</div>
        <div class="invoice-date">${date}</div>
        <div class="status-badge">${statusLabel(order.status)}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h3>Bill To</h3>
        <p><strong>${addr?.name ?? '—'}</strong></p>
        ${addr?.phone ? `<p>${addr.phone}</p>` : ''}
        ${addr?.address ? `<p>${addr.address}</p>` : ''}
        <p>${addr?.city ?? ''}${addr?.city && addr?.country ? ', ' : ''}${addr?.country ?? ''}</p>
        ${addr?.postalCode ? `<p>${addr.postalCode}</p>` : ''}
      </div>
      <div class="info-box">
        <h3>Order Details</h3>
        <p><strong>Order #:</strong> ${order.orderNumber}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Payment:</strong> ${pm}</p>
        ${order.referenceNumber ? `<p><strong>Ref No.:</strong> <span style="font-family:monospace;background:#fffbeb;padding:1px 6px;border-radius:4px;color:#92400e;font-weight:700;">${order.referenceNumber}</span></p>` : ''}
        <p><strong>Delivery:</strong> ${order.deliveryType === 'self' ? 'Self Pickup' : `Courier (${(order.courier ?? 'TCS').toUpperCase()})`}</p>
        ${order.trackingId ? `<p><strong>Tracking:</strong> ${order.trackingId}</p>` : ''}
        ${order.couponCode ? `<p><strong>Coupon:</strong> ${order.couponCode}</p>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align:left">Product</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="4" style="text-align:center;padding:20px;color:#aaa">No items</td></tr>'}
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals">
        <div class="total-row"><span>Subtotal</span><span>${rs(order.subtotal)}</span></div>
        ${Number(order.discount ?? 0) > 0 ? `<div class="total-row discount"><span>Discount</span><span>- ${rs(order.discount)}</span></div>` : ''}
        ${Number(order.loyaltyDiscount ?? 0) > 0 ? `<div class="total-row deduction"><span>Loyalty Points</span><span>- ${rs(order.loyaltyDiscount)}</span></div>` : ''}
        ${Number(order.walletDiscount ?? 0) > 0 ? `<div class="total-row deduction"><span>Wallet Credit</span><span>- ${rs(order.walletDiscount)}</span></div>` : ''}
        <div class="total-row"><span>Delivery Fee</span><span>${rs(order.deliveryFee)}</span></div>
        <div class="total-row grand"><span>Grand Total</span><span>${rs(order.total)}</span></div>
      </div>
    </div>

    ${order.notes ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:12px;color:#92400e;"><strong>Note:</strong> ${order.notes}</div>` : ''}

    <div class="footer">
      <div class="footer-note">KDF Plus • support@kdfplus.com • +92 300 123 4567</div>
      <div class="thank-you">Thank you for your order!</div>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
