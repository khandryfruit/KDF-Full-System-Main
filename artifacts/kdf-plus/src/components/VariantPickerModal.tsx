import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { X, Plus, Minus, ShoppingCart, PackageCheck, Zap } from "lucide-react";
import type { Product, ProductVariant } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { useCart } from "@/context/CartContext";
import { usePurchaseSheetLock } from "@/components/purchase/usePurchaseSheetLock";

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
    if (!map.has(v.name)) {
      map.set(v.name, []);
      order.push(v.name);
    }
    map.get(v.name)!.push(v);
  }
  return order.map((type) => ({ type, items: map.get(type)! }));
}

export function VariantPickerModal({ product, onClose }: VariantPickerModalProps) {
  const { addItem } = useCart();
  const [, setLocation] = useLocation();
  const [visible, setVisible] = useState(false);
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);
  const [dragOffset, setDragOffset] = useState(0);
  const [sheetTransition, setSheetTransition] = useState(true);

  const dragStartY = useRef(0);
  const dragPx = useRef(0);
  const touchDragging = useRef(false);

  const groups = getGroups(product.variants ?? []);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, ProductVariant>>(() => {
    const init: Record<string, ProductVariant> = {};
    for (const g of groups) {
      const first = g.items.find((v) => v.stock > 0) ?? g.items[0];
      if (first) init[g.type] = first;
    }
    return init;
  });

  usePurchaseSheetLock(true);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = useCallback(() => {
    setSheetTransition(true);
    setVisible(false);
    setDragOffset(0);
    dragPx.current = 0;
    setTimeout(onClose, 280);
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
    if (dragPx.current > DRAG_DISMISS_PX) handleClose();
    else {
      setDragOffset(0);
      dragPx.current = 0;
    }
  }, [handleClose]);

  const selectedValues = Object.values(selectedByGroup);
  const priceVariant = selectedValues.find((v) => v.price && parseFloat(v.price) > 0);
  const price = priceVariant ? parseFloat(priceVariant.price!) : parseFloat(product.price);
  const originalPrice = product.originalPrice ? parseFloat(product.originalPrice) : null;
  const discountPct =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;
  const total = price * qty;
  const allSelected = groups.every((g) => selectedByGroup[g.type]);
  const anyOOS = selectedValues.some((v) => v.stock === 0);
  const canAct = allSelected && !anyOOS && !added;

  const commitToCart = useCallback(() => {
    const firstVariant = selectedValues[0];
    const variantLabel = selectedValues.map((v) => `${v.name}: ${v.value}`).join(", ");
    addItem(product, qty, firstVariant?.id, variantLabel);
  }, [addItem, product, qty, selectedValues]);

  const handleAdd = () => {
    if (!canAct) return;
    commitToCart();
    setAdded(true);
    setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 280);
    }, 700);
  };

  const handleBuyNow = () => {
    if (!canAct) return;
    commitToCart();
    setVisible(false);
    setTimeout(() => {
      onClose();
      setLocation("/cart");
    }, 200);
  };

  const imageUrl = getProductImageSrc(product.images?.[0]);
  const selectedLabel = selectedValues.map((v) => v.value).join(" · ");
  const stockLabel = anyOOS
    ? "Out of stock"
    : selectedValues[0]?.stock != null && selectedValues[0].stock <= 8
    ? `Only ${selectedValues[0].stock} left`
    : "In stock";

  const sheetTransform = visible ? `translate3d(0, ${dragOffset}px, 0)` : "translate3d(0, 100%, 0)";

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="kdf-purchase-sheet-root"
            style={{ zIndex: SHEET_Z }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-sheet-title"
          >
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
                  <p id="purchase-sheet-title" className="kdf-purchase-sheet__title">
                    Choose options
                  </p>
                  <button type="button" onClick={handleClose} className="kdf-purchase-sheet__close" aria-label="Close">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="kdf-purchase-sheet__scroll">
                <div className="kdf-purchase-sheet__product">
                  <div className="kdf-purchase-sheet__thumb">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="kdf-purchase-sheet__thumb-img" draggable={false} />
                    ) : (
                      <span className="text-2xl font-black text-[#5FA800]/30">{product.name?.[0]}</span>
                    )}
                  </div>
                  <div className="kdf-purchase-sheet__info">
                    <p className="kdf-purchase-sheet__name">{product.name}</p>
                    <p className="kdf-purchase-sheet__variant-line">{selectedLabel || "Select options"}</p>
                    <div className="kdf-purchase-sheet__price-row">
                      <span className="kdf-purchase-sheet__price">Rs. {price.toLocaleString()}</span>
                      {discountPct != null && discountPct > 0 && (
                        <span className="kdf-purchase-sheet__discount">-{discountPct}%</span>
                      )}
                      <span
                        className={`kdf-purchase-sheet__stock${anyOOS ? " is-oos" : ""}`}
                      >
                        {stockLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {groups.map(({ type, items }) => (
                  <div key={type} className="kdf-purchase-sheet__section">
                    <p className="kdf-purchase-sheet__section-label">{type}</p>
                    <div className="kdf-variant-seg">
                      {items.map((variant) => {
                        const isSelected = selectedByGroup[type]?.id === variant.id;
                        const oos = variant.stock === 0;
                        const vPrice = variant.price ? parseFloat(variant.price) : null;
                        return (
                          <button
                            key={variant.id}
                            type="button"
                            disabled={oos}
                            onClick={() => !oos && setSelectedByGroup((prev) => ({ ...prev, [type]: variant }))}
                            className={`kdf-variant-seg__btn${isSelected ? " is-selected" : ""}${oos ? " is-oos" : ""}`}
                          >
                            {type === "Color" && variant.hex && (
                              <span className="kdf-variant-seg__swatch" style={{ background: variant.hex }} />
                            )}
                            <span className="kdf-variant-seg__value">{variant.value}</span>
                            {vPrice != null && vPrice > 0 && (
                              <span className="kdf-variant-seg__sub">Rs.{vPrice.toLocaleString()}</span>
                            )}
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
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="kdf-qty-pill__value">{qty}</span>
                    <button
                      type="button"
                      className="kdf-qty-pill__btn kdf-qty-pill__btn--plus"
                      onClick={() => setQty((q) => q + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <footer className="kdf-purchase-sheet__footer">
                {anyOOS && allSelected && (
                  <p className="kdf-purchase-sheet__oos-msg">Selected option is out of stock</p>
                )}
                <div className="kdf-purchase-sheet__footer-total">
                  <span className="kdf-purchase-sheet__footer-total-label">Total</span>
                  <span className="kdf-purchase-sheet__footer-total-value">Rs. {total.toLocaleString()}</span>
                </div>
                <div className="kdf-purchase-sheet__cta-row">
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!canAct}
                    className={`kdf-purchase-sheet__cta kdf-purchase-sheet__cta--cart${added ? " is-success" : ""}`}
                  >
                    {added ? (
                      <>
                        <PackageCheck className="h-4 w-4" />
                        Added
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4" />
                        Add to Cart
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleBuyNow}
                    disabled={!canAct}
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
        )
      : null;

  return portal;
}
