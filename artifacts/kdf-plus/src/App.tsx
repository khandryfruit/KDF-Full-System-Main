import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider } from "@/context/AuthContext";
import { LocationProvider, useUserLocation } from "@/context/LocationContext";
import { Header } from "@/components/Header";
import { HeaderPromoStrip } from "@/components/HeaderPromoStrip";
import { MiniCart } from "@/components/MiniCart";
import { LocationDetectPopup } from "@/components/LocationDetectPopup";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import { useGetSeoSettings } from "@workspace/api-client-react";
import { Helmet } from "react-helmet-async";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getPublicApiOrigin } from "./lib/apiOrigin";

const Footer = lazy(() => import("@/components/Footer").then((m) => ({ default: m.Footer })));
const ChatWidget = lazy(() => import("@/components/ChatWidget").then((m) => ({ default: m.ChatWidget })));

/** Loads chat after idle so first paint / TTI stay fast on mobile. */
function DeferredChatWidget() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") return undefined;
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(() => { if (!cancelled) setShow(true); }, { timeout: 3200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(id);
      };
    }
    const t = window.setTimeout(() => { if (!cancelled) setShow(true); }, 2200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <ChatWidget />
    </Suspense>
  );
}

const HomePage        = lazy(() => import("@/pages/HomePage"));
const ProductsPage    = lazy(() => import("@/pages/ProductsPage"));
const CategoryPage    = lazy(() => import("@/pages/CategoryPage"));
const CategoriesPage  = lazy(() => import("@/pages/CategoriesPage"));
const ProductDetailPage = lazy(() => import("@/pages/ProductDetailPage"));
const CartPage        = lazy(() => import("@/pages/CartPage"));
const CheckoutPage    = lazy(() => import("@/pages/CheckoutPage"));
const OrderSuccessPage = lazy(() => import("@/pages/OrderSuccessPage"));
const LoginPage       = lazy(() => import("@/pages/LoginPage"));
const RegisterPage    = lazy(() => import("@/pages/RegisterPage"));
const AccountPage     = lazy(() => import("@/pages/AccountPage"));
const TrackOrderPage  = lazy(() => import("@/pages/TrackOrderPage"));
const BlogPage        = lazy(() => import("@/pages/BlogPage"));
const BlogPostPage    = lazy(() => import("@/pages/BlogPostPage"));
const PolicyPage      = lazy(() => import("@/pages/PolicyPage"));
import NotFound from "@/pages/not-found";

setAuthTokenGetter(() => { try { return localStorage.getItem("kdf_web_token") ?? ""; } catch { return ""; } });

// Match Orval/customFetch base URL to the same origin used by the fetch patch
// (VITE_API_BASE_URL at build time, or runtime mapping for production www → api).
const apiBase = getPublicApiOrigin();
if (apiBase) {
  setBaseUrl(apiBase);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

function ScrollToTop() {
  const [path] = useLocation();
  useEffect(() => {
    try { window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }); } catch { window.scrollTo(0, 0); }
  }, [path]);
  return null;
}

function LocationGate() {
  const { locationPermission, setLocationPermission } = useUserLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (locationPermission === "unknown") {
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [locationPermission]);

  if (!show || locationPermission !== "unknown") return null;

  return (
    <LocationDetectPopup
      onDismiss={() => {
        setShow(false);
        if (locationPermission === "unknown") setLocationPermission("denied");
      }}
    />
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <HeaderPromoStrip />
      <div className="flex-1">{children}</div>
      <Suspense fallback={<div className="h-36 shrink-0 bg-muted/15 border-t border-border/40" aria-hidden />}>
        <Footer />
      </Suspense>
      <MiniCart />
    </div>
  );
}

/** No footer — used for product detail, checkout, order success */
function CleanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <HeaderPromoStrip />
      <div className="flex-1">{children}</div>
      <Suspense fallback={<div className="h-36 shrink-0 bg-muted/15 border-t border-border/40" aria-hidden />}>
        <Footer />
      </Suspense>
      <MiniCart />
    </div>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {children}
    </div>
  );
}

const PageFallback = () => (
  <div className="flex-1 flex items-center justify-center min-h-[40vh]">
    <div className="w-8 h-8 border-2 border-[#5FA800] border-t-transparent rounded-full animate-spin" />
  </div>
);

function Router() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/" component={() => <Layout><HomePage /></Layout>} />
          <Route path="/products" component={() => <Layout><ProductsPage /></Layout>} />
          <Route path="/categories" component={() => <Layout><CategoriesPage /></Layout>} />
          <Route path="/category/:slug" component={() => <Layout><CategoryPage /></Layout>} />
          <Route path="/products/:slug" component={() => <CleanLayout><ProductDetailPage /></CleanLayout>} />
          <Route path="/product/:id">
            {(params: { id: string }) => {
              if (typeof window !== "undefined") {
                window.location.replace(`/products/${params.id}`);
              }
              return null;
            }}
          </Route>
          <Route path="/cart" component={() => <CleanLayout><CartPage /></CleanLayout>} />
          <Route path="/checkout" component={() => <CleanLayout><CheckoutPage /></CleanLayout>} />
          <Route path="/order/:id" component={() => <CleanLayout><OrderSuccessPage /></CleanLayout>} />
          <Route path="/login" component={() => <AuthLayout><LoginPage /></AuthLayout>} />
          <Route path="/register" component={() => <AuthLayout><RegisterPage /></AuthLayout>} />
          <Route path="/account" component={() => <Layout><AccountPage /></Layout>} />
          <Route path="/track" component={() => <Layout><TrackOrderPage /></Layout>} />
          <Route path="/blog/:slug" component={() => <Layout><BlogPostPage /></Layout>} />
          <Route path="/blog" component={() => <Layout><BlogPage /></Layout>} />
          <Route path="/policies/:slug" component={() => <Layout><PolicyPage /></Layout>} />
          <Route component={() => <Layout><NotFound /></Layout>} />
        </Switch>
      </Suspense>
    </>
  );
}

function FaviconManager() {
  const { data: settings } = useSiteSettings();
  const fav = logoSrc(settings?.faviconPath);
  if (!fav) return null;
  return (
    <Helmet>
      <link rel="icon" href={fav} />
    </Helmet>
  );
}

function SeoManager() {
  const { data: seo } = useGetSeoSettings();
  if (!seo?.googleVerificationCode) return null;
  return (
    <Helmet>
      <meta name="google-site-verification" content={seo.googleVerificationCode} />
      {seo.siteNoindex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CartProvider>
            <LocationProvider>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router />
                  <LocationGate />
                  <DeferredChatWidget />
                </WouterRouter>
                <FaviconManager />
                <SeoManager />
                <Toaster />
              </TooltipProvider>
            </LocationProvider>
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
