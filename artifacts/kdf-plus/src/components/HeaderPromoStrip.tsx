import { useListBanners, type Banner } from "@workspace/api-client-react";
import { Link } from "wouter";
import { getProductImageSrc } from "@/lib/imageUrl";
import { asArrayFromApi } from "@/lib/asArrayFromApi";

/**
 * Slim optional strip under the main header — driven by banners with
 * `placement: "header"` from the API (separate from home hero carousel).
 */
export function HeaderPromoStrip() {
  const { data, isLoading } = useListBanners({
    platform: "website",
    placement: "header",
  });
  const rows = asArrayFromApi<Banner>(data);
  if (isLoading || rows.length === 0) return null;

  return (
    <div className="w-full bg-[#0d2b00]/[0.06] border-b border-gray-200/80">
      <div className="kdf-page-shell flex items-center gap-3 overflow-x-auto px-3 sm:px-6 py-1.5 [scrollbar-width:thin]">
        {rows.map((b) => {
          const href = b.linkUrl?.trim() || "/products";
          const safeHref = href.startsWith("/") ? href : `/${href}`;
          return (
            <Link
              key={b.id}
              href={safeHref}
              className="shrink-0 block rounded-md overflow-hidden ring-1 ring-black/5 hover:ring-[#5FA800]/40 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5FA800]"
            >
              <img
                src={getProductImageSrc(b.imageUrl ?? undefined)}
                alt={b.title ?? ""}
                className="h-9 sm:h-10 w-auto max-w-[min(100vw-2rem,520px)] object-cover object-center"
                loading="lazy"
                decoding="async"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
