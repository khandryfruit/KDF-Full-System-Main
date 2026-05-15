import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { CartRow, LineDiscountMode, PosHoldV1 } from "./types";
import { fmtRs } from "./calc";
import {
  downloadReceiptHtml,
  printReceipt,
  printThermalEscPos,
  saveReceiptAsPdf,
  shareReceiptEmail,
  shareReceiptWhatsApp,
  type ReceiptContext,
} from "./invoiceActions";
import { formatWeightFromKg, pricePerKgFromRow, qtyKgFromRupees } from "./weightMoney";

export function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

export function QtyModal({
  row,
  onSave,
  onClose,
}: {
  row: CartRow;
  onSave: (qty: number) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(String(row.qty));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Change Quantity — {row.name}</h3>
        <div className="pos-modal-body">
          <label className="pos-label">Quantity ({row.unit})</label>
          <input
            ref={ref}
            type="number"
            min="0.001"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(parseFloat(qty) || row.qty);
              if (e.key === "Escape") onClose();
            }}
            className="pos-input w-full text-center text-2xl font-bold"
          />
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(parseFloat(qty) || row.qty)}>
            Save [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function ItemDiscModal({
  row,
  onSave,
  onClose,
}: {
  row: CartRow;
  onSave: (disc: number, mode: LineDiscountMode) => void;
  onClose: () => void;
}) {
  const mode = row.discountMode ?? "percent";
  const [tab, setTab] = useState<LineDiscountMode>(mode);
  const [disc, setDisc] = useState(String(mode === "fixed" ? row.discount : row.discount));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const m = row.discountMode ?? "percent";
    setTab(m);
    setDisc(String(row.discount));
    ref.current?.select();
  }, [row.rowId, row.discount, row.discountMode]);
  const raw = row.qty * row.pricePerUnit;
  const val = parseFloat(disc) || 0;
  const lineOff = tab === "fixed" ? Math.min(raw, Math.max(0, val)) : (raw * Math.max(0, val)) / 100;
  const after = Math.max(0, raw - lineOff);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Item discount — {row.name}</h3>
        <div className="pos-modal-body">
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-bold ${tab === "percent" ? "border-blue-600 bg-blue-600 text-white" : "border-border"}`}
              onClick={() => {
                setTab("percent");
                setDisc(String(row.discountMode === "fixed" ? 0 : row.discount));
              }}
            >
              %
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-bold ${tab === "fixed" ? "border-blue-600 bg-blue-600 text-white" : "border-border"}`}
              onClick={() => {
                setTab("fixed");
                setDisc(String(row.discountMode === "fixed" ? row.discount : 0));
              }}
            >
              Fixed Rs
            </button>
          </div>
          <label className="pos-label">{tab === "percent" ? "Discount %" : "Discount (Rs.)"}</label>
          <input
            ref={ref}
            type="number"
            min="0"
            max={tab === "percent" ? "100" : undefined}
            value={disc}
            onChange={(e) => setDisc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(parseFloat(disc) || 0, tab);
              if (e.key === "Escape") onClose();
            }}
            className="pos-input w-full text-center text-2xl font-bold"
          />
          {tab === "percent" && row.pricePerUnit > 0 && val > 0 && (
            <p className="mt-2 text-center text-sm font-semibold text-green-600">
              Effective rate: {fmtRs(row.pricePerUnit * (1 - val / 100))} / {row.unit}
            </p>
          )}
          {tab === "fixed" && val > 0 && (
            <p className="mt-2 text-center text-sm font-semibold text-green-600">Line after disc: {fmtRs(after)}</p>
          )}
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(parseFloat(disc) || 0, tab)}>
            Apply [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function BillDiscModal({
  billDiscPct,
  billDiscFixedRs,
  subtotal,
  onSave,
  onClose,
}: {
  billDiscPct: number;
  billDiscFixedRs: number;
  subtotal: number;
  onSave: (pct: number, fixedRs: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"percent" | "fixed">(billDiscFixedRs > 0 ? "fixed" : "percent");
  const [pct, setPct] = useState(String(billDiscPct));
  const [fx, setFx] = useState(String(billDiscFixedRs));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, [tab]);
  const p = parseFloat(pct) || 0;
  const f = parseFloat(fx) || 0;
  const discAmtPct = (subtotal * p) / 100;
  const discAmtFx = Math.min(subtotal, Math.max(0, f));
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Bill discount</h3>
        <div className="pos-modal-body space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-bold ${tab === "percent" ? "border-blue-600 bg-blue-600 text-white" : "border-border"}`}
              onClick={() => setTab("percent")}
            >
              %
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-bold ${tab === "fixed" ? "border-blue-600 bg-blue-600 text-white" : "border-border"}`}
              onClick={() => setTab("fixed")}
            >
              Fixed Rs
            </button>
          </div>
          {tab === "percent" ? (
            <div>
              <label className="pos-label">Discount %</label>
              <input
                ref={ref}
                type="number"
                min="0"
                max="100"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave(parseFloat(pct) || 0, 0);
                  if (e.key === "Escape") onClose();
                }}
                className="pos-input w-full text-center text-2xl font-bold"
              />
              {discAmtPct > 0 && <p className="text-center font-semibold text-green-600">Saving: {fmtRs(discAmtPct)}</p>}
            </div>
          ) : (
            <div>
              <label className="pos-label">Discount (Rs.)</label>
              <input
                ref={ref}
                type="number"
                min="0"
                value={fx}
                onChange={(e) => setFx(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave(0, parseFloat(fx) || 0);
                  if (e.key === "Escape") onClose();
                }}
                className="pos-input w-full text-center text-2xl font-bold"
              />
              {discAmtFx > 0 && <p className="text-center font-semibold text-green-600">Saving: {fmtRs(discAmtFx)}</p>}
            </div>
          )}
          <p className="text-muted text-center text-sm">
            After discount:{" "}
            {fmtRs(subtotal - (tab === "percent" ? discAmtPct : discAmtFx))}
          </p>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button
            type="button"
            className="pos-btn-primary"
            onClick={() => (tab === "percent" ? onSave(parseFloat(pct) || 0, 0) : onSave(0, parseFloat(fx) || 0))}
          >
            Apply [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function ChargesModal({
  packingCharge,
  shippingCharge,
  onSave,
  onClose,
}: {
  packingCharge: number;
  shippingCharge: number;
  onSave: (packing: number, shipping: number) => void;
  onClose: () => void;
}) {
  const [pack, setPack] = useState(String(packingCharge));
  const [ship, setShip] = useState(String(shippingCharge));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  const p = Math.max(0, parseFloat(pack) || 0);
  const s = Math.max(0, parseFloat(ship) || 0);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Packing &amp; delivery</h3>
        <div className="pos-modal-body space-y-4">
          <div>
            <label className="pos-label">Packing (Rs.)</label>
            <input
              ref={ref}
              type="number"
              min="0"
              value={pack}
              onChange={(e) => setPack(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave(Math.max(0, parseFloat(pack) || 0), Math.max(0, parseFloat(ship) || 0));
                if (e.key === "Escape") onClose();
              }}
              className="pos-input w-full text-center text-xl font-bold"
              placeholder="0"
            />
          </div>
          <div>
            <label className="pos-label">Shipping / delivery (Rs.)</label>
            <input
              type="number"
              min="0"
              value={ship}
              onChange={(e) => setShip(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave(Math.max(0, parseFloat(pack) || 0), Math.max(0, parseFloat(ship) || 0));
                if (e.key === "Escape") onClose();
              }}
              className="pos-input w-full text-center text-xl font-bold"
              placeholder="0"
            />
          </div>
          <p className="text-center text-sm font-bold text-indigo-900">
            Total extras: {fmtRs(p + s)}
          </p>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(p, s)}>
            Apply [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function RemarksModal({
  orderRemarks,
  internalNotes,
  onSave,
  onClose,
}: {
  orderRemarks: string;
  internalNotes: string;
  onSave: (order: string, internal: string) => void;
  onClose: () => void;
}) {
  const [order, setOrder] = useState(orderRemarks);
  const [internal, setInternal] = useState(internalNotes);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Notes</h3>
        <div className="pos-modal-body space-y-3">
          <div>
            <label className="pos-label">Order notes (print / customer)</label>
            <textarea
              ref={ref}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
              }}
              className="pos-input w-full resize-none"
              placeholder="Shown on receipt…"
            />
          </div>
          <div>
            <label className="pos-label">Internal notes (staff only)</label>
            <textarea
              value={internal}
              onChange={(e) => setInternal(e.target.value)}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
              }}
              className="pos-input w-full resize-none"
              placeholder="Not printed on customer copy…"
            />
          </div>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(order, internal)}>
            Save
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export const POS_UNITS = ["pc", "kg", "g", "box", "pkt", "dz", "litre", "ml"];

export function UnitModal({
  row,
  onSave,
  onClose,
}: {
  row: CartRow;
  onSave: (u: string) => void;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Change Unit — {row.name}</h3>
        <div className="pos-modal-body">
          <div className="grid grid-cols-4 gap-2">
            {POS_UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onSave(u)}
                className={`rounded-lg border py-3 text-sm font-bold uppercase transition-colors ${
                  row.unit === u ? "border-blue-600 bg-blue-600 text-white" : "border-border hover:bg-accent"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function SellByRsModal({
  title,
  pricePerUnit,
  unit,
  onClose,
  onApply,
}: {
  title: string;
  pricePerUnit: number;
  unit: string;
  onClose: () => void;
  onApply: (rs: number, qtyKg: number) => void;
}) {
  const [tab, setTab] = useState<"rs" | "kg">("rs");
  const [rs, setRs] = useState("");
  const [kgIn, setKgIn] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, [tab]);
  const amount = Math.max(0, parseFloat(rs) || 0);
  const qtyKg = qtyKgFromRupees(pricePerUnit, unit, amount);
  const ppk = pricePerKgFromRow(pricePerUnit, unit);
  const kgVal = Math.max(0, parseFloat(kgIn) || 0);
  const rsFromKg = ppk * kgVal;
  const previewRs = formatWeightFromKg(qtyKg);
  const previewKg = kgVal > 0 ? fmtRs(rsFromKg) : "—";
  const canApplyRs = tab === "rs" && amount > 0 && qtyKg > 0;
  const canApplyKg = tab === "kg" && kgVal > 0 && rsFromKg > 0;
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal max-w-[440px]">
        <h3 className="pos-modal-title">Smart sell — {title}</h3>
        <div className="pos-modal-body space-y-3">
          <p className="text-muted text-center text-xs">
            Rate ≈ {fmtRs(ppk)} per kg · row unit: <strong>{unit}</strong>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-bold ${tab === "rs" ? "border-blue-600 bg-blue-600 text-white" : "border-border"}`}
              onClick={() => setTab("rs")}
            >
              By Rs
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border py-2 text-sm font-bold ${tab === "kg" ? "border-blue-600 bg-blue-600 text-white" : "border-border"}`}
              onClick={() => setTab("kg")}
            >
              By weight
            </button>
          </div>
          {tab === "rs" ? (
            <>
              <label className="pos-label">Customer pays (Rs)</label>
              <input
                ref={ref}
                type="number"
                min="0"
                step="any"
                value={rs}
                onChange={(e) => setRs(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canApplyRs) onApply(amount, qtyKg);
                  if (e.key === "Escape") onClose();
                }}
                className="pos-input w-full text-center text-2xl font-bold"
                placeholder="e.g. 300"
              />
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-indigo-800">Live weight</div>
                <div className="mt-1 text-2xl font-black text-indigo-950">{amount > 0 ? previewRs : "—"}</div>
                <div className="mt-2 text-sm text-indigo-900/90">
                  Qty (kg): <strong>{qtyKg > 0 ? qtyKg.toFixed(4).replace(/\.?0+$/, "") : "—"}</strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <label className="pos-label">Weight (kg)</label>
              <input
                ref={ref}
                type="number"
                min="0"
                step="any"
                value={kgIn}
                onChange={(e) => setKgIn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canApplyKg) onApply(rsFromKg, kgVal);
                  if (e.key === "Escape") onClose();
                }}
                className="pos-input w-full text-center text-2xl font-bold"
                placeholder="e.g. 0.25"
              />
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-800">Line value</div>
                <div className="mt-1 text-2xl font-black text-emerald-950">{kgVal > 0 ? previewKg : "—"}</div>
                <div className="mt-2 text-sm text-emerald-900/90">Weight: {kgVal > 0 ? `${kgVal} kg` : "—"}</div>
              </div>
            </>
          )}
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button
            type="button"
            className="pos-btn-primary"
            disabled={!canApplyRs && !canApplyKg}
            onClick={() => {
              if (tab === "rs" && canApplyRs) onApply(amount, qtyKg);
              else if (tab === "kg" && canApplyKg) onApply(rsFromKg, kgVal);
            }}
          >
            Add to bill [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function SaveBillModal({
  subtotal,
  billDiscountAmt,
  billDiscountLabel,
  packingCharge,
  shippingCharge,
  grandTotal,
  onClose,
  onSave,
  saving,
}: {
  subtotal: number;
  billDiscountAmt: number;
  billDiscountLabel: string;
  packingCharge: number;
  shippingCharge: number;
  grandTotal: number;
  onClose: () => void;
  saving: boolean;
  onSave: (method: string, received: number, splitNote?: string | null) => void;
}) {
  const [method, setMethod] = useState("Cash");
  const [received, setReceived] = useState(String(Math.ceil(grandTotal)));
  const [split, setSplit] = useState(false);
  const [methodB, setMethodB] = useState("Card");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  const change = Math.max(0, parseFloat(received) - grandTotal);
  const a = split ? parseFloat(amountA) || 0 : parseFloat(received) || 0;
  const b = split ? parseFloat(amountB) || 0 : 0;
  const splitSum = split ? a + b : parseFloat(received) || 0;
  const splitOk = !split || splitSum + 1e-6 >= grandTotal;
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal max-w-[440px]">
        <h3 className="pos-modal-title">💳 Save bill</h3>
        <div className="pos-modal-body space-y-3">
          <div className="space-y-1 rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmtRs(subtotal)}</span>
            </div>
            {billDiscountAmt > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Bill discount {billDiscountLabel ? `(${billDiscountLabel})` : ""}</span>
                <span>− {fmtRs(billDiscountAmt)}</span>
              </div>
            )}
            {packingCharge > 0 && (
              <div className="flex justify-between">
                <span>Packing</span>
                <span>+ {fmtRs(packingCharge)}</span>
              </div>
            )}
            {shippingCharge > 0 && (
              <div className="flex justify-between">
                <span>Delivery / shipping</span>
                <span>+ {fmtRs(shippingCharge)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-dashed pt-1 text-base font-black">
              <span>TOTAL</span>
              <span className="text-blue-700">{fmtRs(grandTotal)}</span>
            </div>
          </div>
          <div>
            <label className="pos-label">Payment Mode</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {["Cash", "Card", "Transfer", "EasyPaisa", "JazzCash", "Credit"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                    method === m ? "border-blue-600 bg-blue-600 text-white" : "border-border hover:bg-accent"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => {
                const on = e.target.checked;
                setSplit(on);
                if (on) {
                  const a = Math.ceil(grandTotal / 2);
                  setAmountA(String(a));
                  setAmountB(String(Math.max(0, Math.round((grandTotal - a) * 100) / 100)));
                }
              }}
              className="h-4 w-4 rounded"
            />
            Split payment (two methods)
          </label>
          {!split ? (
            <div>
              <label className="pos-label">Amount Received (Rs.)</label>
              <input
                ref={ref}
                type="number"
                min="0"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && splitOk) onSave(method, parseFloat(received) || grandTotal, null);
                  if (e.key === "Escape") onClose();
                }}
                className="pos-input w-full text-center text-2xl font-bold"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="pos-label">Method A</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="pos-input w-full py-2 text-sm font-semibold"
                  >
                    {["Cash", "Card", "Transfer", "EasyPaisa", "JazzCash", "Credit"].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="pos-label">Method B</label>
                  <select
                    value={methodB}
                    onChange={(e) => setMethodB(e.target.value)}
                    className="pos-input w-full py-2 text-sm font-semibold"
                  >
                    {["Cash", "Card", "Transfer", "EasyPaisa", "JazzCash", "Credit"].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="pos-label">Amount A (Rs)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                    className="pos-input w-full text-center text-xl font-bold"
                  />
                </div>
                <div>
                  <label className="pos-label">Amount B (Rs)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amountB}
                    onChange={(e) => setAmountB(e.target.value)}
                    className="pos-input w-full text-center text-xl font-bold"
                  />
                </div>
              </div>
              <p className={`text-center text-sm font-semibold ${splitOk ? "text-green-700" : "text-red-600"}`}>
                Total tendered: {fmtRs(splitSum)} {splitOk ? "" : `(need ≥ ${fmtRs(grandTotal)})`}
              </p>
            </div>
          )}
          <div
            className={`rounded-xl p-3 text-center text-lg font-black ${
              !split && change > 0 ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
            }`}
          >
            {!split ? <>Change to Return: {fmtRs(change)}</> : <>Split mode — change applies to cash leg only in store policy</>}
          </div>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel [Esc]
          </button>
          <button
            type="button"
            className="pos-btn-primary"
            disabled={saving || !splitOk}
            onClick={() => {
              if (!split) {
                onSave(method, parseFloat(received) || grandTotal, null);
                return;
              }
              const note = `Split: ${method} ${fmtRs(a)} · ${methodB} ${fmtRs(b)}`;
              onSave(`${method}+${methodB}`, splitSum, note);
            }}
          >
            {saving ? "Saving…" : "Save bill [Enter]"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function holdGrand(h: PosHoldV1): number {
  const sub = h.cart.reduce((s, r) => s + r.total, 0);
  const disc = sub * (h.billDisc / 100);
  return sub - disc + h.extraCharges;
}

export function HoldsModal({
  holds,
  onClose,
  onResume,
}: {
  holds: PosHoldV1[];
  onClose: () => void;
  onResume: (id: string) => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal max-w-md">
        <h3 className="pos-modal-title">Held sales ({holds.length})</h3>
        <div className="pos-modal-body max-h-[min(60vh,400px)] overflow-y-auto p-0">
          {holds.length === 0 ? (
            <p className="text-muted p-6 text-center text-sm">No holds yet. Press F7 or F10 to park the current sale.</p>
          ) : (
            <ul className="divide-y divide-border">
              {holds.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-900">{h.billNo}</div>
                    <div className="text-muted text-xs">
                      {new Date(h.savedAt).toLocaleString("en-PK")} · {h.cart.length} lines · {fmtRs(holdGrand(h))}
                    </div>
                  </div>
                  <button type="button" className="pos-btn-primary shrink-0 px-4 py-2 text-xs" onClick={() => onResume(h.id)}>
                    Resume
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Close [Esc]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function PostSaleActionsModal({
  receipt,
  onDone,
}: {
  receipt: ReceiptContext;
  onDone: () => void;
}) {
  const [thermalMsg, setThermalMsg] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);

  return (
    <Overlay onClose={onDone}>
      <div className="pos-modal max-w-[420px]">
        <h3 className="pos-modal-title">Bill saved — {receipt.billNo}</h3>
        <p className="px-5 pb-2 text-center text-sm text-muted-foreground">
          Total {fmtRs(receipt.grand)} · choose how to deliver the receipt
        </p>
        <div className="pos-modal-body grid grid-cols-2 gap-2 px-5 pb-2">
          <button type="button" className="pos-btn-primary col-span-2 py-3" onClick={() => printReceipt(receipt, copies)}>
            Print {copies > 1 ? `(${copies}×)` : ""}
          </button>
          <button type="button" className="rounded-lg border border-border py-2.5 text-sm font-semibold" onClick={() => saveReceiptAsPdf(receipt)}>
            PDF / Save
          </button>
          <button type="button" className="rounded-lg border border-border py-2.5 text-sm font-semibold" onClick={() => downloadReceiptHtml(receipt)}>
            Download HTML
          </button>
          <button type="button" className="rounded-lg border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-900" onClick={() => shareReceiptWhatsApp(receipt)}>
            WhatsApp
          </button>
          <button type="button" className="rounded-lg border border-border py-2.5 text-sm font-semibold" onClick={() => shareReceiptEmail(receipt)}>
            Email
          </button>
          <button
            type="button"
            className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-950"
            onClick={async () => {
              try {
                const msg = await printThermalEscPos(receipt);
                setThermalMsg(msg);
              } catch (e) {
                setThermalMsg(e instanceof Error ? e.message : "Thermal print failed");
              }
            }}
          >
            Thermal (USB / Serial)
          </button>
          <label className="col-span-2 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600">
            Copies
            <select
              value={copies}
              onChange={(e) => setCopies(parseInt(e.target.value, 10) || 1)}
              className="rounded border border-border px-2 py-1"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {thermalMsg && <p className="col-span-2 text-center text-xs text-slate-600">{thermalMsg}</p>}
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-primary w-full" onClick={onDone}>
            New sale
          </button>
        </div>
      </div>
    </Overlay>
  );
}
