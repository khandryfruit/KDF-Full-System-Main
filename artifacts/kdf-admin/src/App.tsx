import { useState, useEffect, Suspense } from "react";
import { lazyPage } from "@/lib/lazyPage";
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

const DashboardPage = lazyPage(() => import("@/pages/DashboardPage"));
const ProductsPage = lazyPage(() => import("@/pages/ProductsPage"));
const CategoriesPage = lazyPage(() => import("@/pages/CategoriesPage"));
const OrdersPage = lazyPage(() => import("@/pages/OrdersPage"));
const CustomersPage = lazyPage(() => import("@/pages/CustomersPage"));
const BannersPage = lazyPage(() => import("@/pages/BannersPage"));
const CouponsPage = lazyPage(() => import("@/pages/CouponsPage"));
const WalletPage = lazyPage(() => import("@/pages/WalletPage"));
const LoyaltyPage = lazyPage(() => import("@/pages/LoyaltyPage"));
const NotificationsPage = lazyPage(() => import("@/pages/NotificationsPage"));
const ImportExportPage = lazyPage(() => import("@/pages/ImportExportPage"));
const IntegrationsPage = lazyPage(() => import("@/pages/IntegrationsPage"));
const SyncJobsPage = lazyPage(() => import("@/pages/SyncJobsPage"));
const CouriersPage = lazyPage(() => import("@/pages/CouriersPage"));
const PaymentsPage = lazyPage(() => import("@/pages/PaymentsPage"));
const LocationSettingsPage = lazyPage(() => import("@/pages/LocationSettingsPage"));
const WhatsAppPage = lazyPage(() => import("@/pages/WhatsAppPage"));
const LogoManagementPage = lazyPage(() => import("@/pages/LogoManagementPage"));
const BlogPostsPage = lazyPage(() => import("@/pages/BlogPostsPage"));
const SEOSettingsPage = lazyPage(() => import("@/pages/SEOSettingsPage"));
const AbandonedCheckoutsPage = lazyPage(() => import("@/pages/AbandonedCheckoutsPage"));
const AnalyticsPage = lazyPage(() => import("@/pages/AnalyticsPage"));
const AdminProfilePage = lazyPage(() => import("@/pages/AdminProfilePage"));
const AnnouncementsPage = lazyPage(() => import("@/pages/AnnouncementsPage"));
const FooterPage = lazyPage(() => import("@/pages/FooterPage"));
const AIContentPage = lazyPage(() => import("@/pages/AIContentPage"));
const FailedOrdersPage = lazyPage(() => import("@/pages/FailedOrdersPage"));
const CitiesPage = lazyPage(() => import("@/pages/CitiesPage"));
const ReviewsPage = lazyPage(() => import("@/pages/ReviewsPage"));
const ChatConversationsPage = lazyPage(() => import("@/pages/ChatConversationsPage"));
const ChatLeadsPage = lazyPage(() => import("@/pages/ChatLeadsPage"));
const EmailSettingsPage = lazyPage(() => import("@/pages/EmailSettingsPage"));
const ImageOptimizationPage = lazyPage(() => import("@/pages/ImageOptimizationPage"));
const SameDayDeliveryPage = lazyPage(() => import("@/pages/SameDayDeliveryPage"));
const ShippingRulesPage = lazyPage(() => import("@/pages/ShippingRulesPage"));
const HeaderBuilderPage = lazyPage(() => import("@/pages/HeaderBuilderPage"));
const BiddingPage = lazyPage(() => import("@/pages/BiddingPage"));
const RestockPage = lazyPage(() => import("@/pages/RestockPage"));
const ShopifyDashboardPage = lazyPage(() => import("@/pages/ShopifyDashboardPage"));
const ShopifyOrdersPage = lazyPage(() => import("@/pages/ShopifyOrdersPage"));
const LogisticsAutomationPage = lazyPage(() => import("@/pages/LogisticsAutomationPage"));
const WaOrderConfirmationsPage = lazyPage(() => import("@/pages/WaOrderConfirmationsPage"));
const LahoreDeliveriesPage = lazyPage(() => import("@/pages/LahoreDeliveriesPage"));
const RidersPage = lazyPage(() => import("@/pages/RidersPage"));
const DeliveryProofsPage = lazyPage(() => import("@/pages/DeliveryProofsPage"));
const ShopifyCustomersPage = lazyPage(() => import("@/pages/ShopifyCustomersPage"));
const ShopifyProductsPage = lazyPage(() => import("@/pages/ShopifyProductsPage"));
const FeaturedProductsPage = lazyPage(() => import("@/pages/FeaturedProductsPage"));
const ShopifyCampaignsPage = lazyPage(() => import("@/pages/ShopifyCampaignsPage"));
const ShopifyEmailCampaignsPage = lazyPage(() => import("@/pages/ShopifyEmailCampaignsPage"));
const ShopifyMarketingPage = lazyPage(() => import("@/pages/ShopifyMarketingPage"));
const ShopifyWidgetPage = lazyPage(() => import("@/pages/ShopifyWidgetPage"));
const WaInboxPage = lazyPage(() => import("@/pages/WaInboxPage"));
const WaChatPage = lazyPage(() => import("@/pages/WaChatPage"));
const WaChatSettingsPage = lazyPage(() => import("@/pages/WaChatSettingsPage"));
const SocialAIPage = lazyPage(() => import("@/pages/SocialAIPage"));
const IntelligencePage = lazyPage(() => import("@/pages/IntelligencePage"));
const InvoicePage = lazyPage(() => import("@/pages/InvoicePage"));
const PaymentGatewayPage = lazyPage(() => import("@/pages/PaymentGatewayPage"));
const BranchesPage = lazyPage(() => import("@/pages/BranchesPage"));
const BranchLoginPage = lazyPage(() => import("@/pages/BranchLoginPage"));
const BranchPosPage = lazyPage(() => import("@/pages/BranchPosPage"));
const AdminPOSPage = lazyPage(() => import("@/pages/AdminPOSPage"));
const AdminUsersPage = lazyPage(() => import("@/pages/AdminUsersPage"));
const AdminRolesPage = lazyPage(() => import("@/pages/AdminRolesPage"));
const ActivityLogsPage = lazyPage(() => import("@/pages/ActivityLogsPage"));
const StockOverviewPage = lazyPage(() => import("@/pages/StockOverviewPage"));
const StockProductsPage = lazyPage(() => import("@/pages/StockProductsPage"));
const StockMovementPage = lazyPage(() => import("@/pages/StockMovementPage"));
const StockAdjustmentPage = lazyPage(() => import("@/pages/StockAdjustmentPage"));
const SuppliersPage = lazyPage(() => import("@/pages/SuppliersPage"));
const ErpSupplierDetailPage = lazyPage(() => import("@/pages/ErpSupplierDetailPage"));
const ErpPurchasesPage = lazyPage(() => import("@/pages/ErpPurchasesPage"));
const BranchTransfersPage = lazyPage(() => import("@/pages/BranchTransfersPage"));
const ErpReportsPage = lazyPage(() => import("@/pages/ErpReportsPage"));
const ERPSettingsPage = lazyPage(() => import("@/pages/ERPSettingsPage"));
const AdSensePage = lazyPage(() => import("@/pages/AdSensePage"));
const RiderLiveMapPage = lazyPage(() => import("@/pages/RiderLiveMapPage"));
const VideoBannersPage = lazyPage(() => import("@/pages/VideoBannersPage"));
const MobileReelsPage = lazyPage(() => import("@/pages/MobileReelsPage"));
const GoogleIndexingPage = lazyPage(() => import("@/pages/GoogleIndexingPage"));
const GoogleMerchantPage = lazyPage(() => import("@/pages/GoogleMerchantPage"));
const ModulesPage = lazyPage(() => import("@/pages/ModulesPage"));
const AdminControlCenterPage = lazyPage(() => import("@/pages/AdminControlCenterPage"));
const SEODashboardPage = lazyPage(() => import("@/pages/SEODashboardPage"));
const SEORedirectsPage = lazyPage(() => import("@/pages/SEORedirectsPage"));
const SEOSchemaPage = lazyPage(() => import("@/pages/SEOSchemaPage"));
const SEOAIWriterPage = lazyPage(() => import("@/pages/SEOAIWriterPage"));

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
  const [, setLocation] = useLocation();
  const isAuthenticated = !!localStorage.getItem("kdf_admin_token");

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) {
    return <AdminRouteSpinner />;
  }

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
  return <AdminRouteSpinner />;
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

      {/* ── ERP (suppliers, purchases, transfers, reports) ── */}
      <Route path="/erp/suppliers/:id"><ProtectedRoute component={ErpSupplierDetailPage} /></Route>
      <Route path="/erp/suppliers"><ProtectedRoute component={SuppliersPage} /></Route>
      <Route path="/erp/purchases"><ProtectedRoute component={ErpPurchasesPage} /></Route>
      <Route path="/erp/transfers"><ProtectedRoute component={BranchTransfersPage} /></Route>
      <Route path="/erp/reports"><ProtectedRoute component={ErpReportsPage} /></Route>

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
  useEffect(() => {
    sessionStorage.removeItem("kdf_admin_chunk_reload_v1");
  }, []);

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
