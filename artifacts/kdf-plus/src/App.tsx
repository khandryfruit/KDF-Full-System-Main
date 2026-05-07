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
import { Footer } from "@/components/Footer";
import { MiniCart } from "@/components/MiniCart";
import { LocationDetectPopup } from "@/components/LocationDetectPopup";
import { ChatWidget } from "@/components/ChatWidget";
import { useSiteSettings, logoSrc } from "@/hooks/useSiteSettings";
import { useGetSeoSettings } from "@workspace/api-client-react";
import { Helmet } from "react-helmet-async";
import { setAuthTokenGetter } from "@workspace/api-client-react";

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

setAuthTokenGetter(() => localStorage.getItem("kdf_web_token") ?? "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ScrollToTop() {
  const [path] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
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
      <div className="flex-1">{children}</div>
      <Footer />
      <MiniCart />
    </div>
  );
}

/** No footer — used for product detail, checkout, order success */
function CleanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1">{children}</div>
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
          <Route path="/product/:id" component={() => <CleanLayout><ProductDetailPage /></CleanLayout>} />
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
                  <ChatWidget />
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
