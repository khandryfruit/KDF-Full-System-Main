import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Minus, ShoppingCart, Check, PackageCheck } from "lucide-react";
import type { Product, ProductVariant } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { useCart } from "@/context/CartContext";

interface VariantPickerModalProps {
  product: Product;
  onClose: () => void;
}

const SHEET_Z = 100_000;
const DRAG_DISMISS_PX = 96;

function getGroups(variants: ProductVariant[]) {
  const order: string[] = [];
  const map = new Map<string, ProductVariant[]>();
  for (const v of variants) {
    if (!map.has(v.name)) { map.set(v.name, []); order.push(v.name); }
    map.get(v.name)!.push(v);
  }
  return order.map(type => ({ type, items: map.get(type)! }));
}

export function VariantPickerModal({ product, onClose }: VariantPickerModalProps) {
  const { addItem } = useCart();
  const [visible, setVisible] = useState(false);
  const [added, setAdded]     = useState(false);
  const [qty, setQty]         = useState(1);
  const [dragOffset, setDragOffset] = useState(0);
  const [sheetTransition, setSheetTransition] = useState(true);

  const dragStartY = useRef(0);
  const dragPx = useRef(0);
  const touchDragging = useRef(false);

  const groups = getGroups(product.variants ?? []);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, ProductVariant>>(() => {
    const init: Record<string, ProductVariant> = {};
    for (const g of groups) {
      const first = g.items.find(v => v.stock > 0) ?? g.items[0];
      if (first) init[g.type] = first;
    }
    return init;
  });

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    html.classList.add("kdf-variant-sheet-open");
    const prev = {
      overflow: body.style.overflow,
      touchAction: body.style.touchAction as string,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };

    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    return () => {
      html.classList.remove("kdf-variant-sheet-open");
      body.style.overflow = prev.overflow;
      body.style.touchAction = prev.touchAction;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const handleClose = useCallback(() => {
    setSheetTransition(true);
    setVisible(false);
    setDragOffset(0);
    dragPx.current = 0;
    setTimeout(onClose, 300);
  }, [onClose]);

  const onSheetTouchStart = useCallback((e: React.TouchEvent) => {
    touchDragging.current = true;
    setSheetTransition(false);
    dragStartY.current = e.touches[0].clientY;
    dragPx.current = 0;
  }, []);

  const onSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchDragging.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    const next = Math.max(0, dy);
    dragPx.current = next;
    setDragOffset(next);
  }, []);

  const onSheetTouchEnd = useCallback(() => {
    if (!touchDragging.current) return;
    touchDragging.current = false;
    setSheetTransition(true);
    if (dragPx.current > DRAG_DISMISS_PX) {
      handleClose();
    } else {
      setDragOffset(0);
      dragPx.current = 0;
    }
  }, [handleClose]);

  const selectedValues  = Object.values(selectedByGroup);
  const priceVariant    = selectedValues.find(v => v.price && parseFloat(v.price) > 0);
  const price           = priceVariant
    ? parseFloat(priceVariant.price!)
    : parseFloat(product.price);
  const total           = price * qty;
  const allSelected     = groups.every(g => selectedByGroup[g.type]);
  const anyOOS          = selectedValues.some(v => v.stock === 0);
  const canAdd          = allSelected && !anyOOS && !added;

  const handleAdd = () => {
    if (!canAdd) return;
    const firstVariant = selectedValues[0];
    const variantLabel = selectedValues.map(v => `${v.name}: ${v.value}`).join(", ");
    addItem(product, qty, firstVariant?.id, variantLabel);
    setAdded(true);
    setTimeout(() => { setVisible(false); setTimeout(onClose, 300); }, 900);
  };

  const imageUrl = getProductImageSrc(product.images?.[0]);

  const sheetTransform = visible
    ? `translate3d(0, ${dragOffset}px, 0)`
    : "translate3d(0, 100%, 0)";

  const portal =
    typeof document !== "undefined" ? createPortal(
      <div
        className="fixed inset-0 flex items-end justify-center pointer-events-auto"
        style={{ zIndex: SHEET_Z, isolation: "isolate" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="variant-sheet-title"
      >
        <div
          className="absolute inset-0 transition-opacity duration-300 ease-out will-change-[opacity]"
          style={{
            background: "rgba(0,0,0,0.52)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            opacity: visible ? 1 : 0,
          }}
          onClick={handleClose}
          aria-hidden
        />

        <div
          className="relative box-border flex w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] shadow-[0_-12px_48px_rgba(0,0,0,0.22)] will-change-transform"
          style={{
            maxHeight: "min(100dvh, 100vh)",
            height: "auto",
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(20px) saturate(1.15)",
            WebkitBackdropFilter: "blur(20px) saturate(1.15)",
            transform: sheetTransform,
            transition: sheetTransition ? "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)" : "none",
            touchAction: "pan-y",
            overscrollBehavior: "contain",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="flex shrink-0 flex-col touch-none"
            onTouchStart={onSheetTouchStart}
            onTouchMove={onSheetTouchMove}
            onTouchEnd={onSheetTouchEnd}
            onTouchCancel={onSheetTouchEnd}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-slate-200" aria-hidden />
            </div>
            <div className="flex items-center justify-between px-5 pt-1 pb-3">
              <p id="variant-sheet-title" className="text-base font-bold text-gray-900">
                Choose Options
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border-0 cursor-pointer bg-slate-100 text-slate-500"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            className="mx-4 mb-4 flex shrink-0 gap-3 rounded-2xl p-3"
            style={{
              background: "linear-gradient(135deg,#f0f7e6 0%,#e8f5d5 100%)",
              alignItems: "center",
            }}
          >
            <div
              className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-white shadow-md"
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={product.name}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-[28px] font-black text-[#5FA800]/30">
                    {product.name?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="mb-1 line-clamp-2 text-sm font-semibold leading-snug text-[#1a2e05]"
              >
                {product.name}
              </p>
              <p className="text-lg font-extrabold leading-none" style={{ color: "#5FA800" }}>
                Rs. {price.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
            {groups.length > 0 && (
              <div className="px-4 pb-2">
                {groups.map(({ type, items }) => (
                  <div key={type} className="mb-5">
                    <div className="mb-2.5 flex items-center gap-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {type}
                      </p>
                      {selectedByGroup[type] && (
                        <span className="text-xs font-semibold text-[#5FA800]">
                          — {selectedByGroup[type].value}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((variant) => {
                        const isSelected = selectedByGroup[type]?.id === variant.id;
                        const oos        = variant.stock === 0;
                        const vPrice     = variant.price ? parseFloat(variant.price) : null;
                        const showPrice  = vPrice && vPrice > 0;

                        return (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => !oos && setSelectedByGroup(prev => ({ ...prev, [type]: variant }))}
                            disabled={oos}
                            className="relative flex flex-col items-center gap-0.5 rounded-xl border-2 transition-all disabled:cursor-not-allowed"
                            style={{
                              minWidth: showPrice ? 76 : 60,
                              padding: showPrice ? "8px 12px" : "9px 14px",
                              borderColor: isSelected ? "#5FA800" : "#e2e8f0",
                              background: isSelected
                                ? "linear-gradient(135deg,#5FA800 0%,#4a8500 100%)"
                                : oos ? "#f8fafc" : "#fff",
                              opacity: oos ? 0.45 : 1,
                              boxShadow: isSelected ? "0 2px 12px rgba(95,168,0,0.30)" : "0 1px 3px rgba(0,0,0,0.06)",
                            }}
                          >
                            {type === "Color" && variant.hex && (
                              <span
                                className="block h-4 w-4 rounded-full border border-black/10"
                                style={{ background: variant.hex }}
                              />
                            )}
                            <span
                              className="text-center text-[13px] font-bold leading-tight"
                              style={{
                                color: isSelected ? "#fff" : oos ? "#94a3b8" : "#1e293b",
                                textDecoration: oos ? "line-through" : "none",
                              }}
                            >
                              {variant.value}
                            </span>
                            {showPrice && (
                              <span
                                className="text-[11px] font-semibold leading-none"
                                style={{ color: isSelected ? "rgba(255,255,255,0.85)" : "#5FA800" }}
                              >
                                Rs.{vPrice!.toLocaleString()}
                              </span>
                            )}
                            {isSelected && (
                              <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/30">
                                <Check className="h-2.5 w-2.5 text-white" />
                              </span>
                            )}
                            {oos && (
                              <span className="text-[9px] leading-none text-slate-400">Out of stock</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mx-4 mb-3 h-px bg-slate-100" />

            <div className="flex items-center justify-between px-4 pb-4">
              <div>
                <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Quantity
                </p>
                <p className="text-xs text-slate-500">
                  {qty} × Rs.{price.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center overflow-hidden rounded-2xl border-[1.5px] border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="flex h-11 w-11 items-center justify-center border-0 bg-transparent text-slate-600 disabled:text-slate-300"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-base font-extrabold text-slate-800">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(q => q + 1)}
                  className="flex h-11 w-11 items-center justify-center border-0 bg-[#5FA800] text-white"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div
            className="shrink-0 border-t border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur-md"
            style={{
              paddingBottom: "max(16px, calc(12px + env(safe-area-inset-bottom, 0px)))",
            }}
          >
            <div className="mb-2.5 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span className="text-[13px] font-medium text-slate-500">Total Amount</span>
              <span className="text-lg font-extrabold text-slate-900">
                Rs. {total.toLocaleString()}
              </span>
            </div>

            {anyOOS && allSelected && (
              <p className="mb-2 text-center text-xs text-red-500">
                Selected option is currently out of stock
              </p>
            )}

            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              className="flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] border-0 text-[15px] font-extrabold text-white transition-all disabled:cursor-not-allowed"
              style={{
                background: added
                  ? "linear-gradient(135deg,#22c55e 0%,#16a34a 100%)"
                  : !canAdd
                  ? "#94a3b8"
                  : "linear-gradient(135deg,#5FA800 0%,#3d7000 100%)",
                boxShadow: canAdd && !added ? "0 4px 16px rgba(95,168,0,0.35)" : "none",
              }}
            >
              {added ? (
                <>
                  <PackageCheck className="h-5 w-5" />
                  Added to Cart!
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" />
                  Add to Cart · Rs. {total.toLocaleString()}
                </>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    ) : null;

  return portal;
}
