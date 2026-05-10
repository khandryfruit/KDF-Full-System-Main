export interface CourierServiceType {
  code: string;
  label: string;
}

export interface CourierConfig {
  name: string;
  icon: string;
  color: string;
  trackingLabel: string;
  cnLabel: string | null;
  serviceTypes: CourierServiceType[];
  fields: {
    weight: boolean;
    pieces: boolean;
    fragile: boolean;
    declaredValue: boolean;
    contentDesc: boolean;
    specialInstructions: boolean;
    postexOrderType: boolean;
    invoiceAmount: boolean;
  };
  codLabel: string;
  note: string;
}

export const COURIER_CONFIGS: Record<string, CourierConfig> = {
  tcs: {
    name: "TCS Express",
    icon: "🟢",
    color: "bg-green-50 border-green-200",
    trackingLabel: "Tracking Number",
    cnLabel: null,
    serviceTypes: [
      { code: "O",  label: "Overnight Express" },
      { code: "S",  label: "Same Day" },
      { code: "E",  label: "Economy" },
      { code: "2D", label: "2-Day" },
      { code: "3D", label: "3-Day" },
    ],
    fields: {
      weight: true, pieces: true, fragile: true,
      declaredValue: true, contentDesc: true,
      specialInstructions: false, postexOrderType: false, invoiceAmount: false,
    },
    codLabel: "COD Amount (₨)",
    note: "TCS uses Bearer Token or Username+Password. Consignment number returned on booking.",
  },
  leopards: {
    name: "Leopards Courier",
    icon: "🟡",
    color: "bg-yellow-50 border-yellow-200",
    trackingLabel: "CN Number",
    cnLabel: "CN",
    serviceTypes: [
      { code: "overnight", label: "Overnight (24h)" },
      { code: "same_day",  label: "Same Day (6-12h)" },
      { code: "economy",   label: "Economy (2-3 days)" },
    ],
    fields: {
      weight: true, pieces: true, fragile: false,
      declaredValue: false, contentDesc: false,
      specialInstructions: true, postexOrderType: false, invoiceAmount: false,
    },
    codLabel: "Collect Amount (₨)",
    note: "Leopards uses API Key + API Password. CN number assigned on booking.",
  },
  postex: {
    name: "PostEx",
    icon: "🔵",
    color: "bg-blue-50 border-blue-200",
    trackingLabel: "Tracking Number",
    cnLabel: null,
    serviceTypes: [
      { code: "Normal",      label: "Normal (Overnight)" },
      { code: "Reversed",    label: "Reversed (Return)" },
      { code: "Replacement", label: "Replacement" },
    ],
    fields: {
      weight: false, pieces: true, fragile: false,
      declaredValue: false, contentDesc: true,
      specialInstructions: false, postexOrderType: true, invoiceAmount: true,
    },
    codLabel: "Invoice Payment (₨)",
    note: "PostEx uses a single API Token. Order type controls the delivery flow.",
  },
  trax: {
    name: "Trax Logistics",
    icon: "🟠",
    color: "bg-orange-50 border-orange-200",
    trackingLabel: "Tracking Number",
    cnLabel: null,
    serviceTypes: [
      { code: "same_day",  label: "Same Day" },
      { code: "overnight", label: "Overnight" },
      { code: "overland",  label: "Overland" },
    ],
    fields: {
      weight: true, pieces: false, fragile: false,
      declaredValue: false, contentDesc: false,
      specialInstructions: false, postexOrderType: false, invoiceAmount: false,
    },
    codLabel: "COD Amount (₨)",
    note: "Trax uses Bearer Token authentication.",
  },
};

export const COURIER_ACCENT: Record<string, string> = {
  tcs: "#1a5c3a", leopards: "#c8a000", postex: "#1a4b8c", trax: "#b84500",
};

export const COURIER_ICONS: Record<string, string> = {
  tcs: "🟢", leopards: "🟡", postex: "🔵", trax: "🟠",
};

