import { useMemo } from "react";
import { useParams } from "wouter";
import { Helmet } from "react-helmet-async";
import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { normalizeProductsListResponse } from "@/lib/normalizeProductsList";
import { asArrayFromApi } from "@/lib/asArrayFromApi";

export default function CategoryPage() {
  const params = useParams<{ slug: string }>();
  const { data: categoriesData } = useListCategories({
    query: { staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const categories = asArrayFromApi(categoriesData);
  const category = categories.find((c) => c.slug === params.slug);

  const { data, isPending, isError, error, refetch, isFetching } = useListProducts(
    { categoryId: category?.id, limit: 50 },
    {
      query: {
        enabled: !!category?.id,
        queryKey: ["products", "category", category?.id ?? 0],
        staleTime: 60_000,
      },
    },
  );

  const products = useMemo(
    () => normalizeProductsListResponse(data).items,
    [data],
  );

  return (
    <>
      <Helmet>
        <title>{category ? `${category.name} — KDF Plus` : "Category — KDF Plus"}</title>
        <meta
          name="description"
          content={`Browse ${category?.name ?? "category"} products at KDF Plus. Premium quality nuts and dry fruits.`}
        />
        <link rel="canonical" href={`/kdf-plus/category/${params.slug}`} />
      </Helmet>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-6">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/products">
            <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="link-back-products">
              <ArrowLeft className="w-4 h-4 mr-1" /> All Products
            </Button>
          </Link>
        </div>

        {category && (
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{category.name}</h1>
            <p className="text-muted-foreground mt-1">
              {(isPending || (isFetching && !products.length)) && !isError
                ? "Loading..."
                : isError
                  ? "Could not load products"
                  : `${products.length} product${products.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        )}

        {isError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{(error as Error)?.message ?? "Failed to load products."}</span>
              <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {(isPending || (isFetching && !products.length)) && !isError ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : !isError && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-4xl mb-4">🥜</p>
            <h3 className="text-lg font-semibold mb-2">No products in this category yet</h3>
            <p className="text-muted-foreground text-sm">Check back soon or browse all products.</p>
            <Link href="/products">
              <Button className="mt-4" data-testid="link-browse-all">Browse All Products</Button>
            </Link>
          </div>
        ) : !isError ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : null}
      </main>
    </>
  );
}
