import { useState, useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getEffectiveApiOrigin } from "@/lib/apiBase";
import { BranchAuthProvider } from "@/context/BranchAuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import { ThemeProvider } from "next-themes";

import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ProductsPage = lazy(() => import("@/pages/ProductsPage"));
const CategoriesPage = lazy(() => import("@/pages/CategoriesPage"));
const OrdersPage = lazy(() => import("@/pages/OrdersPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const BannersPage = lazy(() => import("@/pages/BannersPage"));
const CouponsPage = lazy(() => import("@/pages/CouponsPage"));
const WalletPage = lazy(() => import("@/pages/WalletPage"));
const LoyaltyPage = lazy(() => import("@/pages/LoyaltyPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const ImportExportPage = lazy(() => import("@/pages/ImportExportPage"));
const IntegrationsPage = lazy(() => import("@/pages/IntegrationsPage"));
const SyncJobsPage = lazy(() => import("@/pages/SyncJobsPage"));
const CouriersPage = lazy(() => import("@/pages/CouriersPage"));
const PaymentsPage = lazy(() => import("@/pages/PaymentsPage"));
const LocationSettingsPage = lazy(() => import("@/pages/LocationSettingsPage"));
const WhatsAppPage = lazy(() => import("@/pages/WhatsAppPage"));
const LogoManagementPage = lazy(() => import("@/pages/LogoManagementPage"));
const BlogPostsPage = lazy(() => import("@/pages/BlogPostsPage"));
const SEOSettingsPage = lazy(() => import("@/pages/SEOSettingsPage"));
const AbandonedCheckoutsPage = lazy(() => import("@/pages/AbandonedCheckoutsPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const AdminProfilePage = lazy(() => import("@/pages/AdminProfilePage"));
const AnnouncementsPage = lazy(() => import("@/pages/AnnouncementsPage"));
const FooterPage = lazy(() => import("@/pages/FooterPage"));
const AIContentPage = lazy(() => import("@/pages/AIContentPage"));
const FailedOrdersPage = lazy(() => import("@/pages/FailedOrdersPage"));
const CitiesPage = lazy(() => import("@/pages/CitiesPage"));
const ReviewsPage = lazy(() => import("@/pages/ReviewsPage"));
const ChatConversationsPage = lazy(() => import("@/pages/ChatConversationsPage"));
const ChatLeadsPage = lazy(() => import("@/pages/ChatLeadsPage"));
const EmailSettingsPage = lazy(() => import("@/pages/EmailSettingsPage"));
const ImageOptimizationPage = lazy(() => import("@/pages/ImageOptimizationPage"));
const SameDayDeliveryPage = lazy(() => import("@/pages/SameDayDeliveryPage"));
const ShippingRulesPage = lazy(() => import("@/pages/ShippingRulesPage"));
const HeaderBuilderPage = lazy(() => import("@/pages/HeaderBuilderPage"));
const BiddingPage = lazy(() => import("@/pages/BiddingPage"));
const RestockPage = lazy(() => import("@/pages/RestockPage"));
const ShopifyDashboardPage = lazy(() => import("@/pages/ShopifyDashboardPage"));
const ShopifyOrdersPage = lazy(() => import("@/pages/ShopifyOrdersPage"));
const LogisticsAutomationPage = lazy(() => import("@/pages/LogisticsAutomationPage"));
const WaOrderConfirmationsPage = lazy(() => import("@/pages/WaOrderConfirmationsPage"));
const LahoreDeliveriesPage = lazy(() => import("@/pages/LahoreDeliveriesPage"));
const RidersPage = lazy(() => import("@/pages/RidersPage"));
const DeliveryProofsPage = lazy(() => import("@/pages/DeliveryProofsPage"));
const ShopifyCustomersPage = lazy(() => import("@/pages/ShopifyCustomersPage"));
const ShopifyProductsPage = lazy(() => import("@/pages/ShopifyProductsPage"));
const FeaturedProductsPage = lazy(() => import("@/pages/FeaturedProductsPage"));
const ShopifyCampaignsPage = lazy(() => import("@/pages/ShopifyCampaignsPage"));
const ShopifyEmailCampaignsPage = lazy(() => import("@/pages/ShopifyEmailCampaignsPage"));
const ShopifyMarketingPage = lazy(() => import("@/pages/ShopifyMarketingPage"));
const ShopifyWidgetPage = lazy(() => import("@/pages/ShopifyWidgetPage"));
const WaInboxPage = lazy(() => import("@/pages/WaInboxPage"));
const WaChatPage = lazy(() => import("@/pages/WaChatPage"));
const WaChatSettingsPage = lazy(() => import("@/pages/WaChatSettingsPage"));
const SocialAIPage = lazy(() => import("@/pages/SocialAIPage"));
const IntelligencePage = lazy(() => import("@/pages/IntelligencePage"));
const InvoicePage = lazy(() => import("@/pages/InvoicePage"));
const PaymentGatewayPage = lazy(() => import("@/pages/PaymentGatewayPage"));
const BranchesPage = lazy(() => import("@/pages/BranchesPage"));
const BranchLoginPage = lazy(() => import("@/pages/BranchLoginPage"));
const BranchPosPage = lazy(() => import("@/pages/BranchPosPage"));
const AdminPOSPage = lazy(() => import("@/pages/AdminPOSPage"));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsersPage"));
const AdminRolesPage = lazy(() => import("@/pages/AdminRolesPage"));
const ActivityLogsPage = lazy(() => import("@/pages/ActivityLogsPage"));
const StockOverviewPage = lazy(() => import("@/pages/StockOverviewPage"));
const StockProductsPage = lazy(() => import("@/pages/StockProductsPage"));
const StockMovementPage = lazy(() => import("@/pages/StockMovementPage"));
const StockAdjustmentPage = lazy(() => import("@/pages/StockAdjustmentPage"));
const ERPSettingsPage = lazy(() => import("@/pages/ERPSettingsPage"));
const AdSensePage = lazy(() => import("@/pages/AdSensePage"));
const RiderLiveMapPage = lazy(() => import("@/pages/RiderLiveMapPage"));
const VideoBannersPage = lazy(() => import("@/pages/VideoBannersPage"));
const MobileReelsPage = lazy(() => import("@/pages/MobileReelsPage"));
const GoogleIndexingPage = lazy(() => import("@/pages/GoogleIndexingPage"));
const GoogleMerchantPage = lazy(() => import("@/pages/GoogleMerchantPage"));
const ModulesPage = lazy(() => import("@/pages/ModulesPage"));
const AdminControlCenterPage = lazy(() => import("@/pages/AdminControlCenterPage"));
const SEODashboardPage = lazy(() => import("@/pages/SEODashboardPage"));
const SEORedirectsPage = lazy(() => import("@/pages/SEORedirectsPage"));
const SEOSchemaPage = lazy(() => import("@/pages/SEOSchemaPage"));
const SEOAIWriterPage = lazy(() => import("@/pages/SEOAIWriterPage"));

/* Orval / React Query: relative `/api/...` → prepend API origin (never empty in production). */
const adminApiBase = getEffectiveApiOrigin();
if (adminApiBase) {
  setBaseUrl(adminApiBase);
}

setAuthTokenGetter(() => localStorage.getItem("kdf_admin_token") ?? "");

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

function AdminRouteSpinner() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-6 bg-background px-6"
      aria-busy="true"
      aria-label="Loading admin page"
    >
      <div className="w-full max-w-lg space-y-3">
        <div className="h-8 w-48 rounded-lg bg-muted/70 animate-pulse" />
        <div className="h-3 w-full rounded-md bg-muted/45 animate-pulse" />
        <div className="h-3 w-[88%] rounded-md bg-muted/45 animate-pulse" style={{ animationDelay: "80ms" }} />
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="h-24 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-24 rounded-xl bg-muted/50 animate-pulse" style={{ animationDelay: "100ms" }} />
          <div className="h-24 rounded-xl bg-muted/50 animate-pulse" style={{ animationDelay: "200ms" }} />
        </div>
      </div>
      <div className="h-9 w-9 rounded-full border-2 border-muted-foreground/25 border-t-primary animate-spin" aria-hidden />
    </div>
  );
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  const [location, setLocation] = useLocation();
  const isAuthenticated = !!localStorage.getItem("kdf_admin_token");

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

/** Canonical path is `/shopify/widget`; this alias matches docs / bookmarks. */
function RedirectToShopifyWidget() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/shopify/widget");
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Suspense fallback={<AdminRouteSpinner />}>
      <Switch>
      {/* ── Admin Auth ── */}
      <Route path="/login" component={LoginPage} />

      {/* ── Branch Portal (no Layout wrapper, self-contained) ── */}
      <Route path="/branch-login" component={BranchLoginPage} />
      <Route path="/branch-pos" component={BranchPosPage} />

      {/* ── Admin POS (fullscreen, own auth check) ── */}
      <Route path="/pos" component={AdminPOSPage} />

      {/* ── Invoice & Billing (admin) ── */}
      <Route path="/invoice/purchase/history"><ProtectedRoute component={InvoicePage} /></Route>
      <Route path="/invoice/purchase"><ProtectedRoute component={InvoicePage} /></Route>
      <Route path="/invoice/history"><ProtectedRoute component={InvoicePage} /></Route>
      <Route path="/invoice/new"><ProtectedRoute component={InvoicePage} /></Route>
      <Route path="/invoice"><ProtectedRoute component={InvoicePage} /></Route>

      {/* ── Core admin pages ── */}
      <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
      <Route path="/analytics"><ProtectedRoute component={AnalyticsPage} /></Route>
      <Route path="/products"><ProtectedRoute component={ProductsPage} /></Route>
      <Route path="/categories"><ProtectedRoute component={CategoriesPage} /></Route>
      <Route path="/orders"><ProtectedRoute component={OrdersPage} /></Route>
      <Route path="/customers"><ProtectedRoute component={CustomersPage} /></Route>
      <Route path="/banners"><ProtectedRoute component={BannersPage} /></Route>
      <Route path="/coupons"><ProtectedRoute component={CouponsPage} /></Route>
      <Route path="/wallet"><ProtectedRoute component={WalletPage} /></Route>
      <Route path="/loyalty"><ProtectedRoute component={LoyaltyPage} /></Route>
      <Route path="/notifications"><ProtectedRoute component={NotificationsPage} /></Route>
      <Route path="/import-export"><ProtectedRoute component={ImportExportPage} /></Route>
      <Route path="/integrations"><ProtectedRoute component={IntegrationsPage} /></Route>
      <Route path="/sync-jobs"><ProtectedRoute component={SyncJobsPage} /></Route>
      <Route path="/couriers"><ProtectedRoute component={CouriersPage} /></Route>
      <Route path="/payments"><ProtectedRoute component={PaymentsPage} /></Route>
      <Route path="/location"><ProtectedRoute component={LocationSettingsPage} /></Route>
      <Route path="/whatsapp"><ProtectedRoute component={WhatsAppPage} /></Route>
      <Route path="/website-settings"><ProtectedRoute component={LogoManagementPage} /></Route>
      <Route path="/abandoned-checkouts"><ProtectedRoute component={AbandonedCheckoutsPage} /></Route>
      <Route path="/blog"><ProtectedRoute component={BlogPostsPage} /></Route>
      <Route path="/seo/dashboard"><ProtectedRoute component={SEODashboardPage} /></Route>
      <Route path="/seo/redirects"><ProtectedRoute component={SEORedirectsPage} /></Route>
      <Route path="/seo/schema"><ProtectedRoute component={SEOSchemaPage} /></Route>
      <Route path="/seo/ai-writer"><ProtectedRoute component={SEOAIWriterPage} /></Route>
      <Route path="/seo"><ProtectedRoute component={SEOSettingsPage} /></Route>
      <Route path="/seo/fast-indexing"><ProtectedRoute component={GoogleIndexingPage} /></Route>
      <Route path="/seo/merchant-center"><ProtectedRoute component={GoogleMerchantPage} /></Route>
      <Route path="/announcements"><ProtectedRoute component={AnnouncementsPage} /></Route>
      <Route path="/footer"><ProtectedRoute component={FooterPage} /></Route>
      <Route path="/ai-content"><ProtectedRoute component={AIContentPage} /></Route>
      <Route path="/failed-orders"><ProtectedRoute component={FailedOrdersPage} /></Route>
      <Route path="/cities"><ProtectedRoute component={CitiesPage} /></Route>
      <Route path="/reviews"><ProtectedRoute component={ReviewsPage} /></Route>
      <Route path="/chat-conversations"><ProtectedRoute component={ChatConversationsPage} /></Route>
      <Route path="/chat-leads"><ProtectedRoute component={ChatLeadsPage} /></Route>
      <Route path="/email-settings"><ProtectedRoute component={EmailSettingsPage} /></Route>
      <Route path="/image-optimization"><ProtectedRoute component={ImageOptimizationPage} /></Route>
      <Route path="/same-day-delivery"><ProtectedRoute component={SameDayDeliveryPage} /></Route>
      <Route path="/shipping-rules"><ProtectedRoute component={ShippingRulesPage} /></Route>
      <Route path="/header-builder"><ProtectedRoute component={HeaderBuilderPage} /></Route>
      <Route path="/bidding"><ProtectedRoute component={BiddingPage} /></Route>
      <Route path="/restock"><ProtectedRoute component={RestockPage} /></Route>
      <Route path="/logistics/automation"><ProtectedRoute component={LogisticsAutomationPage} /></Route>
      <Route path="/logistics/confirmations"><ProtectedRoute component={WaOrderConfirmationsPage} /></Route>
      <Route path="/logistics/lahore"><ProtectedRoute component={LahoreDeliveriesPage} /></Route>
      <Route path="/logistics/delivery-proofs"><ProtectedRoute component={DeliveryProofsPage} /></Route>
      <Route path="/logistics/riders"><ProtectedRoute component={RidersPage} /></Route>
      <Route path="/logistics/live-map"><ProtectedRoute component={RiderLiveMapPage} /></Route>
      <Route path="/shopify"><ProtectedRoute component={ShopifyDashboardPage} /></Route>
      <Route path="/shopify/orders"><ProtectedRoute component={ShopifyOrdersPage} /></Route>
      <Route path="/shopify/customers"><ProtectedRoute component={ShopifyCustomersPage} /></Route>
      <Route path="/shopify/products"><ProtectedRoute component={ShopifyProductsPage} /></Route>
      <Route path="/shopify/featured"><ProtectedRoute component={FeaturedProductsPage} /></Route>
      <Route path="/shopify/campaigns"><ProtectedRoute component={ShopifyCampaignsPage} /></Route>
      <Route path="/shopify/email-campaigns"><ProtectedRoute component={ShopifyEmailCampaignsPage} /></Route>
      <Route path="/shopify/marketing"><ProtectedRoute component={ShopifyMarketingPage} /></Route>
      <Route path="/admin/shopify/widget"><ProtectedRoute component={RedirectToShopifyWidget} /></Route>
      <Route path="/shopify/widget"><ProtectedRoute component={ShopifyWidgetPage} /></Route>
      <Route path="/shopify/wa-inbox"><ProtectedRoute component={WaInboxPage} /></Route>
      <Route path="/wa-inbox"><ProtectedRoute component={WaInboxPage} /></Route>
      <Route path="/wa-chat/settings"><ProtectedRoute component={WaChatSettingsPage} /></Route>
      <Route path="/wa-chat"><ProtectedRoute component={WaChatPage} /></Route>
      <Route path="/social-ai"><ProtectedRoute component={SocialAIPage} /></Route>
      <Route path="/intelligence"><ProtectedRoute component={IntelligencePage} /></Route>
      <Route path="/payment-gateway"><ProtectedRoute component={PaymentGatewayPage} /></Route>
      <Route path="/payment-gateway/transactions"><ProtectedRoute component={PaymentGatewayPage} /></Route>
      <Route path="/payment-gateway/merchants"><ProtectedRoute component={PaymentGatewayPage} /></Route>
      <Route path="/payment-gateway/disputes"><ProtectedRoute component={PaymentGatewayPage} /></Route>
      <Route path="/branches/list"><ProtectedRoute component={BranchesPage} /></Route>
      <Route path="/branches"><ProtectedRoute component={BranchesPage} /></Route>
      <Route path="/profile"><ProtectedRoute component={AdminProfilePage} /></Route>

      {/* ── Stock Management ── */}
      <Route path="/stock/overview"><ProtectedRoute component={StockOverviewPage} /></Route>
      <Route path="/stock/products"><ProtectedRoute component={StockProductsPage} /></Route>
      <Route path="/stock/movement"><ProtectedRoute component={StockMovementPage} /></Route>
      <Route path="/stock/adjustment"><ProtectedRoute component={StockAdjustmentPage} /></Route>
      <Route path="/stock"><ProtectedRoute component={StockOverviewPage} /></Route>

      {/* ── ERP Settings ── */}
      <Route path="/erp-settings/:section"><ProtectedRoute component={ERPSettingsPage} /></Route>
      <Route path="/erp-settings"><ProtectedRoute component={ERPSettingsPage} /></Route>
      <Route path="/adsense"><ProtectedRoute component={AdSensePage} /></Route>
      <Route path="/video-banners"><ProtectedRoute component={VideoBannersPage} /></Route>
      <Route path="/mobile-reels"><ProtectedRoute component={MobileReelsPage} /></Route>

      {/* ── Enterprise Admin Control Center ── */}
      <Route path="/admin/control-center"><ProtectedRoute component={AdminControlCenterPage} /></Route>
      <Route path="/admin/users"><ProtectedRoute component={AdminControlCenterPage} /></Route>
      <Route path="/admin/roles"><ProtectedRoute component={AdminControlCenterPage} /></Route>
      <Route path="/admin/activity-logs"><ProtectedRoute component={AdminControlCenterPage} /></Route>
      <Route path="/settings/modules"><ProtectedRoute component={AdminControlCenterPage} /></Route>

      <Route path="/">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        storageKey="kdf-admin-theme"
        disableTransitionOnChange
      >
        <TooltipProvider>
          <AdminAuthProvider>
            <BranchAuthProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <NotificationProvider>
                  <Router />
                </NotificationProvider>
              </WouterRouter>
            </BranchAuthProvider>
          </AdminAuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
