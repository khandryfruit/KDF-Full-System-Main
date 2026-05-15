import type { CartRow, Customer } from "./types";
import { fmtRs } from "./calc";
import type { PrintBillMeta } from "./printBill";

export type ReceiptContext = {
  rows: CartRow[];
  subtotal: number;
  grand: number;
  customer: Customer | null;
  payMethod: string;
  amtReceived: number;
  billNo: string;
  orderRemarks: string;
  meta: PrintBillMeta;
};

function lineDiscLabel(r: CartRow): string {
  if (r.discount <= 0) return "";
  if (r.discountMode === "fixed") return `<br><small>−${fmtRs(r.discount)} disc</small>`;
  return `<br><small>−${r.discount}% disc</small>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReceiptHtml(ctx: ReceiptContext): string {
  const { rows, subtotal, grand, customer, payMethod, amtReceived, billNo, orderRemarks, meta } = ctx;
  const change = Math.max(0, amtReceived - grand);
  const discLines: string[] = [];
  if (meta.discAmt > 0) {
    if (meta.billDiscFixedRs > 0) {
      discLines.push(`<div class="r">Bill disc: −${fmtRs(meta.discAmt)}</div>`);
    } else if (meta.billDiscPct > 0) {
      discLines.push(`<div class="r">Bill disc (${meta.billDiscPct}%): −${fmtRs(meta.discAmt)}</div>`);
    }
  }
  if (meta.packingRs > 0) discLines.push(`<div class="r">Packing: +${fmtRs(meta.packingRs)}</div>`);
  if (meta.shippingRs > 0) discLines.push(`<div class="r">Delivery: +${fmtRs(meta.shippingRs)}</div>`);
  const internalBlock = meta.internalNotes?.trim()
    ? `<div class="sep"></div><div><b>Internal</b> ${escapeHtml(meta.internalNotes.trim())}</div>`
    : "";
  const remarksBlock = orderRemarks?.trim()
    ? `<div class="sep"></div><div>Remarks: ${escapeHtml(orderRemarks.trim())}</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(billNo)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Courier New',monospace;font-size:12px;width:302px;padding:8px;}
    .c{text-align:center;}.r{text-align:right;}.b{font-weight:bold;}
    .sep{border-top:1px dashed #000;margin:4px 0;}
    table{width:100%;border-collapse:collapse;}td{vertical-align:top;padding:1px 2px;}
    @media print{body{width:72mm;}}
  </style></head><body>
  <div class="c b" style="font-size:16px">KDF NUTS</div>
  <div class="c" style="font-size:10px">Khan Baba Dry Fruits</div>
  <div class="sep"></div>
  <div>Bill#: <b>${escapeHtml(billNo)}</b></div>
  <div>Date: ${new Date().toLocaleString("en-PK")}</div>
  ${customer ? `<div>Customer: ${escapeHtml(customer.name)}${customer.phone ? " / " + escapeHtml(customer.phone) : ""}</div>` : ""}
  <div>Payment: ${escapeHtml(payMethod)}</div>
  <div class="sep"></div>
  <table>
    <tr class="b"><td>#</td><td>Item</td><td class="r">Qty</td><td class="r">Rate</td><td class="r">Total</td></tr>
    <tr><td colspan="5" class="sep"></td></tr>
    ${rows
      .map(
        (r, i) => `<tr>
      <td>${i + 1}</td><td>${escapeHtml(r.name)}${lineDiscLabel(r)}</td>
      <td class="r">${r.qty}${escapeHtml(r.unit)}</td>
      <td class="r">${fmtRs(r.pricePerUnit)}</td>
      <td class="r">${fmtRs(r.total)}</td>
    </tr>`,
      )
      .join("")}
  </table>
  <div class="sep"></div>
  <div class="r">Subtotal: ${fmtRs(subtotal)}</div>
  ${discLines.join("")}
  <div class="r b" style="font-size:14px">TOTAL: ${fmtRs(grand)}</div>
  <div class="sep"></div>
  <div>Received: ${fmtRs(amtReceived)}</div>
  <div class="b">Change: ${fmtRs(change)}</div>
  ${remarksBlock}
  ${internalBlock}
  <div class="sep"></div>
  <div class="c" style="font-size:10px">Thank you! Visit Again</div>
  <div class="c" style="font-size:10px">khanbabadryfruits.com</div>
  </body></html>`;
}

export function printReceipt(ctx: ReceiptContext, copies = 1): void {
  const html = buildReceiptHtml(ctx);
  for (let c = 0; c < Math.max(1, copies); c++) {
    const w = window.open("", "_blank", "width=340,height=700");
    if (!w) continue;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 300 + c * 400);
  }
}

export function downloadReceiptHtml(ctx: ReceiptContext): void {
  const html = buildReceiptHtml(ctx);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${ctx.billNo.replace(/[^\w-]+/g, "_")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveReceiptAsPdf(ctx: ReceiptContext): void {
  const w = window.open("", "_blank", "width=340,height=700");
  if (!w) return;
  w.document.write(buildReceiptHtml(ctx));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

export function receiptPlainText(ctx: ReceiptContext): string {
  const lines = [
    "KDF NUTS — Khan Baba Dry Fruits",
    `Bill# ${ctx.billNo}`,
    new Date().toLocaleString("en-PK"),
    ctx.customer ? `Customer: ${ctx.customer.name}${ctx.customer.phone ? ` / ${ctx.customer.phone}` : ""}` : "",
    `Payment: ${ctx.payMethod}`,
    "",
    ...ctx.rows.map(
      (r, i) =>
        `${i + 1}. ${r.name}  ${r.qty}${r.unit} x ${fmtRs(r.pricePerUnit)} = ${fmtRs(r.total)}`,
    ),
    "",
    `Subtotal: ${fmtRs(ctx.subtotal)}`,
    `TOTAL: ${fmtRs(ctx.grand)}`,
    `Received: ${fmtRs(ctx.amtReceived)}`,
    `Change: ${fmtRs(Math.max(0, ctx.amtReceived - ctx.grand))}`,
    "",
    "Thank you!",
  ];
  return lines.filter(Boolean).join("\n");
}

