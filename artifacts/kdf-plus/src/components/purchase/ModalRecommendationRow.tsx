import { Link } from "wouter";
import type { Product } from "@workspace/api-client-react";
import { getProductImageSrc } from "@/lib/imageUrl";
import { KdfCarousel } from "@/components/carousel/KdfCarousel";

export function ModalRecommendationRow({
  products,
  title = "You may also like",
}: {
  products: Product[];
  title?: string;
}) {
  if (products.length === 0) return null;

  return (
    <div className="kdf-modal-rec">
      <p className="kdf-modal-rec__label">{title}</p>
      <KdfCarousel
        mode="peek"
        itemCount={products.length}
        loopCopies={1}
        autoScroll={false}
        forceNativeScroll
        resumeMs={4000}
        fadeColor="#fff"
        showArrows={products.length > 2}
        className="kdf-modal-rec__carousel kdf-carousel--drawer"
      >
        {products.map((product, i) => {
          const price = parseFloat(product.price);
          const img = product.images?.[0]
            ? getProductImageSrc(product.images[0], { maxWidth: 200 })
            : null;
          const slug = (product as { slug?: string }).slug || String(product.id);
          return (
            <Link
              key={`${product.id}-${i}`}
              href={`/products/${slug}`}
              className="kdf-modal-rec__card"
            >
              <div className="kdf-modal-rec__img">
                {img ? (
                  <img
                    src={img}
                    alt=""
                    className="kdf-modal-rec__img-el"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                ) : (
                  <span className="text-lg font-black text-[#5FA800]/25">
                    {product.name?.[0]}
                  </span>
                )}
              </div>
              <p className="kdf-modal-rec__name">{product.name}</p>
              <p className="kdf-modal-rec__price">Rs. {price.toLocaleString()}</p>
            </Link>
          );
        })}
      </KdfCarousel>
    </div>
  );
}
