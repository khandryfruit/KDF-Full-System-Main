
import { useLocation } from "wouter";
import { X, ShoppingCart, Plus, Minus, Trash2, ArrowRight, ShoppingBag, Package } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { ProductRecommendationStrip, useProductRecommendations } from "@/components/ProductRecommendations";
import { getCartItemUnitPrice } from "@/lib/cartPricing";
import { getProductImageSrc } from "@/lib/imageUrl";

const GREEN = "#5FA800";

export function MiniCart() {
  const [, setLocation] = useLocation();
  const { items, miniCartOpen, setMiniCartOpen, totalItems, totalPrice, updateQty, removeItem, lastAdded } = useCart();
  const cartProductIds = items.map((item) => item.product.id);
  const { data: recs } = useProductRecommendations({
    context: "cart",
    cartProductIds,
    limit: 8,
    enabled: miniCartOpen && items.length > 0,
  });

  const handleViewCart = () => { setMiniCartOpen(false); setLocation("/cart"); };
  const handleCheckout = () => { setMiniCartOpen(false); setLocation("/checkout"); };

  if (!miniCartOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[550] bg-black/40 backdrop-blur-[2px]"
        onClick={() => setMiniCartOpen(false)}
      />

      {/* Panel
          mobile  : bottom sheet (bottom-0 left-0 right-0, rounded-t-2xl)
          desktop : right sidebar (top-0 right-0 h-full w-[400px])
      */}
      <div
        className="
          fixed z-[600] bg-white shadow-2xl flex flex-col
          bottom-0 left-0 right-0 rounded-t-2xl
          md:bottom-auto md:top-0 md:left-auto md:right-0 md:h-full md:w-[400px] md:rounded-none md:rounded-l-2xl
          animate-in slide-in-from-bottom-4 md:slide-in-from-right-0 duration-300
        "
        style={{
          maxHeight: "min(88vh, 680px)",
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #0d2b00 0%, #1a4000 100%)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: GREEN }}>
              <ShoppingBag className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-white text-sm">Your Cart</span>
            <span className="text-xs text-white/60">({totalItems} {totalItems === 1 ? "item" : "items"})</span>
          </div>
          <button
            onClick={() => setMiniCartOpen(false)}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        </div>

        {/* ── Added banner ── */}
        {lastAdded && (
          <div
            className="mx-3 mt-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-2 flex-shrink-0"
            style={{ backgroundColor: GREEN }}
          >
            <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">"{lastAdded.product.name}" added!</span>
          </div>
        )}

        {/* ── Items (scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 overscroll-contain">
          {items.length === 0 ? (
            <div className="text-center py-10 text-gray-400 flex flex-col items-center gap-3">
              <Package className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">Your cart is empty</p>
              <button
                onClick={() => { setMiniCartOpen(false); setLocation("/products"); }}
                className="text-xs font-semibold px-4 py-2 rounded-xl transition-all"
                style={{ background: `${GREEN}18`, color: GREEN }}
              >
                Browse Products
              </button>
            </div>
          ) : (
            items.map((item, idx) => {
              const unitPrice = getCartItemUnitPrice(item);
              const imageUrl = getProductImageSrc(item.product.images?.[0]);
              return (
                <div
                  key={`${item.product.id}-${item.variantId ?? ""}-${idx}`}
                  className="flex gap-2.5 bg-gray-50 rounded-xl p-2.5"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    <img src={imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-1">{item.product.name}</p>
                    {item.variantLabel && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.variantLabel}</p>
                    )}
                    <p className="text-sm font-bold mt-0.5" style={{ color: GREEN }}>
                      Rs. {(unitPrice * item.quantity).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity - 1, item.variantId)}
                        className="w-5 h-5 rounded-full flex items-center justify-center border border-gray-300 text-gray-600 hover:border-gray-500 transition-colors"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span className="text-xs font-bold text-gray-800 w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity + 1, item.variantId)}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white transition-colors"
                        style={{ backgroundColor: GREEN }}
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                      <button
                        onClick={() => removeItem(item.product.id, item.variantId)}
                        className="ml-auto w-5 h-5 rounded-full flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {items.length > 0 && recs?.cartUpsells?.length ? (
            <div className="rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-gray-100">
              <ProductRecommendationStrip
                title="Complete your cart"
                subtitle="Popular add-ons customers buy together"
                products={recs.cartUpsells}
                compact
              />
            </div>
          ) : null}
        </div>

        {/* ── Sticky Footer (checkout) ── */}
        {items.length > 0 && (
          <div
            className="flex-shrink-0 border-t border-gray-100 px-3 pt-3 bg-white"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            {/* Subtotal row */}
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-xs text-gray-500 font-medium">Subtotal ({totalItems} items)</span>
              <span className="text-base font-extrabold text-gray-900">Rs. {totalPrice.toLocaleString()}</span>
            </div>

            {/* CTA row: View Cart + Checkout */}
            <div className="flex gap-2">
              <button
                onClick={handleViewCart}
                className="flex-1 h-9 text-xs font-semibold rounded-xl border-2 flex items-center justify-center transition-all hover:bg-gray-50"
                style={{ borderColor: GREEN, color: GREEN }}
              >
                View Cart
              </button>
              <button
                onClick={handleCheckout}
                data-testid="button-mini-cart-checkout"
                className="flex-[2] h-9 text-xs font-bold text-white rounded-xl flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #3d7000 100%)` }}
              >
                Checkout <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Reassurance strip */}
            <p className="text-center text-[10px] text-gray-400 mt-2">
              🔒 Secure checkout · 🚚 Fast delivery · ✅ Easy returns
            </p>
          </div>
        )}
      </div>
    </>
  );
}
