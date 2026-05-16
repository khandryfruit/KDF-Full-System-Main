import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { SlidersHorizontal, X, ChevronDown } from "lucide-react";
import {
  useListProducts,
  useListCategories,
  ListProductsSortBy,
} from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { normalizeProductsListResponse } from "@/lib/normalizeProductsList";
import { asArrayFromApi } from "@/lib/asArrayFromApi";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Top Rated" },
];

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);

  const rawSortParam = params.get("sortBy") || params.get("sort") || "newest";
  const initialSort =
    rawSortParam === "best_selling" ? "rating" : rawSortParam;
  const [sortBy, setSortBy] = useState<string>(
    ["newest", "price_asc", "price_desc", "rating"].includes(initialSort) ? initialSort : "newest",
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(
    params.get("categoryId") ? Number(params.get("categoryId")) : undefined
  );
  const [featured, setFeatured] = useState<boolean | undefined>(
    params.get("featured") === "true" ? true : undefined
  );
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchQuery = params.get("search") || undefined;

  useEffect(() => {
    const p = new URLSearchParams(search);
    const fromUrl = p.get("sortBy") || p.get("sort");
    if (!fromUrl) return;
    const resolved = fromUrl === "best_selling" ? "rating" : fromUrl;
    if (["newest", "price_asc", "price_desc", "rating"].includes(resolved)) {
      setSortBy(resolved);
    }
  }, [search]);

  const { data: categoriesData } = useListCategories({
    query: { staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const categories = asArrayFromApi(categoriesData);

  const queryParams = {
    page,
    limit: PAGE_SIZE,
    sortBy: sortBy as ListProductsSortBy,
    ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
    ...(featured ? { featured: true } : {}),
    ...(searchQuery ? { search: searchQuery } : {}),
  };

  const { data, isError, error, refetch, isFetching, isPending } = useListProducts(queryParams, {
    query: {
      queryKey: ["products", JSON.stringify(queryParams)],
      staleTime: 120_000,
      refetchOnWindowFocus: false,
    },
  });

  const { items: products, total } = useMemo(
    () => normalizeProductsListResponse(data),
    [data],
  );
  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [sortBy, selectedCategoryId, featured, searchQuery]);

  const activeFilterCount =
    (selectedCategoryId ? 1 : 0) + (featured ? 1 : 0);

  const clearFilters = () => {
    setSelectedCategoryId(undefined);
    setFeatured(undefined);
    setSortBy("newest");
    setPriceRange([0, 5000]);
  };

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Categories */}
      <div>
        <h4 className="font-semibold text-sm mb-3">Category</h4>
        <div className="space-y-2">
          <div
            className={`flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-lg transition-colors ${!selectedCategoryId ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            onClick={() => setSelectedCategoryId(undefined)}
            data-testid="filter-category-all"
          >
            <span className="text-sm font-medium">All Categories</span>
          </div>
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-lg transition-colors ${selectedCategoryId === cat.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              onClick={() => setSelectedCategoryId(cat.id)}
              data-testid={`filter-category-${cat.id}`}
            >
              <span className="text-sm">{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Featured */}
      <div>
        <h4 className="font-semibold text-sm mb-3">Featured</h4>
        <div className="flex items-center gap-2">
          <Checkbox
            id="featured"
            checked={!!featured}
            onCheckedChange={(v) => setFeatured(v ? true : undefined)}
            data-testid="filter-featured"
          />
          <Label htmlFor="featured" className="text-sm cursor-pointer">Featured products only</Label>
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h4 className="font-semibold text-sm mb-3">
          Price Range: Rs. {priceRange[0]} – Rs. {priceRange[1]}
        </h4>
        <Slider
          min={0}
          max={5000}
          step={100}
          value={priceRange}
          onValueChange={(v) => setPriceRange(v as [number, number])}
          className="mt-4"
          data-testid="filter-price"
        />
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={clearFilters} data-testid="button-clear-filters">
        Clear Filters
      </Button>
    </div>
  );

  const title = searchQuery
    ? `Search: "${searchQuery}" — KDF Plus`
    : featured
    ? "Featured Products — KDF Plus"
    : "All Products — KDF Plus";

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content="Browse KDF Plus's full range of premium nuts, dry fruits, and seeds. Filter by category, price, and more." />
        <link rel="canonical" href="/kdf-plus/products" />
      </Helmet>

      <main className="kdf-home-section max-w-7xl mx-auto box-border overflow-x-hidden px-1.5 py-6 pb-28 sm:px-6 lg:px-8 sm:pb-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              {searchQuery ? `Results for "${searchQuery}"` : featured ? "Featured Products" : "All Products"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {(isPending || (isFetching && products.length === 0)) && !isError
                ? "Loading..."
                : isError
                  ? "Could not load products"
                  : `${total} product${total === 1 ? "" : "s"} found`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                <button onClick={clearFilters} className="ml-1" data-testid="button-clear-filter-badge">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44 h-9" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Mobile filter toggle */}
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden" data-testid="button-mobile-filters">
                  <SlidersHorizontal className="w-4 h-4 mr-1.5" /> Filters
                  {activeFilterCount > 0 && (
                    <Badge className="ml-1.5 w-4 h-4 p-0 flex items-center justify-center text-xs">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FilterContent />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Desktop Sidebar Filters */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="bg-white rounded-xl border border-border p-4 sticky top-20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Filters</h3>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={clearFilters}>
                    Clear all
                  </Button>
                )}
              </div>
              <FilterContent />
            </div>
          </aside>

          {/* Products Grid */}
          <div className="flex-1 min-w-0">
            {isError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm">
                    {(error as Error)?.message ?? "Failed to load products. Please try again."}
                  </span>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={() => refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {(isPending || (isFetching && !products.length)) && !isError ? (
              <div className="kdf-product-grid">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
                ))}
              </div>
            ) : !isError && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-4xl mb-4">🥜</p>
                <h3 className="text-lg font-semibold mb-2">No products found</h3>
                <p className="text-muted-foreground text-sm">Try adjusting your filters or search query.</p>
                <Button variant="outline" className="mt-4" onClick={clearFilters} data-testid="button-reset-search">
                  Reset Filters
                </Button>
              </div>
            ) : !isError ? (
              <>
                <div className="kdf-product-grid">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      data-testid="button-prev-page"
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
