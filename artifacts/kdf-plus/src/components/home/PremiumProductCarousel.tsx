import type { Product } from "@workspace/api-client-react";
import { KdfProductCarousel, type KdfProductCarouselProps } from "@/components/carousel/KdfProductCarousel";

export type PremiumProductCarouselProps = Omit<KdfProductCarouselProps, "mode">;

/** Center-focus carousel for featured / recommended sections */
export function PremiumProductCarousel({ resumeMs = 4000, ...props }: PremiumProductCarouselProps) {
  return <KdfProductCarousel mode="center" fadeColor="#f8fbf4" resumeMs={resumeMs} {...props} />;
}
