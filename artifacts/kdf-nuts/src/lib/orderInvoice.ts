export interface InvoiceData {
  orderNumber: string;
  orderId?: string | number;
  createdAt?: string;
  paymentMethod?: string;
  referenceNumber?: string | null;
  paymentStatus?: string;
  deliveryType?: string;
  subtotal?: number | string;
  discount?: number | string;
  deliveryFee?: number | string;
  total?: number | string;
  shippingAddress?: {
    name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    postalCode?: string;
  };
  items?: Array<{
    name: string;
    variant?: string | null;
    price: number | string;
    qty: number;
  }>;
}

export function printOrderInvoice(data: InvoiceData) {
  const date = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" });

  const addr = data.shippingAddress;
  const items = data.items ?? [];

  const itemRows = items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
        <strong>${i.name}</strong>
        ${i.variant ? `<br><span style="color:#888;font-size:12px;">${i.variant}</span>` : ""}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">×${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">
        Rs. ${(Number(i.price) * i.qty).toLocaleString()}
      </td>
    </tr>
  `).join("");

  const pm = (data.paymentMethod ?? "cod").replace(/_/g, " ").toUpperCase();
  const ps = (data.paymentStatus ?? "pending").toUpperCase();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${data.orderNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background:#fff; color:#1a1a1a; padding:40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:2px solid #5FA800; }
    .brand { font-size:24px; font-weight:900; color:#5FA800; letter-spacing:-0.5px; }
    .brand-sub { font-size:12px; color:#888; margin-top:2px; }
    .invoice-meta { text-align:right; }
    .invoice-meta h2 { font-size:20px; font-weight:700; color:#333; }
    .invoice-meta p { font-size:12px; color:#888; margin-top:4px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }
    .box { background:#f8f9fb; border-radius:12px; padding:16px; }
    .box h4 { font-size:10px; font-weight:700; color:#5FA800; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; }
    .box p { font-size:13px; color:#444; margin-bottom:4px; }
    .box strong { color:#1a1a1a; }
    table { width:100%; border-collapse:collapse; margin-bottom:20px; }
    thead { background:#f8f9fb; }
    th { padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:0.5px; }
    th:last-child { text-align:right; }
    th:nth-child(2) { text-align:center; }
    .totals { max-width:300px; margin-left:auto; background:#f8f9fb; border-radius:12px; padding:16px; }
    .totals-row { display:flex; justify-content:space-between; font-size:13px; color:#555; margin-bottom:8px; }
    .totals-row.total { font-size:16px; font-weight:800; color:#5FA800; border-top:2px solid #e0e0e0; padding-top:10px; margin-top:4px; }
    .footer { margin-top:40px; text-align:center; font-size:12px; color:#999; border-top:1px solid #f0f0f0; padding-top:20px; }
    .status { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
    .status-paid { background:#eef7e6; color:#5FA800; }
    .status-unpaid { background:#fff0f0; color:#e53e3e; }
    .status-pending { background:#fefce8; color:#b7791f; }
    @media print { body { padding:20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">🥜 KDF NUTS</div>
      <div class="brand-sub">Premium Dry Fruits &amp; Nuts</div>
    </div>
    <div class="invoice-meta">
      <h2>INVOICE</h2>
      <p><strong>${data.orderNumber}</strong></p>
      <p>${date}</p>
      <p><span class="status status-${data.paymentStatus ?? 'pending'}">${ps}</span></p>
    </div>
  </div>

  <div class="grid">
    ${addr ? `
    <div class="box">
      <h4>Ship To</h4>
      <p><strong>${addr.name}</strong></p>
      <p>${addr.phone}</p>
      <p>${addr.address}</p>
      <p>${addr.city}${addr.postalCode ? ", " + addr.postalCode : ""}, ${addr.country}</p>
    </div>
    ` : "<div></div>"}
    <div class="box">
      <h4>Payment Details</h4>
      <p><strong>Method:</strong> ${pm}</p>
      ${data.referenceNumber ? `<p><strong>Ref No.:</strong> <span style="font-family:monospace;background:#fffbeb;padding:1px 6px;border-radius:4px;color:#92400e;font-weight:700;">${data.referenceNumber}</span></p>` : ""}
      <p><strong>Delivery:</strong> ${(data.deliveryType ?? "standard").toUpperCase()}</p>
    </div>
  </div>

  ${items.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Qty</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  ` : ""}

  <div class="totals">
    ${Number(data.subtotal ?? 0) > 0 ? `<div class="totals-row"><span>Subtotal</span><span>Rs. ${Number(data.subtotal).toLocaleString()}</span></div>` : ""}
    ${Number(data.discount ?? 0) > 0 ? `<div class="totals-row"><span>Discount</span><span>-Rs. ${Number(data.discount).toLocaleString()}</span></div>` : ""}
    ${Number(data.deliveryFee ?? 0) > 0 ? `<div class="totals-row"><span>Delivery</span><span>Rs. ${Number(data.deliveryFee).toLocaleString()}</span></div>` : ""}
    <div class="totals-row total"><span>Total</span><span>Rs. ${Number(data.total ?? 0).toLocaleString()}</span></div>
  </div>

  <div class="footer">
    <p>Thank you for shopping with KDF NUTS! 🥜</p>
    <p style="margin-top:6px;">Questions? Contact us on WhatsApp or email.</p>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export async function fetchAndPrintInvoice(orderId: string | number, token?: string) {
  try {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/orders?limit=100`, { headers });
    if (!res.ok) throw new Error("Failed to fetch orders");
    const data = await res.json();
    const orders: any[] = data.items ?? [];
    const order = orders.find((o: any) => String(o.id) === String(orderId));
    if (!order) { alert("Order not found. Please try again."); return; }
    printOrderInvoice({
      orderNumber: order.orderNumber,
      orderId: order.id,
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod,
      referenceNumber: order.referenceNumber ?? null,
      paymentStatus: order.paymentStatus,
      deliveryType: order.deliveryType,
      subtotal: order.subtotal,
      discount: order.discount,
      deliveryFee: order.deliveryFee,
      total: order.total,
      shippingAddress: order.shippingAddress,
      items: order.items ?? [],
    });
  } catch {
    alert("Could not load order details. Please try again.");
  }
}
