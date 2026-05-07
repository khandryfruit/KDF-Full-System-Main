
import { useLocation } from "wouter";
import { X, ShoppingCart, Plus, Minus, Trash2, ArrowRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { getProductImageSrc } from "@/lib/imageUrl";
import { Button } from "@/components/ui/button";

export function MiniCart() {
  const [, setLocation] = useLocation();
  const { items, miniCartOpen, setMiniCartOpen, totalItems, totalPrice, updateQty, removeItem, lastAdded } = useCart();

  const handleViewCart = () => {
    setMiniCartOpen(false);
    setLocation("/cart");
  };

  const handleCheckout = () => {
    setMiniCartOpen(false);
    setLocation("/checkout");
  };

  if (!miniCartOpen) return null;

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        className="fixed inset-0 bg-black/30 z-40 md:hidden"
        onClick={() => setMiniCartOpen(false)}
      />
      {/* Backdrop — desktop */}
      <div
        className="fixed inset-0 z-40 hidden md:block"
        onClick={() => setMiniCartOpen(false)}
      />

      {/* Panel — desktop: slide from right */}
      <div
        className="
          fixed z-50
          md:top-0 md:right-0 md:h-full md:w-[400px] md:bottom-auto md:left-auto md:rounded-none md:rounded-l-2xl
          bottom-0 left-0 right-0 md:top-auto rounded-t-2xl
          bg-white shadow-2xl flex flex-col
          animate-in
          md:slide-in-from-right-0
          slide-in-from-bottom-4
          duration-300
        "
        style={{
          maxHeight: "calc(100vh - 56px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" style={{ color: "#5FA800" }} />
            <span className="font-bold text-gray-900">Your Cart</span>
            <span className="text-sm text-gray-500">({totalItems} {totalItems === 1 ? "item" : "items"})</span>
          </div>
          <button
            onClick={() => setMiniCartOpen(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Added confirmation banner */}
        {lastAdded && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-xl text-sm font-medium text-white flex items-center gap-2" style={{ backgroundColor: "#5FA800" }}>
            <ShoppingCart className="w-4 h-4 flex-shrink-0" />
            <span>"{lastAdded.product.name}" added to cart!</span>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Your cart is empty</p>
            </div>
          ) : (
            items.map((item, idx) => {
              const price = parseFloat(item.product.price) || 0;
              const imageUrl = getProductImageSrc(item.product.images?.[0]);
              return (
                <div key={`${item.product.id}-${item.variantId ?? ""}-${idx}`} className="flex gap-3 bg-gray-50 rounded-xl p-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    <img src={imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.product.name}</p>
                    {item.variantLabel && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.variantLabel}</p>
                    )}
                    <p className="text-sm font-bold mt-1" style={{ color: "#5FA800" }}>
                      Rs. {(price * item.quantity).toLocaleString()}
                    </p>
                    {/* Qty controls */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity - 1, item.variantId)}
                        className="w-6 h-6 rounded-full flex items-center justify-center border border-gray-300 hover:border-gray-500 text-gray-600 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-bold text-gray-800 w-5 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity + 1, item.variantId)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-colors"
                        style={{ backgroundColor: "#5FA800" }}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeItem(item.product.id, item.variantId)}
                        className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-4 pb-5 pt-3 border-t space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 font-medium">Subtotal</span>
              <span className="text-base font-bold text-gray-900">Rs. {totalPrice.toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-10 text-sm"
                onClick={() => setMiniCartOpen(false)}
              >
                Continue
              </Button>
              <button
                onClick={handleViewCart}
                className="flex-1 h-10 text-sm font-semibold text-white rounded-lg border-2 flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#5FA800", borderColor: "#5FA800" }}
              >
                View Cart
              </button>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full h-11 text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }}
            >
              Checkout Now <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
