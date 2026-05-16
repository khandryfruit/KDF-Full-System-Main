import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useMemo, type ReactNode } from "react";
import { useKdfCarousel, type KdfCarouselMode, type UseKdfCarouselOptions } from "./useKdfCarousel";

export interface KdfCarouselProps extends UseKdfCarouselOptions {
  mode?: KdfCarouselMode;
  className?: string;
  trackClassName?: string;
  fadeColor?: string;
  showArrows?: boolean;
  children: ReactNode;
}

export function KdfCarousel({
  mode = "peek",
  className = "",
  trackClassName = "",
  fadeColor = "#fff",
  showArrows = true,
  children,
  itemCount,
  ...carouselOpts
}: KdfCarouselProps) {
  const { scrollerRef, scrollerClassName, scrollerProps, scrollBy } = useKdfCarousel({
    itemCount,
    ...carouselOpts,
  });

  const loopedChildren = useMemo(() => {
    const items = Children.toArray(children);
    if (itemCount <= 1) return items;
    const copies = carouselOpts.loopCopies ?? 3;
    return Array.from({ length: copies }, () => items).flat();
  }, [children, itemCount, carouselOpts.loopCopies]);

  return (
    <div
      className={`kdf-carousel kdf-carousel--${mode} ${className}`}
      style={{ ["--kdf-carousel-fade" as string]: fadeColor }}
    >
      <div className="kdf-carousel-fade kdf-carousel-fade--left" aria-hidden />
      <div className="kdf-carousel-fade kdf-carousel-fade--right" aria-hidden />

      {showArrows && itemCount > 1 && (
        <>
          <button
            type="button"
            className="kdf-carousel-nav kdf-carousel-nav--prev"
            onClick={() => scrollBy("left")}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="kdf-carousel-nav kdf-carousel-nav--next"
            onClick={() => scrollBy("right")}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      <div ref={scrollerRef} className={scrollerClassName} {...scrollerProps}>
        <div className={`kdf-carousel-track ${trackClassName}`}>{loopedChildren}</div>
      </div>
    </div>
  );
}
