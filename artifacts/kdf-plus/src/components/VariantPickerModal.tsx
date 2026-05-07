import { useState } from "react";
import { X, Plus, Minus, ShoppingCart, Check } from "lucide-react";
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

  const groups = getGroups(product.variants ?? []);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, ProductVariant>>(() => {
    const init: Record<string, ProductVariant> = {};
    for (const g of groups) {
      const first = g.items.find(v => v.stock > 0) ?? g.items[0];
      if (first) init[g.type] = first;
    }
    return init;
  });

  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selectedValues = Object.values(selectedByGroup);
  const priceVariant = selectedValues.find(v => v.price && parseFloat(v.price) > 0);
  const price = priceVariant ? parseFloat(priceVariant.price!) : parseFloat(product.price);

  const allGroupsSelected = groups.every(g => selectedByGroup[g.type]);
  const anyOutOfStock = selectedValues.some(v => v.stock === 0);

  const handleAdd = () => {
    if (!allGroupsSelected || anyOutOfStock) return;
    const firstVariant = selectedValues[0];
    const variantLabel = selectedValues
      .map(v => `${v.name}: ${v.value}`)
      .join(", ");
    addItem(product, qty, firstVariant?.id, variantLabel);
    setAdded(true);
    setTimeout(() => { onClose(); }, 600);
  };

  const imageUrl = getProductImageSrc(product.images?.[0]);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900 text-base">Choose Options</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product info */}
        <div className="flex gap-3 px-5 pb-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 line-clamp-2">{product.name}</p>
            <p className="text-base font-bold mt-1" style={{ color: "#5FA800" }}>
              Rs. {price.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="border-t" />

        {/* Grouped Variants */}
        {groups.length > 0 && (
          <div className="px-5 py-4 space-y-4 max-h-64 overflow-y-auto">
            {groups.map(({ type, items }) => (
              <div key={type}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                  {type}
                  {selectedByGroup[type] && (
                    <span className="ml-2 normal-case font-normal text-gray-400">
                      — {selectedByGroup[type].value}
                      {selectedByGroup[type].price && (
                        <span className="ml-1" style={{ color: "#5FA800" }}>
                          Rs. {parseFloat(selectedByGroup[type].price!).toLocaleString()}
                        </span>
                      )}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {items.map((variant) => {
                    const isSelected = selectedByGroup[type]?.id === variant.id;
                    const outOfStock = variant.stock === 0;
                    return (
                      <button
                        key={variant.id}
                        onClick={() => !outOfStock && setSelectedByGroup(prev => ({ ...prev, [type]: variant }))}
                        disabled={outOfStock}
                        className={`
                          relative px-3.5 py-2 rounded-xl text-sm font-medium border-2 transition-all
                          ${isSelected
                            ? "text-white border-transparent"
                            : outOfStock
                            ? "text-gray-300 border-gray-200 cursor-not-allowed line-through"
                            : "text-gray-700 border-gray-200 hover:border-gray-400"
                          }
                        `}
                        style={isSelected ? { backgroundColor: "#5FA800", borderColor: "#5FA800" } : {}}
                      >
                        {isSelected && (
                          <Check className="w-3 h-3 absolute top-0.5 right-0.5" />
                        )}
                        {type === "Color" && variant.hex && (
                          <span
                            className="inline-block w-3 h-3 rounded-full mr-1.5 border border-gray-300 align-middle"
                            style={{ backgroundColor: variant.hex }}
                          />
                        )}
                        {variant.value}
                        {outOfStock && (
                          <span className="ml-1 text-[10px] text-gray-400">Out</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t" />

        {/* Quantity */}
        <div className="px-5 py-4 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</p>
          <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-2 py-1">
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm font-bold text-gray-900 w-6 text-center">{qty}</span>
            <button
              onClick={() => setQty(q => q + 1)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white transition-colors"
              style={{ backgroundColor: "#5FA800" }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Total & Add */}
        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm text-gray-600">Total</span>
            <span className="text-base font-bold text-gray-900">
              Rs. {(price * qty).toLocaleString()}
            </span>
          </div>

          {anyOutOfStock && allGroupsSelected && (
            <p className="text-xs text-red-500 text-center">Selected option is out of stock</p>
          )}

          <button
            onClick={handleAdd}
            disabled={added || !allGroupsSelected || anyOutOfStock}
            className="w-full h-12 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{
              background: added
                ? "#22c55e"
                : "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)",
            }}
          >
            {added ? (
              <>
                <Check className="w-5 h-5" />
                Added to Cart!
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                Add to Cart · Rs. {(price * qty).toLocaleString()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
