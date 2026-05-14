import type { CartRow, Customer } from "./types";
import { fmtRs } from "./calc";

export function printBill(
  rows: CartRow[],
  subtotal: number,
  discount: number,
  grand: number,
  customer: Customer | null,
  payMethod: string,
  amtReceived: number,
  billNo: string,
  remarks: string,
) {
  const change = Math.max(0, amtReceived - grand);
  const w = window.open("", "_blank", "width=340,height=700");
  if (!w) return;
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
  <div>Bill#: <b>${billNo}</b></div>
  <div>Date: ${new Date().toLocaleString("en-PK")}</div>
  ${customer ? `<div>Customer: ${customer.name}${customer.phone ? " / " + customer.phone : ""}</div>` : ""}
  <div>Payment: ${payMethod}</div>
  <div class="sep"></div>
  <table>
    <tr class="b"><td>#</td><td>Item</td><td class="r">Qty</td><td class="r">Rate</td><td class="r">Total</td></tr>
    <tr><td colspan="5" class="sep"></td></tr>
    ${rows
      .map(
        (r, i) => `<tr>
      <td>${i + 1}</td><td>${r.name}${r.discount > 0 ? `<br><small>-${r.discount}% disc</small>` : ""}</td>
      <td class="r">${r.qty}${r.unit}</td>
      <td class="r">${fmtRs(r.pricePerUnit)}</td>
      <td class="r">${fmtRs(r.total)}</td>
    </tr>`,
      )
      .join("")}
  </table>
  <div class="sep"></div>
  <div class="r">Subtotal: ${fmtRs(subtotal)}</div>
  ${discount > 0 ? `<div class="r">Bill Disc: -${discount}%</div>` : ""}
  <div class="r b" style="font-size:14px">TOTAL: ${fmtRs(grand)}</div>
  <div class="sep"></div>
  <div>Received: ${fmtRs(amtReceived)}</div>
  <div class="b">Change: ${fmtRs(change)}</div>
  ${remarks ? `<div class="sep"></div><div>Remarks: ${remarks}</div>` : ""}
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
