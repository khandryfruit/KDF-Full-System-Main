import type { CartRow, Customer } from "./types";
import { printReceipt, type ReceiptContext } from "./invoiceActions";

export type PrintBillMeta = {
  billDiscPct: number;
  billDiscFixedRs: number;
  discAmt: number;
  packingRs: number;
  shippingRs: number;
  internalNotes?: string;
};

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
  const ctx: ReceiptContext = {
    rows,
    subtotal,
    grand,
    customer,
    payMethod,
    amtReceived,
    billNo,
    orderRemarks,
    meta,
  };
  printReceipt(ctx);
}
