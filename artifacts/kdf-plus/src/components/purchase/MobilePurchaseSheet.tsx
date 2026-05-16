import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Minus, ShoppingCart, Zap } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { ModalRecommendationRow } from "@/components/purchase/ModalRecommendationRow";
import { usePurchaseSheetLock } from "@/components/purchase/usePurchaseSheetLock";

const SHEET_Z = 100_000;
const DRAG_DISMISS_PX = 96;

type VariantGroup = { type: string; items: Array<{ id: string; value: string; stock: number; price?: string; hex?: string }> };

export type PurchaseIntent = "cart" | "buy";

export function MobilePurchaseSheet({
  open,
  onOpenChange,
  intent,
  product,
  image,
  variantGroups,
  selectedVariant,
  activeVariant,
  onVariantChange,
  price,
  qty,
  onQtyChange,
  stockStatus,
  availableStock,
  onAddToCart,
  onBuyNow,
  recommendations = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: PurchaseIntent;
  product: Product;
  image: string;
  variantGroups: VariantGroup[];
  selectedVariant?: string;
  activeVariant?: { id: string; value: string; price?: string };
  onVariantChange: (id: string) => void;
  price: number;
  qty: number;
  onQtyChange: (qty: number) => void;
  stockStatus: { label: string; cls: string };
  availableStock: number;
  onAddToCart: () => void;
  onBuyNow: () => void;
  recommendations?: Product[];
}) {
  const [visible, setVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [sheetTransition, setSheetTransition] = useState(true);
  const dragStartY = useRef(0);
  const dragPx = useRef(0);
  const touchDragging = useRef(false);

  usePurchaseSheetLock(open);

  useEffect(() => {
    if (open) {
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    }
    setVisible(false);
    setDragOffset(0);
  }, [open]);

  const handleClose = useCallback(() => {
    setSheetTransition(true);
    setVisible(false);
    setDragOffset(0);
    dragPx.current = 0;
    setTimeout(() => onOpenChange(false), 280);
  }, [onOpenChange]);

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
    if (dragPx.current > DRAG_DISMISS_PX) handleClose();
    else {
      setDragOffset(0);
      dragPx.current = 0;
    }
  }, [handleClose]);

  if (!open && !visible) return null;

  const selectedLabel = activeVariant?.value ?? "Standard";
  const canBuy = availableStock > 0;
  const total = price * qty;

  const confirmAdd = () => {
    onAddToCart();
    handleClose();
  };

  const confirmBuy = () => {
    onBuyNow();
    handleClose();
  };

  const sheetTransform = visible ? `translate3d(0, ${dragOffset}px, 0)` : "translate3d(0, 100%, 0)";
  const recs = recommendations.slice(0, 8);

  return createPortal(
    <div className="kdf-purchase-sheet-root" style={{ zIndex: SHEET_Z }} role="dialog" aria-modal="true">
      <button
        type="button"
        className="kdf-purchase-sheet-backdrop"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
        aria-label="Close"
      />

      <div
        className="kdf-purchase-sheet"
        style={{
          transform: sheetTransform,
          transition: sheetTransition ? "transform 0.36s cubic-bezier(0.32, 0.72, 0, 1)" : "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="kdf-purchase-sheet__handle-zone"
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
          onTouchCancel={onSheetTouchEnd}
        >
          <div className="kdf-purchase-sheet__handle" aria-hidden />
          <div className="kdf-purchase-sheet__head">
            <p className="kdf-purchase-sheet__title">
              {intent === "buy" ? "Buy now" : "Add to cart"}
            </p>
            <button type="button" onClick={handleClose} className="kdf-purchase-sheet__close" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="kdf-purchase-sheet__scroll">
          <div className="kdf-purchase-sheet__product">
            <div className="kdf-purchase-sheet__thumb">
              {image ? (
                <img src={image} alt="" className="h-full w-full object-contain" draggable={false} />
              ) : null}
            </div>
            <div className="kdf-purchase-sheet__info">
              <p className="kdf-purchase-sheet__name">{product.name}</p>
              <p className="kdf-purchase-sheet__variant-line">{selectedLabel}</p>
              <div className="kdf-purchase-sheet__price-row">
                <span className="kdf-purchase-sheet__price">Rs. {price.toLocaleString()}</span>
                <span className={`kdf-purchase-sheet__stock ${stockStatus.cls}`}>{stockStatus.label}</span>
              </div>
            </div>
          </div>

          {variantGroups.map(({ type, items }) => (
            <div key={type} className="kdf-purchase-sheet__section">
              <p className="kdf-purchase-sheet__section-label">
                {type.toLowerCase().includes("weight") ? "Select weight" : type}
              </p>
              <div className="kdf-variant-seg">
                {items.map((v) => {
                  const isSelected = selectedVariant === v.id;
                  const outOfStock = v.stock === 0;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => !outOfStock && onVariantChange(v.id)}
                      className={`kdf-variant-seg__btn${isSelected ? " is-selected" : ""}${outOfStock ? " is-oos" : ""}`}
                    >
                      {type === "Color" && v.hex && (
                        <span className="kdf-variant-seg__swatch" style={{ backgroundColor: v.hex }} />
                      )}
                      <span className="kdf-variant-seg__value">{v.value}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="kdf-purchase-sheet__section kdf-purchase-sheet__section--qty">
            <p className="kdf-purchase-sheet__section-label">Quantity</p>
            <div className="kdf-qty-pill">
              <button
                type="button"
                className="kdf-qty-pill__btn"
                disabled={qty <= 1}
                onClick={() => onQtyChange(Math.max(1, qty - 1))}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="kdf-qty-pill__value">{qty}</span>
              <button
                type="button"
                className="kdf-qty-pill__btn kdf-qty-pill__btn--plus"
                disabled={!canBuy || qty >= availableStock}
                onClick={() => onQtyChange(Math.min(availableStock, qty + 1))}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {recs.length > 0 && <ModalRecommendationRow products={recs} />}
        </div>

        <footer className="kdf-purchase-sheet__footer">
          <div className="kdf-purchase-sheet__footer-total">
            <span className="kdf-purchase-sheet__footer-total-label">
              {selectedLabel} · Qty {qty}
            </span>
            <span className="kdf-purchase-sheet__footer-total-value">Rs. {total.toLocaleString()}</span>
          </div>
          <div className="kdf-purchase-sheet__cta-row">
            <button
              type="button"
              onClick={confirmAdd}
              disabled={!canBuy}
              className="kdf-purchase-sheet__cta kdf-purchase-sheet__cta--cart"
            >
              <ShoppingCart className="h-4 w-4" />
              Add to Cart
            </button>
            <button
              type="button"
              onClick={confirmBuy}
              disabled={!canBuy}
              className="kdf-purchase-sheet__cta kdf-purchase-sheet__cta--buy"
            >
              <Zap className="h-4 w-4" />
              Buy Now
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
