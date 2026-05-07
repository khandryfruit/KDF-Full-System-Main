import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

/* ── Brand logo — read at startup, cache as base64 data URL ──
   Try multiple candidate paths since CWD varies between dev (package dir)
   and production (workspace root). */
function loadLogoDataUrl(): string {
  const __dir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(__dir, "../public/khan-logo.png"),            // compiled dist/routes/ → dist/public/
    path.resolve(__dir, "../../public/khan-logo.png"),          // src/routes/ → src/../public/ (tsx dev)
    path.resolve(process.cwd(), "public/khan-logo.png"),        // CWD = artifacts/api-server/
    path.resolve(process.cwd(), "artifacts/api-server/public/khan-logo.png"), // CWD = workspace root
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
    }
  }
  return "";
}
const LOGO_DATA_URL = loadLogoDataUrl();

/* ── Dynamic domain detection (same logic as social.ts getPublicDomain) ── */
function getSiteDomain(req: Request): string {
  /* 1. Explicit env override */
  const override = (process.env.META_DOMAIN_OVERRIDE ?? "").trim();
  if (override) return override.startsWith("http") ? override : `https://${override}`;

  /* 2. X-Forwarded-Host — custom domain (skip replit.* domains) */
  const fwdHost = ((req.headers["x-forwarded-host"] as string) ?? "").split(",")[0].trim();
  const fwdProto = ((req.headers["x-forwarded-proto"] as string) ?? "https").split(",")[0].trim();
  if (fwdHost && !fwdHost.includes("replit.dev") && !fwdHost.includes("replit.app")) {
    return `${fwdProto}://${fwdHost}`;
  }

  /* 3. Replit production domains */
  const prodPrimary = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  if (prodPrimary) return `https://${prodPrimary}`;

  /* 4. Replit dev tunnel fallback */
  const devDomain = (process.env.REPLIT_DEV_DOMAIN ?? "").trim();
  if (devDomain) return `https://${devDomain}`;

  return "https://khanbabadryfruits.com";
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC INVOICE — no token required
   GET /invoice/:orderNumber
   
   Clean production URL: https://khanbabadryfruits.com/invoice/20039
   ════════════════════════════════════════════════════════════════ */
router.get("/:orderNumber", async (req: Request, res: Response): Promise<void> => {
  const orderNumber = req.params["orderNumber"] as string;
  if (!orderNumber || !/^\d{4,10}$/.test(orderNumber.replace(/^#/, ""))) {
    res.status(404).send(renderError("Invoice not found"));
    return;
  }
  const num = orderNumber.replace(/^#/, "");

  try {
    /* ── Lookup by shopify_order_number ── */
    const delRows = await db.execute(sql`
      SELECT rd.*, so.total_price, so.financial_status, so.line_items AS so_line_items,
             so.order_number AS so_order_number
      FROM   rider_deliveries rd
      LEFT JOIN shopify_orders so ON so.id = rd.shopify_order_db_id
      WHERE  rd.shopify_order_number = ${num}
         OR  rd.shopify_order_number = ${'#' + num}
      ORDER  BY rd.created_at DESC
      LIMIT  1
    `);

    /* Fallback: search shopify_orders directly */
    let d: any;
    if (delRows.rows.length) {
      d = delRows.rows[0] as any;
    } else {
      const soRows = await db.execute(sql`
        SELECT * FROM shopify_orders
        WHERE  order_number::text = ${num}
            OR order_number::text = ${'#' + num}
        ORDER  BY created_at DESC LIMIT 1
      `);
      if (!soRows.rows.length) {
        res.status(404).send(renderError(`Invoice #${num} not found`));
        return;
      }
      d = soRows.rows[0] as any;
    }

    /* ── Parse fields ── */
    const addr = (() => {
      try {
        const src = d.shipping_address;
        const a = typeof src === "string" ? JSON.parse(src) : src;
        if (!a) return d.delivery_address ?? "";
        return [a.address1, a.address2, a.city, a.province, a.country]
          .filter(Boolean).join(", ");
      } catch { return d.delivery_address ?? ""; }
    })();

    const items: any[] = (() => {
      try {
        const src = d.so_line_items ?? d.order_items ?? d.line_items;
        const arr = typeof src === "string" ? JSON.parse(src) : src;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })();

    const cod      = Number(d.cod_amount ?? d.total_price ?? 0);
    const dc       = Number(d.delivery_charge ?? 0);
    const isPaid   = Boolean(d.is_paid) || d.financial_status === "paid";
    const orderNum = String(d.shopify_order_number ?? d.so_order_number ?? d.order_number ?? num).replace(/^#+/, "");
    const custName = d.customer_name ?? "Customer";
    const custPhone = d.customer_phone ?? "";
    const riderName = d.rider_name ?? "";
    const status    = d.status ?? "processing";

    const orderDate = new Date(d.created_at ?? d.assigned_at ?? Date.now())
      .toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
    const invoiceDate = new Date().toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });

    /* ── Dynamic domain detection for share links ── */
    const domain = getSiteDomain(req);
    const invoiceUrl = `${domain}/invoice/${num}`;

    /* ── WhatsApp share ── */
    const ph = custPhone.replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const waMsg = encodeURIComponent(
      `السلام علیکم ${custName}!\n\nآپ کا KDF NUTS آرڈر #${orderNum} کا invoice:\n${invoiceUrl}\n\nکوئی سوال ہو تو بتائیں۔ شکریہ! 🌟`
    );
    const waLink = intl ? `https://wa.me/${intl}?text=${waMsg}` : "";

    /* ── Render ── */
    const statusLabel: Record<string, { label: string; color: string; bg: string }> = {
      assigned:         { label: "Assigned",        color: "#1565C0", bg: "#E3F2FD" },
      picked:           { label: "Picked Up",        color: "#E65100", bg: "#FFF3E0" },
      out_for_delivery: { label: "Out for Delivery", color: "#6A1B9A", bg: "#F3E5F5" },
      delivered:        { label: "Delivered ✓",      color: "#2E7D32", bg: "#E8F5E9" },
      failed:           { label: "Failed",            color: "#B71C1C", bg: "#FFEBEE" },
      returned:         { label: "Returned",          color: "#E65100", bg: "#FFF3E0" },
    };
    const st = statusLabel[status] ?? { label: status, color: "#555", bg: "#F5F5F5" };

    const itemRows = items.length
      ? items.map((i: any) => `
        <tr>
          <td>${escHtml(i.title ?? i.name ?? "Item")}${i.variant_title ? `<small class="variant">${escHtml(i.variant_title)}</small>` : ""}</td>
          <td class="center">${i.quantity ?? 1}</td>
          <td class="right">Rs. ${Number(i.price ?? 0).toLocaleString()}</td>
          <td class="right fw-bold">Rs. ${(Number(i.price ?? 0) * (i.quantity ?? 1)).toLocaleString()}</td>
        </tr>`
      ).join("")
      : `<tr><td colspan="4" class="center muted">No item details available</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Invoice #${escHtml(String(orderNum))} · Khan Dry Fruits</title>
  <style>
    :root {
      --navy: #0D1F3C;
      --green: #00B85A;
      --green-dark: #007A3C;
      --green-light: #E8F5E9;
      --muted: #6B7A99;
      --border: #E2E8F0;
      --bg: #F8FAFC;
      --card: #FFFFFF;
      --text: #1A2B4A;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 15px; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; -webkit-font-smoothing: antialiased; }

    /* Layout */
    .page { max-width: 700px; margin: 0 auto; background: var(--card); min-height: 100vh; box-shadow: 0 0 40px rgba(0,0,0,.08); }

    /* ── Header ── */
    .header { background: var(--navy); color: #fff; padding: 28px 28px 24px; position: relative; overflow: hidden; }
    .header::before {
      content: ""; position: absolute; right: -40px; top: -40px;
      width: 200px; height: 200px; border-radius: 50%;
      background: rgba(0,184,90,.15);
    }
    .header::after {
      content: ""; position: absolute; right: 40px; bottom: -60px;
      width: 150px; height: 150px; border-radius: 50%;
      background: rgba(0,184,90,.08);
    }
    .header-inner { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-logo {
      width: 68px; height: 68px; border-radius: 16px;
      object-fit: contain; flex-shrink: 0;
      background: #fff;
      box-shadow: 0 4px 16px rgba(0,184,90,.35);
      padding: 4px;
    }
    .brand-name { font-size: 18px; font-weight: 800; letter-spacing: .3px; }
    .brand-sub  { color: rgba(255,255,255,.5); font-size: 12px; margin-top: 2px; }
    .invoice-meta { text-align: right; }
    .invoice-label { color: rgba(255,255,255,.5); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-num { font-size: 26px; font-weight: 900; letter-spacing: -1px; color: var(--green); }
    .invoice-date { color: rgba(255,255,255,.5); font-size: 12px; margin-top: 3px; }

    /* Status strip */
    .status-strip {
      background: rgba(255,255,255,.07); border-top: 1px solid rgba(255,255,255,.1);
      padding: 14px 28px;
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
    }
    .status-badge {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 6px 14px; border-radius: 30px; font-size: 13px; font-weight: 700;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .8; }
    .order-date-strip { color: rgba(255,255,255,.45); font-size: 12px; }

    /* Body */
    .body { padding: 24px 28px; }

    /* ── Payment Hero ── */
    .payment-card {
      border-radius: 18px; padding: 22px; margin-bottom: 22px;
      display: flex; align-items: center; gap: 18;
      border-width: 2px; border-style: solid;
    }
    .payment-card.cod  { background: #FFFBEB; border-color: #FCD34D; }
    .payment-card.paid { background: var(--green-light); border-color: #6EE7B7; }
    .payment-icon {
      width: 60px; height: 60px; border-radius: 16px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 28px;
    }
    .payment-card.cod  .payment-icon { background: #FEF3C7; }
    .payment-card.paid .payment-icon { background: #D1FAE5; }
    .payment-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
    .payment-card.cod  .payment-label { color: #92400E; }
    .payment-card.paid .payment-label { color: #065F46; }
    .payment-amount { font-size: 32px; font-weight: 900; }
    .payment-card.cod  .payment-amount { color: #D97706; }
    .payment-card.paid .payment-amount { color: #059669; }
    .payment-note { font-size: 12px; margin-top: 4px; }
    .payment-card.cod  .payment-note { color: #A16207; }
    .payment-card.paid .payment-note { color: #047857; }

    /* ── Info grid ── */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
    @media (max-width: 500px) { .info-grid { grid-template-columns: 1fr; } }
    .info-box { background: var(--bg); border-radius: 14px; padding: 14px 16px; border: 1px solid var(--border); }
    .info-box-label { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .7px; margin-bottom: 7px; display: flex; align-items: center; gap: 5px; }
    .info-box-value { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.6; }
    .info-box-value small { font-weight: 400; color: var(--muted); font-size: 12px; }

    /* ── Items table ── */
    .section-title { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .7px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .section-title::after { content: ""; flex: 1; height: 1px; background: var(--border); }
    .table-wrap { border-radius: 14px; overflow: hidden; border: 1px solid var(--border); margin-bottom: 22px; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: var(--navy); color: #fff; }
    thead th { padding: 12px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; text-align: left; }
    tbody tr { border-bottom: 1px solid var(--border); }
    tbody tr:last-child { border-bottom: 0; }
    tbody tr:nth-child(even) td { background: var(--bg); }
    td { padding: 13px 14px; font-size: 13px; vertical-align: top; }
    .variant { display: block; color: var(--muted); font-size: 11px; margin-top: 3px; font-weight: 400; }
    .center { text-align: center; }
    .right  { text-align: right; }
    .muted  { color: var(--muted); }
    .fw-bold { font-weight: 700; }

    /* Totals */
    .totals { background: var(--bg); border-radius: 14px; padding: 16px 18px; border: 1px solid var(--border); margin-bottom: 22px; }
    .total-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; font-size: 14px; color: var(--muted); }
    .total-row.grand { border-top: 2px solid var(--border); margin-top: 6px; padding-top: 12px; font-size: 18px; font-weight: 900; color: var(--text); }
    .total-row.grand .total-val { color: var(--green-dark); }

    /* Actions */
    .actions { display: flex; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
    .btn {
      flex: 1; min-width: 120px;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 13px 18px; border-radius: 12px; border: none; cursor: pointer;
      font-size: 14px; font-weight: 700; text-decoration: none; transition: opacity .15s;
    }
    .btn:active { opacity: .85; }
    .btn-green { background: var(--green); color: #fff; }
    .btn-navy  { background: var(--navy); color: #fff; }
    .btn-outline { background: transparent; border: 2px solid var(--border); color: var(--text); }
    @media print { .actions, .no-print { display: none !important; } }

    /* Footer */
    .footer { border-top: 1px solid var(--border); padding: 18px 28px; text-align: center; }
    .footer p { font-size: 12px; color: var(--muted); line-height: 1.8; }
    .footer strong { color: var(--text); }
    .footer a { color: var(--green); text-decoration: none; }

    /* Watermark for delivered */
    .delivered-stamp {
      position: fixed; bottom: 20px; right: 20px; pointer-events: none;
      opacity: .06; transform: rotate(-15deg); font-size: 64px; font-weight: 900;
      color: var(--green-dark); letter-spacing: -2px; z-index: 0;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ── -->
  <div class="header">
    <div class="header-inner">
      <div class="brand">
        <img class="brand-logo" src="${LOGO_DATA_URL}" alt="Khan Dry Fruit">
        <div>
          <div class="brand-name">Khan Dry Fruits</div>
          <div class="brand-sub">کھان ڈرائی فروٹس — Premium Quality Since 2010</div>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-label">Invoice</div>
        <div class="invoice-num">#${escHtml(String(orderNum))}</div>
        <div class="invoice-date">${escHtml(invoiceDate)}</div>
      </div>
    </div>

    <!-- Status strip -->
    <div class="status-strip">
      <div class="status-badge" style="background:${escHtml(st.bg)};color:${escHtml(st.color)}">
        <span class="status-dot"></span> ${escHtml(st.label)}
      </div>
      <div class="order-date-strip">Order Date: ${escHtml(orderDate)}</div>
    </div>
  </div>

  <!-- ── BODY ── -->
  <div class="body">

    <!-- Payment card -->
    <div class="payment-card ${isPaid ? "paid" : "cod"}">
      <div class="payment-icon">${isPaid ? "✅" : "💰"}</div>
      <div>
        <div class="payment-label">${isPaid ? "Payment Status" : "Cash on Delivery"}</div>
        <div class="payment-amount">${isPaid ? "✓ PAID" : `Rs. ${cod.toLocaleString()}`}</div>
        <div class="payment-note">${isPaid ? "Payment received — no cash needed" : "Please collect Rs. " + cod.toLocaleString() + " from customer"}</div>
      </div>
    </div>

    <!-- Info grid -->
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-label">👤 Customer</div>
        <div class="info-box-value">
          ${escHtml(custName)}<br>
          ${custPhone ? `<small>📞 ${escHtml(custPhone)}</small>` : ""}
        </div>
      </div>
      <div class="info-box">
        <div class="info-box-label">📍 Delivery Address</div>
        <div class="info-box-value">${escHtml(addr || "—")}</div>
      </div>
      <div class="info-box">
        <div class="info-box-label">📦 Order Number</div>
        <div class="info-box-value">#${escHtml(String(orderNum))}<br><small>Placed: ${escHtml(orderDate)}</small></div>
      </div>
      <div class="info-box">
        <div class="info-box-label">🏍️ Rider</div>
        <div class="info-box-value">${riderName ? escHtml(riderName) : "KDF NUTS Rider"}<br><small>KDF Rider Lahore</small></div>
      </div>
    </div>

    <!-- Items -->
    <div class="section-title">Order Items</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th class="center">Qty</th>
            <th class="right">Price</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>Rs. ${cod.toLocaleString()}</span></div>
      ${dc > 0 ? `<div class="total-row"><span>Delivery Charge</span><span>Rs. ${dc.toLocaleString()}</span></div>` : ""}
      <div class="total-row grand">
        <span>Grand Total</span>
        <span class="total-val">Rs. ${(cod + dc).toLocaleString()}</span>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="actions no-print">
      ${waLink ? `<a class="btn btn-green" href="${waLink}" target="_blank">💬 Share on WhatsApp</a>` : ""}
      <button class="btn btn-navy" onclick="window.print()">🖨️ Print Invoice</button>
      <button class="btn btn-outline" onclick="navigator.share ? navigator.share({ title: 'Invoice #${escHtml(String(orderNum))}', url: '${escHtml(invoiceUrl)}' }) : navigator.clipboard?.writeText('${escHtml(invoiceUrl)}')">🔗 Copy Link</button>
    </div>

  </div>

  <!-- Footer -->
  <div class="footer">
    <p>
      <strong>Khan Dry Fruits</strong> · Premium Quality Dry Fruits<br>
      Lahore, Pakistan · 📞 Contact via WhatsApp<br>
      <a href="https://khanbabadryfruits.com">khanbabadryfruits.com</a>
    </p>
    <p style="margin-top:10px;font-size:11px">
      Invoice #${escHtml(String(orderNum))} · Generated ${escHtml(invoiceDate)} · This is a computer-generated invoice.
    </p>
  </div>
</div>
${status === "delivered" ? `<div class="delivered-stamp">DELIVERED</div>` : ""}
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(html);
  } catch (err) {
    res.status(500).send(renderError("Failed to load invoice. Please try again."));
  }
});

/* ─── helpers ─── */
function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderError(msg: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice Not Found</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#F8FAFC;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:20px;padding:48px 40px;text-align:center;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{font-size:52px;margin-bottom:18px}.title{font-size:20px;font-weight:800;color:#0D1F3C;margin-bottom:10px}.sub{font-size:14px;color:#6B7A99;line-height:1.6}.back{display:inline-block;margin-top:24px;padding:12px 28px;background:#00B85A;color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px}</style>
</head><body><div class="card"><div class="icon">📋</div><div class="title">${escHtml(msg)}</div>
<div class="sub">Please verify the invoice number and try again.</div>
<a class="back" href="https://khanbabadryfruits.com">← Back to Store</a></div></body></html>`;
}

export default router;
