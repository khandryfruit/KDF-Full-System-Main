import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { useMemo } from "react";
import { useListCategories } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getProductImageSrc } from "@/lib/imageUrl";
import { asArrayFromApi } from "@/lib/asArrayFromApi";

type Category = {
  id: number;
  name: string;
  slug: string;
  imageUrl?: string | null;
  color?: string | null;
  icon?: string | null;
  productCount?: number | null;
};

function CategoryCard({ cat }: { cat: Category }) {
  return (
    <Link href={`/category/${cat.slug}`} data-testid={`link-cat-${cat.id}`}>
      <div className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer h-full">
        {/* Image area */}
        <div
          className="relative w-full aspect-square overflow-hidden"
          style={{ backgroundColor: cat.color || "#f0f7e6" }}
        >
          {cat.imageUrl ? (
            <img
              src={getProductImageSrc(cat.imageUrl, { maxWidth: 480 })}
              alt={cat.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl select-none">
              {cat.icon || "🥜"}
            </div>
          )}
          {/* Hover tint */}
          <div className="absolute inset-0 bg-[#5FA800]/0 group-hover:bg-[#5FA800]/10 transition-colors duration-200" />
        </div>

        {/* Label */}
        <div className="px-3 py-3 text-center">
          <p className="text-sm sm:text-base font-semibold text-gray-800 group-hover:text-[#5FA800] transition-colors duration-200 line-clamp-2 leading-snug">
            {cat.name}
          </p>
          {cat.productCount != null && cat.productCount > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{cat.productCount} products</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function CategoryCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
      <Skeleton className="w-full aspect-square" />
      <div className="px-3 py-3 flex flex-col items-center gap-1.5">
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  const { data: categoriesData, isLoading, isError, error, isFetching } = useListCategories({
    query: { staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const categories: Category[] = useMemo(
    () => asArrayFromApi<Category>(categoriesData),
    [categoriesData],
  );
  const showSkeleton = isLoading || (isFetching && categories.length === 0 && !isError);

  return (
    <>
      <Helmet>
        <title>All Categories — KDF NUTS</title>
        <meta
          name="description"
          content="Browse all product categories at KDF NUTS. Premium quality nuts, dry fruits, seeds and more."
        />
        <link rel="canonical" href="/categories" />
      </Helmet>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 sm:pb-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">All Categories</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {showSkeleton
              ? "Loading categories…"
              : isError
                ? "Could not load categories."
                : `${categories.length} categor${categories.length === 1 ? "y" : "ies"} available`}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {showSkeleton ? (
            Array.from({ length: 8 }).map((_, i) => <CategoryCardSkeleton key={i} />)
          ) : isError ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-destructive/20 bg-destructive/5 px-4">
              <h3 className="text-lg font-semibold text-gray-800">Categories unavailable</h3>
              <p className="text-gray-500 text-sm mt-2 max-w-md">
                {error instanceof Error ? error.message : "Please refresh the page or try again shortly."}
              </p>
            </div>
          ) : categories.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
              <span className="text-5xl mb-4">🥜</span>
              <h3 className="text-lg font-semibold text-gray-700">No categories yet</h3>
              <p className="text-gray-400 text-sm mt-1">Check back soon.</p>
            </div>
          ) : (
            categories.map((cat) => <CategoryCard key={cat.id} cat={cat} />)
          )}
        </div>
      </main>
    </>
  );
}
