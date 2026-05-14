import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { CartRow, PosHoldV1 } from "./types";
import { fmtRs } from "./calc";

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
  onSave: (method: string, received: number) => void;
}) {
  const [method, setMethod] = useState("Cash");
  const [received, setReceived] = useState(String(Math.ceil(grandTotal)));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  const change = Math.max(0, parseFloat(received) - grandTotal);
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
          <div>
            <label className="pos-label">Amount Received (Rs.)</label>
            <input
              ref={ref}
              type="number"
              min="0"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave(method, parseFloat(received) || grandTotal);
                if (e.key === "Escape") onClose();
              }}
              className="pos-input w-full text-center text-2xl font-bold"
            />
          </div>
          <div
            className={`rounded-xl p-3 text-center text-lg font-black ${
              change > 0 ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"
            }`}
          >
            Change to Return: {fmtRs(change)}
          </div>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel [Esc]
          </button>
          <button
            type="button"
            className="pos-btn-primary"
            disabled={saving}
            onClick={() => onSave(method, parseFloat(received) || grandTotal)}
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
