/**
 * SchemaInjector — injects GTM, GA4, Organization, LocalBusiness, and global schemas
 * into the document <head> based on SEO settings from the API.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const API_PREFIX = BASE_URL.replace(/\/$/, "");

async function fetchSeoSettings() {
  const r = await fetch(`${API_PREFIX}/api/seo-settings`);
  if (!r.ok) return null;
  return r.json();
}

function injectScript(id: string, content: string, type = "text/javascript") {
  if (document.getElementById(id)) return;
  const el = document.createElement("script");
  el.id = id;
  el.type = type;
  el.textContent = content;
  document.head.appendChild(el);
}

function injectGTM(gtmId: string) {
  if (document.getElementById("gtm-script")) return;
  const script = document.createElement("script");
  script.id = "gtm-script";
  script.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`;
  document.head.prepend(script);

  if (!document.getElementById("gtm-noscript")) {
    const noscript = document.createElement("noscript");
    noscript.id = "gtm-noscript";
    noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
    document.body?.prepend(noscript);
  }
}

function injectGA4(ga4Id: string) {
  if (document.getElementById("ga4-script")) return;
  const script1 = document.createElement("script");
  script1.id = "ga4-script-src";
  script1.async = true;
  script1.src = `https://www.googletagmanager.com/gtag/js?id=${ga4Id}`;
  document.head.appendChild(script1);

  const script2 = document.createElement("script");
  script2.id = "ga4-script";
  script2.textContent = `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4Id}');`;
  document.head.appendChild(script2);
}

function injectJsonLd(id: string, schema: object) {
  if (document.getElementById(id)) {
    const el = document.getElementById(id)!;
    el.textContent = JSON.stringify(schema);
    return;
  }
  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

function removeJsonLd(id: string) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export function SchemaInjector() {
  const { data: settings } = useQuery({
    queryKey: ["seo-settings-schema"],
    queryFn: fetchSeoSettings,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!settings) return;

    const canonical = settings.canonicalDomain || settings.canonical_domain || "https://khanbabadryfruits.com";
    const gtmId = settings.gtm_id || settings.gtmId;
    const ga4Id = settings.ga4_id || settings.ga4Id;
    const orgName = settings.org_name || settings.orgName || "KDF NUTS";
    const orgPhone = settings.org_phone || settings.orgPhone;
    const orgEmail = settings.org_email || settings.orgEmail;
    const orgLogo = settings.org_logo || settings.orgLogo;
    const localBiz = settings.local_business_json || settings.localBusinessJson || {};

    if (gtmId) injectGTM(gtmId);
    if (ga4Id) injectGA4(ga4Id);

    const orgSchema: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": orgName,
      "url": canonical,
      "logo": orgLogo || `${canonical}/logo.png`,
      "sameAs": [
        "https://www.facebook.com/kdfnuts",
        "https://www.instagram.com/kdfnuts",
        "https://www.youtube.com/@kdfnuts",
      ],
    };
    if (orgPhone) orgSchema.contactPoint = { "@type": "ContactPoint", "telephone": orgPhone, "contactType": "customer service" };
    if (orgEmail) orgSchema.email = orgEmail;

    injectJsonLd("schema-organization", orgSchema);

    if (localBiz && (localBiz.type || orgName)) {
      const localSchema: Record<string, any> = {
        "@context": "https://schema.org",
        "@type": localBiz.type || "LocalBusiness",
        "name": orgName,
        "url": canonical,
      };
      if (orgLogo) localSchema.image = orgLogo;
      if (orgPhone) localSchema.telephone = orgPhone;
      if (settings.org_address || settings.orgAddress) {
        localSchema.address = {
          "@type": "PostalAddress",
          "streetAddress": settings.org_address || settings.orgAddress,
          "addressCountry": "PK",
        };
      }
      if (localBiz.latitude && localBiz.longitude) {
        localSchema.geo = {
          "@type": "GeoCoordinates",
          "latitude": localBiz.latitude,
          "longitude": localBiz.longitude,
        };
      }
      if (localBiz.openingHours) localSchema.openingHours = localBiz.openingHours;
      if (localBiz.priceRange) localSchema.priceRange = localBiz.priceRange;
      injectJsonLd("schema-local-business", localSchema);
    } else {
      removeJsonLd("schema-local-business");
    }

    const websiteSchema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": orgName,
      "url": canonical,
      "potentialAction": {
        "@type": "SearchAction",
        "target": { "@type": "EntryPoint", "urlTemplate": `${canonical}/products?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    };
    injectJsonLd("schema-website", websiteSchema);
  }, [settings]);

  return null;
}

export function BreadcrumbSchema({ items }: { items: { name: string; url: string }[] }) {
  useEffect(() => {
    const id = "schema-breadcrumb";
    if (items.length === 0) { removeJsonLd(id); return; }
    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": items.map((item, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "name": item.name,
        "item": item.url,
      })),
    };
    injectJsonLd(id, schema);
    return () => removeJsonLd(id);
  }, [JSON.stringify(items)]);
  return null;
}

export function ProductSchema({ product, canonical }: {
  product: { name: string; description?: string; price?: number; imageUrl?: string; slug?: string; averageRating?: number; reviewCount?: number; brand?: string; sku?: string };
  canonical: string;
}) {
  useEffect(() => {
    const id = "schema-product";
    if (!product.name) { removeJsonLd(id); return; }
    const schema: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.name,
      "description": product.description || product.name,
      "brand": { "@type": "Brand", "name": product.brand || "KDF NUTS" },
      "url": `${canonical}/products/${product.slug || product.name}`,
    };
    if (product.imageUrl) schema.image = product.imageUrl;
    if (product.sku) schema.sku = product.sku;
    if (product.price) {
      schema.offers = {
        "@type": "Offer",
        "price": product.price,
        "priceCurrency": "PKR",
        "availability": "https://schema.org/InStock",
        "seller": { "@type": "Organization", "name": "KDF NUTS" },
      };
    }
    if (product.averageRating && product.reviewCount) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": product.averageRating,
        "reviewCount": product.reviewCount,
        "bestRating": 5,
        "worstRating": 1,
      };
    }
    injectJsonLd(id, schema);
    return () => removeJsonLd(id);
  }, [product.name, product.price, canonical]);
  return null;
}

export function FAQSchema({ faqs }: { faqs: { question: string; answer: string }[] }) {
  useEffect(() => {
    const id = "schema-faq";
    if (!faqs || faqs.length === 0) { removeJsonLd(id); return; }
    injectJsonLd(id, {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs.map(f => ({
        "@type": "Question",
        "name": f.question,
        "acceptedAnswer": { "@type": "Answer", "text": f.answer },
      })),
    });
    return () => removeJsonLd(id);
  }, [JSON.stringify(faqs)]);
  return null;
}
