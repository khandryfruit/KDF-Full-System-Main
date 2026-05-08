import { useState } from 'react';
import { X, Plus, Minus, ShoppingCart, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { getProductImageSrc } from '../lib/imageUrl';

interface Variant {
  id: string;
  name: string;
  value: string;
  price?: string;
  stock: number;
  hex?: string;
}

export interface VariantProduct {
  id: number;
  name: string;
  price: string | number;
  images?: string[];
  gradient?: string;
  variants?: Variant[];
}

interface Props {
  product: VariantProduct;
  onClose: () => void;
}

function getGroups(variants: Variant[]) {
  const order: string[] = [];
  const map = new Map<string, Variant[]>();
  for (const v of variants) {
    if (!map.has(v.name)) { map.set(v.name, []); order.push(v.name); }
    map.get(v.name)!.push(v);
  }
  return order.map(type => ({ type, items: map.get(type)! }));
}

export function VariantPickerModal({ product, onClose }: Props) {
  const { addItem } = useCart();
  const variants = product.variants ?? [];
  const groups = getGroups(variants);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, Variant>>(() => {
    const init: Record<string, Variant> = {};
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
  const price = priceVariant ? parseFloat(priceVariant.price!) : Number(product.price);
  const allGroupsSelected = groups.every(g => selectedByGroup[g.type]);
  const anyOutOfStock = selectedValues.some(v => v.stock === 0);

  const handleAdd = () => {
    if (!allGroupsSelected || anyOutOfStock) return;
    const primaryVariant = selectedValues[0];
    const variantLabel = selectedValues.map(v => v.value).join(', ');
    const image = product.images?.[0];
    addItem({
      id: product.id,
      name: product.name,
      variant: variantLabel,
      variantId: primaryVariant?.id,
      price,
      qty,
      gradient: product.gradient || 'from-green-400 to-emerald-600',
      image,
    });
    setAdded(true);
    setTimeout(() => onClose(), 600);
  };

  const imageUrl = product.images?.[0] ? getProductImageSrc(product.images[0]) : null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[500] flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-[430px] rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col"
        style={{ maxHeight: 'calc(100dvh - 48px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
          <h3 className="font-bold text-gray-900 text-base">Choose Options</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product info */}
        <div className="flex gap-3 px-5 pb-4 flex-shrink-0">
          <div
            className={`w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden bg-gradient-to-br ${product.gradient || 'from-green-400 to-emerald-600'}`}
          >
            {imageUrl && (
              <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
            <p className="text-lg font-bold mt-1" style={{ color: '#5FA800' }}>
              Rs. {price.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="h-px bg-gray-100 flex-shrink-0" />

        {/* Scrollable middle section */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Variants */}
          {groups.length > 0 && (
            <div className="px-5 py-4 space-y-5">
              {groups.map(({ type, items }) => (
                <div key={type}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{type}</p>
                    {selectedByGroup[type]?.price && parseFloat(selectedByGroup[type].price!) > 0 && (
                      <span className="text-sm font-bold" style={{ color: '#5FA800' }}>
                        Rs. {parseFloat(selectedByGroup[type].price!).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map(v => {
                      const isSelected = selectedByGroup[type]?.id === v.id;
                      const outOfStock = v.stock === 0;
                      return type === 'Color' ? (
                        <button
                          key={v.id}
                          title={v.value}
                          onClick={() => !outOfStock && setSelectedByGroup(prev => ({ ...prev, [type]: v }))}
                          disabled={outOfStock}
                          className={`w-10 h-10 rounded-full border-[3px] transition-all ${
                            isSelected ? 'border-[#5FA800] scale-110 shadow-md' : 'border-white shadow'
                          } ${outOfStock ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
                          style={{ backgroundColor: v.hex || '#ccc' }}
                        />
                      ) : (
                        <button
                          key={v.id}
                          onClick={() => !outOfStock && setSelectedByGroup(prev => ({ ...prev, [type]: v }))}
                          disabled={outOfStock}
                          className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all active:scale-95 ${
                            isSelected
                              ? 'text-white border-transparent shadow-md'
                              : outOfStock
                              ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                              : 'text-gray-700 border-gray-200 hover:border-[#5FA800] hover:text-[#5FA800]'
                          }`}
                          style={isSelected ? { backgroundColor: '#5FA800', borderColor: '#5FA800' } : {}}
                        >
                          {v.value}
                          {outOfStock && <span className="ml-1 text-[9px] opacity-60">Out</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="h-px bg-gray-100" />

          {/* Quantity */}
          <div className="px-5 py-4 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</p>
            <div className="flex items-center gap-4 bg-gray-100 rounded-2xl px-3 py-1.5">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-700 bg-white shadow-sm active:scale-90 transition-all"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-base font-bold text-gray-900 w-5 text-center">{qty}</span>
              <button
                onClick={() => setQty(q => q + 1)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90 transition-all"
                style={{ backgroundColor: '#5FA800' }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sticky CTA — always visible above everything */}
        <div
          className="flex-shrink-0 px-5 pt-3 pb-5 border-t border-gray-100 bg-white"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          {/* Total row */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500 font-medium">Total</span>
            <span className="text-xl font-bold text-gray-900">Rs. {(price * qty).toLocaleString()}</span>
          </div>

          {anyOutOfStock && allGroupsSelected && (
            <p className="text-xs text-red-500 text-center mb-2">Selected option is out of stock</p>
          )}

          <button
            onClick={handleAdd}
            disabled={added || !allGroupsSelected || anyOutOfStock}
            className="w-full h-[52px] rounded-2xl font-bold text-[15px] text-white flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: added
                ? '#22c55e'
                : 'linear-gradient(135deg,#5FA800 0%,#3d7000 100%)',
              boxShadow: added ? 'none' : '0 4px 16px rgba(95,168,0,0.35)',
            }}
          >
            {added ? (
              <><Check className="w-5 h-5" />Added to Cart!</>
            ) : (
              <><ShoppingCart className="w-5 h-5" />Add to Cart · Rs. {(price * qty).toLocaleString()}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
