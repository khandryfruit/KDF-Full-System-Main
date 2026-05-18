import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { Trash2, Plus, Minus, ShoppingBag, Tag, ArrowRight, ArrowLeft, ShieldCheck, Truck } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useProductRecommendations } from "@/components/ProductRecommendations";
import { ModalRecommendationRow } from "@/components/purchase/ModalRecommendationRow";
import { useValidateCoupon } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const DELIVERY_FEE = 150;
const FREE_DELIVERY_THRESHOLD = 1500;

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { items, updateQty, removeItem, clearCart, totalPrice } = useCart();
  const cartProductIds = items.map((item) => item.product.id);
  const { data: cartRecs } = useProductRecommendations({
    context: "cart",
    cartProductIds,
    limit: 8,
    enabled: items.length > 0,
  });
  const { toast } = useToast();

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; type: string } | null>(null);

  const validateCoupon = useValidateCoupon();

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) return;
    validateCoupon.mutate(
      { data: { code: couponCode.trim().toUpperCase(), orderTotal: totalPrice.toString() } },
      {
        onSuccess: (data) => {
          const discountAmt = parseFloat(data.discount || "0");
          const couponType = data.coupon?.type ?? "fixed";
          setAppliedCoupon({ code: couponCode.trim().toUpperCase(), discount: discountAmt, type: couponType });
          toast({ title: "Coupon applied!", description: `You saved Rs. ${discountAmt.toLocaleString()}` });
        },
        onError: () => {
          toast({ title: "Invalid coupon", description: "This coupon code is not valid or has expired.", variant: "destructive" });
        },
      }
    );
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
  };

  const deliveryFee = totalPrice >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const couponDiscount = appliedCoupon?.discount ?? 0;
  const grandTotal = totalPrice - couponDiscount + deliveryFee;

  if (items.length === 0) {
    return (
      <>
        <Helmet>
          <title>Cart — KDF Plus</title>
        </Helmet>
        <main className="mx-auto max-w-2xl px-4 py-12 md:py-16 lg:px-6">
          <div className="rounded-[1.75rem] border border-gray-100/90 bg-white/90 px-8 py-14 text-center shadow-lg shadow-slate-900/[0.04] ring-1 ring-black/[0.04] backdrop-blur-xl md:px-12 md:py-16">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#5FA800]/10 ring-1 ring-[#5FA800]/20 md:h-24 md:w-24">
              <ShoppingBag className="h-10 w-10 text-[#5FA800] md:h-12 md:w-12" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">Your cart is empty</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground md:text-base">
              Add premium nuts and dry fruits — your picks will appear here with live totals.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground md:gap-4 md:text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 font-medium text-slate-600">
                <Truck className="h-3.5 w-3.5 text-[#5FA800]" /> Free delivery Rs. 1,500+
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 font-medium text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 text-[#5FA800]" /> Secure checkout
              </span>
            </div>
            <Link href="/products" className="mt-8 inline-block">
              <Button
                size="lg"
                className="rounded-xl px-8 font-semibold shadow-lg shadow-[#5FA800]/25 transition-[transform,box-shadow] duration-300 hover:scale-[1.02] active:scale-[0.98] md:min-w-[200px]"
                style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }}
                data-testid="button-shop-now"
              >
                Start Shopping
              </Button>
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`Cart (${items.length}) — KDF Plus`}</title>
      </Helmet>

      <main className="kdf-page-shell px-4 py-6 pb-24 sm:px-6 sm:pb-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight md:text-3xl" data-testid="text-cart-title">
              Shopping Cart{" "}
              <span className="text-lg font-semibold text-muted-foreground md:text-xl">
                ({items.length} {items.length === 1 ? "item" : "items"})
              </span>
            </h1>
            <p className="mt-1 hidden text-sm text-muted-foreground md:block">Review your order before checkout — totals update instantly.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 self-start text-xs text-muted-foreground hover:text-destructive md:text-sm"
            onClick={clearCart}
            data-testid="button-clear-cart"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear All
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Items */}
          <div className="space-y-3 md:space-y-4 lg:col-span-2">
            {items.map((item) => {
              const activeVariant = item.variantId
                ? item.product.variants?.find((v) => v.id === item.variantId)
                : undefined;
              const price = activeVariant?.price ? parseFloat(activeVariant.price) : parseFloat(item.product.price);
              const imageUrl = getProductImageSrc(item.product.images?.[0]);
              return (
                <div
                  key={`${item.product.id}-${item.variantId}`}
                  className="group flex gap-4 rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-md shadow-slate-900/[0.03] ring-1 ring-black/[0.04] backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-[#5FA800]/25 hover:shadow-xl hover:shadow-[#5FA800]/10 md:gap-5 md:rounded-[1.75rem] md:p-5"
                  data-testid={`cart-item-${item.product.id}`}
                >
                  <Link href={`/products/${(item.product as any).slug || item.product.id}`} className="flex-shrink-0">
                    <img
                      src={imageUrl}
                      alt={item.product.name}
                      loading="lazy"
                      className="h-20 w-20 rounded-xl bg-muted/20 object-cover ring-1 ring-black/[0.04] transition-transform duration-300 group-hover:scale-[1.02] md:h-24 md:w-24 md:rounded-2xl"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/products/${(item.product as any).slug || item.product.id}`}>
                      <h3 className="font-semibold text-sm line-clamp-2 hover:text-primary transition-colors" data-testid={`text-cart-item-name-${item.product.id}`}>
                        {item.product.name}
                      </h3>
                    </Link>
                    {item.variantId && activeVariant && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activeVariant.name}: {activeVariant.value}
                      </p>
                    )}
                    {item.product.weight && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.product.weight}</p>
                    )}
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                      {/* Qty controls */}
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/50 px-2 py-1 md:px-2.5">
                        <button
                          onClick={() => updateQty(item.product.id, item.quantity - 1, item.variantId)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white md:h-8 md:w-8"
                          data-testid={`button-cart-decrement-${item.product.id}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold" data-testid={`text-cart-qty-${item.product.id}`}>{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.product.id, item.quantity + 1, item.variantId)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white md:h-8 md:w-8"
                          data-testid={`button-cart-increment-${item.product.id}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm" data-testid={`text-cart-item-total-${item.product.id}`}>
                          Rs. {(price * item.quantity).toLocaleString()}
                        </span>
                        <button
                          onClick={() => removeItem(item.product.id, item.variantId)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          data-testid={`button-cart-remove-${item.product.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {cartRecs?.cartUpsells?.length ? (
              <ModalRecommendationRow
                title="Popular add-ons before checkout"
                products={cartRecs.cartUpsells.slice(0, 8)}
              />
            ) : null}
          </div>

          {/* Order Summary */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start lg:space-y-5">
            {/* Coupon */}
            <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-lg shadow-slate-900/[0.04] ring-1 ring-black/[0.04] backdrop-blur-xl md:rounded-[1.75rem] md:p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" /> Coupon Code
              </h3>
              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs font-bold text-green-700">{appliedCoupon.code}</p>
                    <p className="text-xs text-green-600">- Rs. {appliedCoupon.discount.toLocaleString()}</p>
                  </div>
                  <button onClick={removeCoupon} className="text-xs text-muted-foreground hover:text-destructive" data-testid="button-remove-coupon">
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="h-9 text-sm font-mono"
                    data-testid="input-coupon"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleApplyCoupon}
                    disabled={validateCoupon.isPending || !couponCode.trim()}
                    data-testid="button-apply-coupon"
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="space-y-4 rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-lg shadow-slate-900/[0.04] ring-1 ring-black/[0.04] backdrop-blur-xl md:rounded-[1.75rem] md:p-5">
              <h3 className="text-base font-bold tracking-tight md:text-lg">Order Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span data-testid="text-subtotal">Rs. {totalPrice.toLocaleString()}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon Discount</span>
                    <span data-testid="text-coupon-discount">- Rs. {couponDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span data-testid="text-delivery-fee">
                    {deliveryFee === 0 ? (
                      <span className="text-green-600 font-medium">FREE</span>
                    ) : (
                      `Rs. ${deliveryFee}`
                    )}
                  </span>
                </div>
                {totalPrice < FREE_DELIVERY_THRESHOLD && (
                  <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-lg">
                    Add Rs. {(FREE_DELIVERY_THRESHOLD - totalPrice).toLocaleString()} more for free delivery
                  </p>
                )}
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span data-testid="text-grand-total">Rs. {grandTotal.toLocaleString()}</span>
              </div>
              <Button
                className="w-full rounded-xl font-semibold shadow-lg shadow-[#5FA800]/20 transition-[transform,box-shadow] duration-300 hover:scale-[1.01] active:scale-[0.99]"
                size="lg"
                style={{ background: "linear-gradient(135deg, #5FA800 0%, #3d7000 100%)" }}
                onClick={() => setLocation("/checkout")}
                data-testid="button-checkout"
              >
                Proceed to Checkout <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Link href="/products">
                <Button variant="ghost" size="sm" className="w-full text-muted-foreground" data-testid="link-continue-shopping">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Continue Shopping
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
