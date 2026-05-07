import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { Trash2, Plus, Minus, ShoppingBag, Tag, ArrowRight, ArrowLeft } from "lucide-react";
import { useCart } from "@/context/CartContext";
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
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
          <p className="text-muted-foreground mb-6">Add some delicious nuts and dry fruits to get started.</p>
          <Link href="/products">
            <Button size="lg" data-testid="button-shop-now">Start Shopping</Button>
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`Cart (${items.length}) — KDF Plus`}</title>
      </Helmet>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="text-cart-title">
            Shopping Cart <span className="text-muted-foreground font-normal text-lg">({items.length} {items.length === 1 ? "item" : "items"})</span>
          </h1>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={clearCart}
            data-testid="button-clear-cart"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => {
              const activeVariant = item.variantId
                ? item.product.variants?.find((v) => v.id === item.variantId)
                : undefined;
              const price = activeVariant?.price ? parseFloat(activeVariant.price) : parseFloat(item.product.price);
              const imageUrl = getProductImageSrc(item.product.images?.[0]);
              return (
                <div
                  key={`${item.product.id}-${item.variantId}`}
                  className="flex gap-4 bg-white border border-border rounded-xl p-4"
                  data-testid={`cart-item-${item.product.id}`}
                >
                  <Link href={`/product/${item.product.id}`} className="flex-shrink-0">
                    <img
                      src={imageUrl}
                      alt={item.product.name}
                      loading="lazy"
                      className="w-20 h-20 rounded-lg object-cover bg-muted/20"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/product/${item.product.id}`}>
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
                      <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1">
                        <button
                          onClick={() => updateQty(item.product.id, item.quantity - 1, item.variantId)}
                          className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted"
                          data-testid={`button-cart-decrement-${item.product.id}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold" data-testid={`text-cart-qty-${item.product.id}`}>{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.product.id, item.quantity + 1, item.variantId)}
                          className="w-6 h-6 rounded flex items-center justify-center hover:bg-muted"
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
          </div>

          {/* Order Summary */}
          <div className="space-y-4">
            {/* Coupon */}
            <div className="bg-white border border-border rounded-xl p-4">
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
            <div className="bg-white border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-semibold">Order Summary</h3>
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
                className="w-full font-semibold"
                size="lg"
                onClick={() => setLocation("/checkout")}
                data-testid="button-checkout"
              >
                Proceed to Checkout <ArrowRight className="ml-2 w-4 h-4" />
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
