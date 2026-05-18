import { Plus } from "lucide-react";
import { Link } from "wouter";
import type { Product } from "@workspace/api-client-react";
import { useCart } from "@/context/CartContext";
import { getProductImageSrc } from "@/lib/imageUrl";

export function CheckoutUpsellRow({ products }: { products: Product[] }) {
  const { addItem, items } = useCart();
  const inCart = new Set(items.map((i) => i.product.id));
  const visible = products.filter((p) => !inCart.has(p.id)).slice(0, 2);

  if (visible.length === 0) return null;

  return (
    <details className="kdf-checkout-upsell kdf-checkout-upsell--secondary">
      <summary className="kdf-checkout-upsell__summary">Add item (optional)</summary>
      <div className="kdf-checkout-upsell__row">
        {visible.map((product) => {
          const price = parseFloat(product.price);
          const img = product.images?.[0] ? getProductImageSrc(product.images[0], { maxWidth: 80 }) : null;
          const slug = (product as { slug?: string }).slug || String(product.id);
          const hasVariants = (product.variants?.length ?? 0) > 0;

          return (
            <div key={product.id} className="kdf-checkout-upsell__card">
              <Link href={`/products/${slug}`} className="kdf-checkout-upsell__thumb">
                {img ? (
                  <img
                    src={img}
                    alt=""
                    className="kdf-checkout-upsell__thumb-img"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-[#5FA800]/30">{product.name?.[0]}</span>
                )}
              </Link>
              <div className="kdf-checkout-upsell__meta min-w-0 flex-1">
                <Link href={`/products/${slug}`} className="kdf-checkout-upsell__name">
                  {product.name}
                </Link>
                <p className="kdf-checkout-upsell__price">Rs. {price.toLocaleString()}</p>
              </div>
              {hasVariants ? (
                <Link
                  href={`/products/${slug}`}
                  className="kdf-checkout-upsell__btn kdf-checkout-upsell__btn--link"
                >
                  Pick
                </Link>
              ) : (
                <button
                  type="button"
                  className="kdf-checkout-upsell__btn"
                  onClick={() => addItem(product, 1)}
                  aria-label={`Add ${product.name} to cart`}
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
