import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { CartRow, PosHoldV1 } from "./types";
import { fmtRs } from "./calc";
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
  onSave: (disc: number) => void;
  onClose: () => void;
}) {
  const [disc, setDisc] = useState(String(row.discount));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Item Discount — {row.name}</h3>
        <div className="pos-modal-body">
          <label className="pos-label">Discount %</label>
          <input
            ref={ref}
            type="number"
            min="0"
            max="100"
            value={disc}
            onChange={(e) => setDisc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(parseFloat(disc) || 0);
              if (e.key === "Escape") onClose();
            }}
            className="pos-input w-full text-center text-2xl font-bold"
          />
          {row.pricePerUnit > 0 && parseFloat(disc) > 0 && (
            <p className="mt-2 text-center text-sm font-semibold text-green-600">
              Discounted price: {fmtRs(row.pricePerUnit * (1 - parseFloat(disc) / 100))}
            </p>
          )}
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(parseFloat(disc) || 0)}>
            Apply [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function BillDiscModal({
  value,
  subtotal,
  onSave,
  onClose,
}: {
  value: number;
  subtotal: number;
  onSave: (d: number) => void;
  onClose: () => void;
}) {
  const [disc, setDisc] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  const discAmt = (subtotal * (parseFloat(disc) || 0)) / 100;
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Bill Discount</h3>
        <div className="pos-modal-body space-y-3">
          <div>
            <label className="pos-label">Discount %</label>
            <input
              ref={ref}
              type="number"
              min="0"
              max="100"
              value={disc}
              onChange={(e) => setDisc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave(parseFloat(disc) || 0);
                if (e.key === "Escape") onClose();
              }}
              className="pos-input w-full text-center text-2xl font-bold"
            />
          </div>
          {discAmt > 0 && <p className="text-center font-semibold text-green-600">Saving: {fmtRs(discAmt)}</p>}
          <p className="text-muted text-center text-sm">After discount: {fmtRs(subtotal - discAmt)}</p>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(parseFloat(disc) || 0)}>
            Apply [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function ChargesModal({
  value,
  onSave,
  onClose,
}: {
  value: number;
  onSave: (v: number) => void;
  onClose: () => void;
}) {
  const [amt, setAmt] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Additional Charges</h3>
        <div className="pos-modal-body">
          <label className="pos-label">Amount (Rs.)</label>
          <input
            ref={ref}
            type="number"
            min="0"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(parseFloat(amt) || 0);
              if (e.key === "Escape") onClose();
            }}
            className="pos-input w-full text-center text-2xl font-bold"
            placeholder="e.g. 50"
          />
          <p className="text-muted mt-2 text-center text-xs">e.g. delivery charges, packing, etc.</p>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(parseFloat(amt) || 0)}>
            Apply [Enter]
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function RemarksModal({
  value,
  onSave,
  onClose,
}: {
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [txt, setTxt] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal">
        <h3 className="pos-modal-title">Remarks / Notes</h3>
        <div className="pos-modal-body">
          <textarea
            ref={ref}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            rows={4}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            className="pos-input w-full resize-none"
            placeholder="Add remarks for this bill..."
          />
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button type="button" className="pos-btn-primary" onClick={() => onSave(txt)}>
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
  const [rs, setRs] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  const amount = Math.max(0, parseFloat(rs) || 0);
  const qtyKg = qtyKgFromRupees(pricePerUnit, unit, amount);
  const ppk = pricePerKgFromRow(pricePerUnit, unit);
  const preview = formatWeightFromKg(qtyKg);
  return (
    <Overlay onClose={onClose}>
      <div className="pos-modal max-w-[440px]">
        <h3 className="pos-modal-title">Sell by amount (Rs) — {title}</h3>
        <div className="pos-modal-body space-y-3">
          <p className="text-muted text-center text-xs">
            Rate ≈ {fmtRs(ppk)} per kg · row unit: <strong>{unit}</strong>
          </p>
          <label className="pos-label">Customer pays (Rs)</label>
          <input
            ref={ref}
            type="number"
            min="0"
            step="any"
            value={rs}
            onChange={(e) => setRs(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && amount > 0 && qtyKg > 0) onApply(amount, qtyKg);
              if (e.key === "Escape") onClose();
            }}
            className="pos-input w-full text-center text-2xl font-bold"
            placeholder="e.g. 300"
          />
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4 text-center">
            <div className="text-xs font-bold uppercase tracking-wide text-indigo-800">Live weight</div>
            <div className="mt-1 text-2xl font-black text-indigo-950">{amount > 0 ? preview : "—"}</div>
            <div className="mt-2 text-sm text-indigo-900/90">
              Qty (kg): <strong>{qtyKg > 0 ? qtyKg.toFixed(4).replace(/\.?0+$/, "") : "—"}</strong>
            </div>
            <div className="mt-1 text-xs text-indigo-800/80">Sale value (entered): {fmtRs(amount)}</div>
          </div>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose}>
            Cancel [Esc]
          </button>
          <button
            type="button"
            className="pos-btn-primary"
            disabled={amount <= 0 || qtyKg <= 0}
            onClick={() => onApply(amount, qtyKg)}
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
  billDisc,
  extraCharges,
  grandTotal,
  onClose,
  onSave,
  saving,
}: {
  subtotal: number;
  billDisc: number;
  extraCharges: number;
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
        <h3 className="pos-modal-title">💳 Save & Print Bill</h3>
        <div className="pos-modal-body space-y-3">
          <div className="space-y-1 rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmtRs(subtotal)}</span>
            </div>
            {billDisc > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Bill Discount ({billDisc}%)</span>
                <span>− {fmtRs((subtotal * billDisc) / 100)}</span>
              </div>
            )}
            {extraCharges > 0 && (
              <div className="flex justify-between">
                <span>Additional Charges</span>
                <span>+ {fmtRs(extraCharges)}</span>
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
            {saving ? "Saving…" : "🖨 Save & Print [Enter]"}
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