export function shareReceiptWhatsApp(ctx: ReceiptContext, phoneE164?: string): void {
  const text = encodeURIComponent(receiptPlainText(ctx));
  const digits = phoneE164?.replace(/\D/g, "") ?? ctx.customer?.phone?.replace(/\D/g, "") ?? "";
  const path = digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(path, "_blank", "noopener,noreferrer");
}

export function shareReceiptEmail(ctx: ReceiptContext): void {
  const subject = encodeURIComponent(`Receipt ${ctx.billNo} — KDF Nuts`);
  const body = encodeURIComponent(receiptPlainText(ctx));
  const to = ctx.customer?.email ? encodeURIComponent(ctx.customer.email) : "";
  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
}

export function buildThermalEscPos(ctx: ReceiptContext): Uint8Array {
  const ESC = 0x1b;
  const GS = 0x1d;
  const chunks: number[] = [ESC, 0x40];
  const pushText = (s: string) => {
    for (const ch of s) chunks.push(ch.charCodeAt(0) & 0xff);
    chunks.push(0x0a);
  };
  pushText("KDF NUTS");
  pushText(`Bill ${ctx.billNo}`);
  pushText(new Date().toLocaleString("en-PK"));
  for (const r of ctx.rows) {
    pushText(r.name.substring(0, 22));
    pushText(` ${r.qty}${r.unit} x${fmtRs(r.pricePerUnit)} =${fmtRs(r.total)}`);
  }
  pushText(`TOTAL ${fmtRs(ctx.grand)}`);
  pushText(`Paid ${ctx.payMethod}`);
  chunks.push(GS, 0x56, 0x00);
  return new Uint8Array(chunks);
}

export async function printThermalEscPos(ctx: ReceiptContext): Promise<string> {
  const data = buildThermalEscPos(ctx);
  const serial = (navigator as Navigator & { serial?: { requestPort: () => Promise<unknown> } }).serial;
  if (serial?.requestPort) {
    try {
      const port = (await serial.requestPort()) as {
        open: (o: { baudRate: number }) => Promise<void>;
        writable: { getWriter: () => { write: (b: Uint8Array) => Promise<void>; releaseLock: () => void } };
        close: () => Promise<void>;
      };
      await port.open({ baudRate: 9600 });
      const writer = port.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
      await port.close();
      return "Sent to thermal printer.";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Serial print cancelled";
      throw new Error(msg);
    }
  }
  const hex = Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  await navigator.clipboard.writeText(hex);
  return "Web Serial unavailable. ESC/POS hex copied to clipboard — paste into your printer app.";
}
