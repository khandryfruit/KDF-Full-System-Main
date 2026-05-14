import type { CartRow, Customer } from "./types";
import { fmtRs } from "./calc";

export type PrintBillMeta = {
  billDiscPct: number;
  billDiscFixedRs: number;
  discAmt: number;
  packingRs: number;
  shippingRs: number;
  internalNotes?: string;
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

export function printBill(
  rows: CartRow[],
  subtotal: number,
  grand: number,
  customer: Customer | null,
  payMethod: string,
  amtReceived: number,
  billNo: string,
  orderRemarks: string,
  meta: PrintBillMeta,
) {
  const change = Math.max(0, amtReceived - grand);
  const w = window.open("", "_blank", "width=340,height=700");
  if (!w) return;
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
  const internalBlock =
    meta.internalNotes?.trim()
      ? `<div class="sep"></div><div><b>Internal</b> ${escapeHtml(meta.internalNotes.trim())}</div>`
      : "";
  const remarksBlock = orderRemarks?.trim()
    ? `<div class="sep"></div><div>Remarks: ${escapeHtml(orderRemarks.trim())}</div>`
    : "";
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Courier New',monospace;font-size:12px;width:302px;}
    .c{text-align:center;}.r{text-align:right;}.b{font-weight:bold;}
    .sep{border-top:1px dashed #000;margin:4px 0;}
    table{width:100%;border-collapse:collapse;}td{vertical-align:top;padding:1px 2px;}
    .nb{border:none;}
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
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 300);
}
