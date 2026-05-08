import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AppProvider, useApp } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { LocationProvider, useNutsLocation } from "./context/LocationContext";
import { ChatWidget } from "./components/ChatWidget";
import { LocationModal } from "./components/LocationModal";

/* ── Embed mode: Shopify iframe full-screen chat ── */
function EmbedApp() {
  /* Extract apiUrl from query params so the widget can call the correct API origin */
  const apiUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("apiUrl") ?? undefined
    : undefined;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", margin: 0, padding: 0 }}>
          <ChatWidget embedMode={true} apiUrl={apiUrl} />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

import { SplashPage } from "./pages/SplashPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { LoginPage } from "./pages/LoginPage";
import { OTPPage } from "./pages/OTPPage";
import { HomePage } from "./pages/HomePage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { ProductListingPage } from "./pages/ProductListingPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { CartPage } from "./pages/CartPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrderSuccessPage } from "./pages/OrderSuccessPage";
import { AccountPage } from "./pages/AccountPage";
import { WalletPage } from "./pages/WalletPage";
import { OrderTrackingPage } from "./pages/OrderTrackingPage";
import { MyOrdersPage } from "./pages/MyOrdersPage";
import { WishlistPage } from "./pages/WishlistPage";
import { AddressesPage } from "./pages/AddressesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { HelpSupportPage } from "./pages/HelpSupportPage";
import { EditProfilePage } from "./pages/EditProfilePage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { TrackOrderPage } from "./pages/TrackOrderPage";

import "./app.css";
import { useState, useEffect } from "react";

const queryClient = new QueryClient();

function ScrollToTop() {
  const [path] = useLocation();
  useEffect(() => {
    try { window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }); } catch { window.scrollTo(0, 0); }
  }, [path]);
  return null;
}

const MODAL_SKIP_PATHS = ["/", "/onboarding", "/login", "/otp", "/order-success", "/checkout", "/cart", "/track"];
const MODAL_SKIP_PREFIXES = ["/products/", "/product/"];

function LocationGateModal() {
  const { isSet } = useNutsLocation();
  const [path] = useLocation();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const skip = MODAL_SKIP_PATHS.some((p) => path === p) || MODAL_SKIP_PREFIXES.some((p) => path.startsWith(p));
    if (!skip && !isSet) {
      setShowModal(true);
    } else if (isSet) {
      setShowModal(false);
    }
  }, [path, isSet]);

  if (!showModal) return null;
  return <LocationModal onClose={() => setShowModal(false)} />;
}

// Protected Route Wrapper
const ProtectedRoute = ({ component: Component, ...rest }: any) => {
  const { isAuthenticated } = useApp();
  
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component {...rest} />;
};

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
      <Route path="/" component={SplashPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/otp" component={OTPPage} />
      <Route path="/home" component={HomePage} />
      <Route path="/categories" component={CategoriesPage} />
      <Route path="/products" component={ProductListingPage} />
      <Route path="/products/:slug" component={ProductDetailPage} />
      <Route path="/product/:id">
        {(params: { id: string }) => {
          if (typeof window !== "undefined") {
            window.location.replace(`/products/${params.id}`);
          }
          return null;
        }}
      </Route>
      <Route path="/cart" component={CartPage} />
      <Route path="/checkout" component={CheckoutPage} />
      <Route path="/order-success" component={OrderSuccessPage} />
      
      <Route path="/account" component={AccountPage} />
      <Route path="/wallet" component={WalletPage} />
      <Route path="/orders" component={MyOrdersPage} />
      <Route path="/wishlist" component={WishlistPage} />
      <Route path="/addresses" component={AddressesPage} />
      <Route path="/edit-profile" component={EditProfilePage} />
      <Route path="/change-password" component={ChangePasswordPage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/help" component={HelpSupportPage} />
      <Route path="/order/:id/tracking" component={OrderTrackingPage} />
      <Route path="/track" component={TrackOrderPage} />

      {/* Public invoice — redirect to API server so custom domain SPA doesn't 404 */}
      <Route path="/invoice/:orderNumber">
        {(params: { orderNumber: string }) => {
          if (typeof window !== "undefined") {
            window.location.replace(`/api/invoice/${params.orderNumber}`);
          }
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#F8FAFC" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p style={{ color: "#0D1F3C", fontWeight: 700, fontSize: 16 }}>Loading invoice…</p>
              </div>
            </div>
          );
        }}
      </Route>

      <Route component={NotFound} />
    </Switch>
    </>
  );
}

function App() {
  /* Detect embed mode (Shopify iframe) — check URL param or X-Frame parent */
  const isEmbed = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("embed");

  if (isEmbed) return <EmbedApp />;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <CartProvider>
            <WishlistProvider>
              <LocationProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router />
                  <LocationGateModal />
                  <ChatWidget />
                </WouterRouter>
              </LocationProvider>
            </WishlistProvider>
          </CartProvider>
        </AppProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
