/**
 * SSR Entry — renders the React app to HTML string for a given URL path.
 * Used by the Express SSR middleware in the API server for product page crawlability.
 *
 * Only product detail pages (/products/:slug) and product listings are SSR'd.
 * All other routes fall back to the SPA shell (CSR).
 */

import React from "react";
import { renderToString } from "react-dom/server";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider, dehydrate } from "@tanstack/react-query";

export interface SsrMeta {
  title:       string;
  description: string;
  ogImage?:    string;
  canonical:   string;
  schema?:     Record<string, any>;
}

export interface SsrResult {
  html:        string;
  meta:        SsrMeta;
  dehydrated:  any;
}

import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ProductListingPage } from "./pages/ProductListingPage";
import { HomePage } from "./pages/HomePage";

const BASE = "https://kdfnuts.com";

export async function render(url: string, prefetchedData?: Record<string, any>): Promise<SsrResult> {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });

  if (prefetchedData) {
    for (const [key, value] of Object.entries(prefetchedData)) {
      qc.setQueryData(JSON.parse(key), value);
    }
  }

  const { hook: locationHook } = memoryLocation({ path: url });

  let meta: SsrMeta = {
    title:       "KDF NUTS — Premium Dry Fruits & Nuts",
    description: "Shop premium quality dry fruits, nuts & seeds. Free delivery on Rs. 1500+. Cash on delivery available.",
    canonical:   `${BASE}${url}`,
  };

  let PageComponent: React.ComponentType = HomePage;

  const productMatch = url.match(/^\/products\/([^/?]+)/);
  if (productMatch) {
    PageComponent = ProductDetailPage;
    const product = prefetchedData ? (Object.values(prefetchedData)[0] as any) : null;
    if (product) {
      const images: string[] = Array.isArray(product.images) ? product.images : [];
      const ogImage = images[0] ?? undefined;
      meta = {
        title:       `${product.name} — KDF NUTS`,
        description: product.description
          ? (product.description as string).replace(/<[^>]+>/g, "").slice(0, 155)
          : `Buy ${product.name} online. Premium quality, fast delivery across Pakistan.`,
        ogImage,
        canonical:   `${BASE}/products/${product.slug ?? productMatch[1]}`,
        schema: {
          "@context":  "https://schema.org",
          "@type":     "Product",
          name:        product.name,
          description: product.description ? (product.description as string).replace(/<[^>]+>/g, "").slice(0, 500) : "",
          image:       images.length > 0 ? images.map((img: string) => `https://kdfnuts.com${img}`) : [],
          offers: {
            "@type":       "Offer",
            price:         product.price,
            priceCurrency: "PKR",
            availability:  (product.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url:           `${BASE}/products/${product.slug ?? productMatch[1]}`,
          },
          brand: { "@type": "Brand", name: "KDF NUTS" },
        },
      };
    }
  } else if (url.startsWith("/products")) {
    PageComponent = ProductListingPage;
    meta = {
      title:       "All Products — KDF NUTS",
      description: "Browse all premium dry fruits, nuts & seeds. Almonds, pistachios, cashews, walnuts & more.",
      canonical:   `${BASE}/products`,
    };
  }

  const html = renderToString(
    <QueryClientProvider client={qc}>
      <WouterRouter hook={locationHook}>
        <PageComponent />
      </WouterRouter>
    </QueryClientProvider>
  );

  return { html, meta, dehydrated: dehydrate(qc) };
}
