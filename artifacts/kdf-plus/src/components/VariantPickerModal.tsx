import { useState, useEffect } from "react";
import { X, Plus, Minus, ShoppingCart, Check, PackageCheck } from "lucide-react";
import type { Product, ProductVariant } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { useCart } from "@/context/CartContext";

interface VariantPickerModalProps {
  product: Product;
  onClose: () => void;
}

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

  const groups = getGroups(product.variants ?? []);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, ProductVariant>>(() => {
    const init: Record<string, ProductVariant> = {};
    for (const g of groups) {
      const first = g.items.find(v => v.stock > 0) ?? g.items[0];
      if (first) init[g.type] = first;
    }
    return init;
  });

  /* slide-in on mount */
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

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

  return (
    <div
      className="fixed inset-0 z-[700] flex items-end justify-center"
      style={{ isolation: "isolate" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
          opacity: visible ? 1 : 0,
        }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full bg-white flex flex-col"
        style={{
          borderRadius: "24px 24px 0 0",
          maxHeight: "92dvh",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          maxWidth: "480px",
          marginLeft: "auto",
          marginRight: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div style={{ width: 40, height: 4, borderRadius: 99, background: "#e2e8f0" }} />
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
          <p className="font-bold text-gray-900" style={{ fontSize: 16 }}>Choose Options</p>
          <button
            onClick={handleClose}
            style={{
              width: 32, height: 32, borderRadius: 99,
              background: "#f1f5f9",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", cursor: "pointer",
            }}
          >
            <X style={{ width: 16, height: 16, color: "#64748b" }} />
          </button>
        </div>

        {/* Product strip */}
        <div
          className="mx-4 mb-4 flex-shrink-0"
          style={{
            background: "linear-gradient(135deg,#f0f7e6 0%,#e8f5d5 100%)",
            borderRadius: 16,
            padding: "12px 14px",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: 12,
            overflow: "hidden", flexShrink: 0,
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          }}>
            {imageUrl
              ? <img src={imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: "#5FA800", opacity: 0.3 }}>
                    {product.name?.[0]?.toUpperCase()}
                  </span>
                </div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 14, fontWeight: 600, color: "#1a2e05",
              overflow: "hidden", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              lineHeight: 1.4, marginBottom: 4,
            }}>
              {product.name}
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#5FA800", lineHeight: 1 }}>
              Rs. {price.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>

          {/* Variant groups */}
          {groups.length > 0 && (
            <div style={{ padding: "0 16px 8px" }}>
              {groups.map(({ type, items }) => (
                <div key={type} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {type}
                    </p>
                    {selectedByGroup[type] && (
                      <span style={{ fontSize: 12, color: "#5FA800", fontWeight: 600 }}>
                        — {selectedByGroup[type].value}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {items.map((variant) => {
                      const isSelected = selectedByGroup[type]?.id === variant.id;
                      const oos        = variant.stock === 0;
                      const vPrice     = variant.price ? parseFloat(variant.price) : null;
                      const showPrice  = vPrice && vPrice > 0;

                      return (
                        <button
                          key={variant.id}
                          onClick={() => !oos && setSelectedByGroup(prev => ({ ...prev, [type]: variant }))}
                          disabled={oos}
                          style={{
                            minWidth: showPrice ? 76 : 60,
                            padding: showPrice ? "8px 12px" : "9px 14px",
                            borderRadius: 12,
                            border: isSelected ? "2px solid #5FA800" : "2px solid #e2e8f0",
                            background: isSelected
                              ? "linear-gradient(135deg,#5FA800 0%,#4a8500 100%)"
                              : oos ? "#f8fafc" : "#fff",
                            cursor: oos ? "not-allowed" : "pointer",
                            opacity: oos ? 0.45 : 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2,
                            position: "relative",
                            boxShadow: isSelected ? "0 2px 12px rgba(95,168,0,0.30)" : "0 1px 3px rgba(0,0,0,0.06)",
                            transition: "all 0.18s ease",
                          }}
                        >
                          {/* color swatch */}
                          {type === "Color" && variant.hex && (
                            <span style={{
                              width: 16, height: 16, borderRadius: "50%",
                              background: variant.hex,
                              border: "1.5px solid rgba(0,0,0,0.12)",
                              display: "block",
                            }} />
                          )}
                          <span style={{
                            fontSize: oos ? 11 : 13,
                            fontWeight: 700,
                            color: isSelected ? "#fff" : oos ? "#94a3b8" : "#1e293b",
                            textDecoration: oos ? "line-through" : "none",
                            lineHeight: 1.2,
                          }}>
                            {variant.value}
                          </span>
                          {showPrice && (
                            <span style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: isSelected ? "rgba(255,255,255,0.85)" : "#5FA800",
                              lineHeight: 1,
                            }}>
                              Rs.{vPrice!.toLocaleString()}
                            </span>
                          )}
                          {isSelected && (
                            <span style={{
                              position: "absolute", top: 3, right: 3,
                              width: 14, height: 14, borderRadius: "50%",
                              background: "rgba(255,255,255,0.3)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <Check style={{ width: 9, height: 9, color: "#fff" }} />
                            </span>
                          )}
                          {oos && (
                            <span style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1 }}>Out of stock</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "#f1f5f9", margin: "0 16px 16px" }} />

          {/* Quantity */}
          <div style={{ padding: "0 16px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
                Quantity
              </p>
              <p style={{ fontSize: 12, color: "#64748b" }}>
                {qty} × Rs.{price.toLocaleString()}
              </p>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              background: "#f8fafc", borderRadius: 14,
              border: "1.5px solid #e2e8f0",
              overflow: "hidden",
            }}>
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                style={{
                  width: 44, height: 44,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "none", cursor: "pointer",
                  color: qty === 1 ? "#cbd5e1" : "#475569",
                }}
              >
                <Minus style={{ width: 16, height: 16 }} />
              </button>
              <span style={{
                width: 40, textAlign: "center",
                fontSize: 16, fontWeight: 800, color: "#1e293b",
              }}>
                {qty}
              </span>
              <button
                onClick={() => setQty(q => q + 1)}
                style={{
                  width: 44, height: 44,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#5FA800", border: "none", cursor: "pointer",
                  color: "#fff",
                }}
              >
                <Plus style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        </div>

        {/* Fixed bottom CTA */}
        <div style={{
          flexShrink: 0,
          padding: "12px 16px",
          paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
          background: "#fff",
          borderTop: "1px solid #f1f5f9",
        }}>
          {/* Total row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#f8fafc", borderRadius: 12,
            padding: "10px 14px", marginBottom: 10,
          }}>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Total Amount</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>
              Rs. {total.toLocaleString()}
            </span>
          </div>

          {anyOOS && allSelected && (
            <p style={{ fontSize: 12, color: "#ef4444", textAlign: "center", marginBottom: 8 }}>
              Selected option is currently out of stock
            </p>
          )}

          <button
            onClick={handleAdd}
            disabled={!canAdd}
            style={{
              width: "100%",
              height: 54,
              borderRadius: 14,
              border: "none",
              cursor: canAdd ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontWeight: 800,
              fontSize: 15,
              color: "#fff",
              background: added
                ? "linear-gradient(135deg,#22c55e 0%,#16a34a 100%)"
                : !canAdd
                ? "#94a3b8"
                : "linear-gradient(135deg,#5FA800 0%,#3d7000 100%)",
              boxShadow: canAdd && !added ? "0 4px 16px rgba(95,168,0,0.35)" : "none",
              transition: "all 0.25s ease",
              letterSpacing: "0.01em",
            }}
          >
            {added ? (
              <>
                <PackageCheck style={{ width: 20, height: 20 }} />
                Added to Cart!
              </>
            ) : (
              <>
                <ShoppingCart style={{ width: 20, height: 20 }} />
                Add to Cart · Rs. {total.toLocaleString()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