/* ── PostEx official label (matches PostEx portal label format) ── */
function buildPostExLabelHtml(d: Record<string, unknown>): string {
  const codAmount = Number(d.codAmount ?? 0);
  const svcLabel = COURIER_CONFIGS.postex.serviceTypes.find(s => s.code === String(d.serviceCode ?? ""))?.label
    ?? String(d.serviceCode ?? "Normal");
  const svcShort = String(d.serviceCode ?? "Normal");
  const createdAt = d.createdAt
    ? new Date(d.createdAt as string).toLocaleDateString("en-PK", { day: "2-digit", month: "2-digit", year: "numeric" })
    : new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "2-digit", year: "numeric" });
  const pieces = Number(d.pieces ?? 1);
  const weight = d.weight ? `${d.weight} KG` : "0.5 KG";
  const fragile = d.fragile ? "true" : "false";
  const tracking = String(d.trackingId ?? "");
  const remarks = String(d.remarks ?? d.transactionNotes ?? "call before delivery");
  const productsList = String(d.contentDesc ?? "");
  const items: any[] = Array.isArray(d.items) ? d.items : [];
  const productsText = productsList
    || (items.length > 0 ? "[ " + items.map((i: any) => `${i.qty ?? 1} x ${i.name}`).join(", ") + " ]" : "");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PostEx Label – ${tracking}</title><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background:#fff; font-size:11px; }
  .page { width:21cm; padding:8mm; }
  .label-wrap { border:1.5px solid #000; page-break-after:always; }
  /* 3-column header row */
  .cols { display:grid; grid-template-columns:1fr 1fr 1fr; border-bottom:1.5px solid #000; }
  .col { padding:3mm 4mm; }
  .col + .col { border-left:1.5px solid #000; }
  .col-header { font-weight:700; font-size:11px; text-align:center; background:#f0f0f0;
                padding:1.5mm 0; border-bottom:1px solid #000; margin:-3mm -4mm 3mm; }
  .field { margin-bottom:1.5mm; font-size:10.5px; }
  .field b { font-weight:700; }
  .destination { font-size:17px; font-weight:900; text-transform:uppercase; margin:2mm 0 1mm; }
  .order-num { font-size:11px; margin-bottom:2mm; }
  /* brand col */
  .amount-box { text-align:center; margin:3mm 0 2mm; }
  .amount-label { font-size:11px; font-weight:700; }
  .amount-value { font-size:22px; font-weight:900; }
  /* parcel col */
  .postex-logo { font-size:24px; font-weight:900; letter-spacing:-0.5px; margin-bottom:1mm; }
  .postex-dot { color:#00a651; }
  .tracking-barcode { margin:1mm 0; overflow:hidden; height:28px;
    background:repeating-linear-gradient(90deg,#000 0px,#000 2px,#fff 2px,#fff 4px,#000 4px,#000 5px,#fff 5px,#fff 8px,#000 8px,#000 10px,#fff 10px,#fff 13px);
    border-radius:1px; }
  .tracking-num { font-family:'Courier New',monospace; font-size:12px; font-weight:700;
                  letter-spacing:1.5px; text-align:center; margin:1mm 0 2mm; }
  .info-grid { width:100%; border-collapse:collapse; font-size:10px; margin-top:1mm; }
  .info-grid td { padding:1mm 0; border-top:1px solid #ddd; }
  /* bottom rows */
  .bottom-row { border-top:1.5px solid #000; padding:2mm 4mm; font-size:10.5px; }
  .bottom-row + .bottom-row { border-top:1px solid #ccc; }
  /* order barcode */
  .order-barcode { height:16px;
    background:repeating-linear-gradient(90deg,#000 0px,#000 1px,#fff 1px,#fff 3px,#000 3px,#000 4px,#fff 4px,#fff 7px);
    margin:1mm 0; border-radius:1px; max-width:60mm; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body>
<div class="page">
<div class="label-wrap">
  <!-- 3-column header -->
  <div class="cols">
    <!-- LEFT: Customer Information -->
    <div class="col">
      <div class="col-header">Customer Information</div>
      <div class="field"><b>Name:</b> ${d.customerName}</div>
      <div class="field"><b>Phone:</b> ${d.customerPhone}</div>
      <div class="field"><b>Address:</b> ${d.address}</div>
      <div class="destination">${String(d.city ?? "").toUpperCase()}</div>
      <div class="order-num"><b>Order:</b> ${d.orderNumber}</div>
      <div class="order-barcode"></div>
    </div>
    <!-- MIDDLE: Brand Information -->
    <div class="col">
      <div class="col-header">Brand Information</div>
      <div class="field"><b>Shipper:</b> ${d.shipperName}&nbsp;&nbsp;${d.shipperPhone}</div>
      <div class="field"><b>Shipper Address:</b> ${d.shipperAddress}${d.shipperCity ? " " + d.shipperCity : ""}</div>
      <div class="amount-box">
        <div class="amount-label">Amount: Rs ${codAmount > 0 ? codAmount.toLocaleString() : "0"}</div>
        ${codAmount > 0
          ? `<div style="height:14px;background:repeating-linear-gradient(90deg,#000 0,#000 2px,#fff 2px,#fff 5px,#000 5px,#000 6px,#fff 6px,#fff 10px);margin:2mm auto;max-width:50mm;border-radius:1px"></div>`
          : `<div style="font-size:10px;color:#777;margin-top:2mm">Prepaid / No COD</div>`}
      </div>
    </div>
    <!-- RIGHT: Parcel Information -->
    <div class="col">
      <div class="col-header">Parcel Information</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="postex-logo">PostEx<span class="postex-dot">.</span></div>
      </div>
      <div class="tracking-barcode"></div>
      <div class="tracking-num">${tracking}</div>
      <table class="info-grid">
        <tr>
          <td><b>Service:</b> ${svcShort}</td>
          <td><b>Fragile:</b> ${fragile}</td>
        </tr>
        <tr>
          <td><b>Date:</b> ${createdAt}</td>
          <td><b>Weight:</b> ${weight}</td>
        </tr>
        <tr>
          <td><b>Pieces:</b> ${pieces}</td>
          <td><b>Qty:</b> ${pieces}</td>
        </tr>
      </table>
    </div>
  </div>
  <!-- Remarks row -->
  <div class="bottom-row"><b>Remarks:</b> ${remarks}</div>
  <!-- Products row -->
  ${productsText ? `<div class="bottom-row"><b>Products:</b> ${productsText}</div>` : ""}
</div>
</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
}

export function buildLabelHtml(d: Record<string, unknown>): string {
  const slug = (String(d.courierSlug ?? "tcs")).toLowerCase();

  /* PostEx uses its own official label format */
  if (slug === "postex") return buildPostExLabelHtml(d);

  const conf = COURIER_CONFIGS[slug] ?? COURIER_CONFIGS.tcs;
  const trackingLabel = conf.cnLabel ? conf.cnLabel + " NUMBER" : "TRACKING NUMBER";
  const svcLabel = conf.serviceTypes.find(s => s.code === String(d.serviceCode ?? ""))?.label ?? String(d.serviceCode ?? "");
  const accent = COURIER_ACCENT[slug] ?? "#1a1a1a";

  const codAmount = Number(d.codAmount ?? 0);
  const codRow = codAmount > 0
    ? `<div class="cod-box" style="background:${accent}"><div class="cod-label">CASH ON DELIVERY</div><div class="cod-amount">Rs. ${codAmount.toLocaleString()}</div></div>`
    : `<div style="padding:2mm 0;font-size:11px;color:#555">Prepaid · No COD</div>`;

  const extraRow = d.specialInstructions
    ? `<div class="section"><div class="label-title">Special Instructions</div><div class="label-sub">${d.specialInstructions}</div></div>`
    : "";

  const createdAt = d.createdAt ? new Date(d.createdAt as string).toLocaleDateString("en-PK") : "";
  const piecesLine = d.pieces ? ` · ${d.pieces} PCS` : "";
  const weightLine = d.weight ? ` · ${d.weight}KG` : "";

  return `<!DOCTYPE html>
<html><head><title>Shipment Label</title><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .label { width: 10cm; min-height: 15cm; border: 2px solid ${accent}; padding: 6mm; page-break-after: always; }
  .header { background: ${accent}; color: #fff; padding: 3mm 4mm; margin: -6mm -6mm 4mm; display: flex; justify-content: space-between; align-items: center; }
  .courier-name { font-size: 18px; font-weight: 900; letter-spacing: 2px; }
  .header-meta { font-size: 8px; text-align: right; opacity: .85; }
  .barcode-area { text-align: center; padding: 4mm 0; border-bottom: 2px dashed ${accent}; margin-bottom: 3mm; }
  .tracking-label { font-size: 8px; text-transform: uppercase; letter-spacing: 2px; color: #777; margin-bottom: 1mm; }
  .tracking-num { font-family: 'Courier New', monospace; font-size: 20px; font-weight: 900; letter-spacing: 4px; color: ${accent}; }
  .section { margin-bottom: 3mm; padding-bottom: 3mm; border-bottom: 1px solid #ddd; }
  .section:last-child { border-bottom: none; }
  .label-title { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; color: #777; margin-bottom: 1mm; }
  .label-value { font-size: 12px; font-weight: 700; color: #111; }
  .label-sub { font-size: 10px; color: #444; margin-top: 0.5mm; }
  .city { font-size: 15px; font-weight: 900; color: ${accent}; margin-top: 1mm; }
  .cod-box { color: #fff; padding: 3mm 5mm; border-radius: 4px; display: inline-block; margin-top: 2mm; }
  .cod-label { font-size: 8px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 1mm; }
  .cod-amount { font-size: 22px; font-weight: 900; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .footer { margin-top: 3mm; font-size: 8px; color: #888; text-align: center; border-top: 1px dashed #ccc; padding-top: 2mm; }
  .barcode-bars { font-size: 26px; letter-spacing: 4px; color: #111; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head>
<body>
<div class="label">
  <div class="header">
    <div class="courier-name">${String(d.courierName ?? slug).toUpperCase()}</div>
    <div class="header-meta"><div>${createdAt}</div><div>${svcLabel}${piecesLine}${weightLine}</div></div>
  </div>
  <div class="barcode-area">
    <div class="barcode-bars">|||||||||||||||||||||</div>
    <div class="tracking-label">${trackingLabel}</div>
    <div class="tracking-num">${d.trackingId}</div>
  </div>
  <div class="section">
    <div class="label-title">Ship To (Consignee)</div>
    <div class="label-value">${d.customerName}</div>
    <div class="label-sub">${d.customerPhone}</div>
    <div class="label-sub">${d.address}</div>
    <div class="city">${String(d.city ?? "").toUpperCase()}</div>
  </div>
  <div class="section">
    <div class="label-title">Ship From (Shipper)</div>
    <div class="label-value">${d.shipperName}</div>
    <div class="label-sub">${d.shipperAddress}</div>
    <div class="label-sub">${d.shipperCity} · ${d.shipperPhone}</div>
    ${d.tcsAccount ? `<div class="label-sub" style="color:${accent};font-weight:700">Acct: ${d.tcsAccount}</div>` : ""}
  </div>
  <div class="section grid2">
    <div><div class="label-title">Order Ref</div><div class="label-value">${d.orderNumber}</div></div>
    <div><div class="label-title">Content</div><div class="label-value" style="font-size:10px">${d.contentDesc ?? "—"}</div></div>
  </div>
  ${codRow}
  ${d.remarks ? `<div class="section"><div class="label-title">Remarks</div><div class="label-sub">${d.remarks}</div></div>` : ""}
  ${extraRow}
  <div class="footer">KDF NUTS · ${new Date().toLocaleString("en-PK")} · ${String(d.status ?? "").toUpperCase()}</div>
</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
}

export async function printShipmentLabel(shipmentId: number): Promise<void> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(`/api/admin/shipments/${shipmentId}/print-label`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    /* fallback: JSON label data → HTML */
    const res2 = await fetch(`/api/admin/shipments/${shipmentId}/label`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res2.ok) { alert("Could not load label data"); return; }
    const d = await res2.json() as Record<string, unknown>;
    const html = buildLabelHtml(d);
    const w = window.open("", "_blank", "width=900,height=650");
    if (w) { w.document.write(html); w.document.close(); }
    return;
  }
  const html = await res.text();
  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

/**
 * openThermalLabel — opens thermal-optimised label (100mm × 152mm).
 * Perfect for Zebra, Brother, and other thermal label printers.
 */
export async function openThermalLabel(shipmentId: number): Promise<void> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(`/api/admin/shipments/${shipmentId}/print-label?format=thermal`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { alert("Could not load thermal label"); return; }
  const html = await res.text();
  const w = window.open("", "_blank", "width=500,height=720");
  if (w) { w.document.write(html); w.document.close(); }
}

/**
 * downloadTcsLabel — download TCS label as PDF (via official ECOM API)
 * or as an HTML file if the API is unavailable.
 * Returns { success, fallback } — fallback=true means HTML was downloaded instead.
 */
export async function downloadTcsLabel(
  cn: string,
  shipmentId?: number,
): Promise<{ success: boolean; fallback?: boolean }> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";

  /* Step 1 — try official ECOM label API */
  if (cn) {
    try {
      const res = await fetch(`/api/admin/couriers/tcs/label/${encodeURIComponent(cn)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("pdf")) {
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement("a");
          a.href = url; a.download = `tcs-label-${cn}.pdf`; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
          return { success: true };
        }
        /* API returned JSON fallback — skip to HTML fallback */
      }
    } catch { /* fall through */ }
  }

  /* Step 2 — fall back to HTML label download */
  if (shipmentId) {
    try {
      const res = await fetch(`/api/admin/shipments/${shipmentId}/print-label`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const html = await res.text();
        const blob = new Blob([html], { type: "text/html" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `tcs-label-${cn || shipmentId}.html`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        return { success: true, fallback: true };
      }
    } catch { /* ignore */ }
  }

  return { success: false };
}

/**
 * openTcsOfficialLabel — opens the TCS official ECOM label in a new tab.
 * Tries the ECOM /print/label API first (returns PDF), falls back to HTML.
 * format: "standard" | "thermal" | "a4"
 */
export async function openTcsOfficialLabel(
  cn: string,
  shipmentId?: number,
  format: "standard" | "thermal" | "a4" = "standard",
): Promise<void> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";

  /* Step 1 — try ECOM PDF */
  if (cn) {
    try {
      const res = await fetch(`/api/admin/couriers/tcs/label/${encodeURIComponent(cn)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("pdf")) {
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const w    = window.open(url, "_blank");
          if (w) setTimeout(() => URL.revokeObjectURL(url), 120000);
          return;
        }
      }
    } catch { /* fall through */ }
  }

  /* Step 2 — fall back to HTML label */
  if (shipmentId) {
    const fmtParam = format !== "standard" ? `?format=${format}` : "";
    const res = await fetch(`/api/admin/shipments/${shipmentId}/print-label${fmtParam}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const html = await res.text();
      const w = window.open("", "_blank", format === "thermal" ? "width=500,height=720" : "width=900,height=700");
      if (w) { w.document.write(html); w.document.close(); }
    }
  }
}
