import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ProductsPage from "@/pages/ProductsPage";
import CategoriesPage from "@/pages/CategoriesPage";
import OrdersPage from "@/pages/OrdersPage";
import CustomersPage from "@/pages/CustomersPage";
import BannersPage from "@/pages/BannersPage";
import CouponsPage from "@/pages/CouponsPage";
import WalletPage from "@/pages/WalletPage";
import LoyaltyPage from "@/pages/LoyaltyPage";
import NotificationsPage from "@/pages/NotificationsPage";
import ImportExportPage from "@/pages/ImportExportPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import SyncJobsPage from "@/pages/SyncJobsPage";
import CouriersPage from "@/pages/CouriersPage";
import PaymentsPage from "@/pages/PaymentsPage";
import LocationSettingsPage from "@/pages/LocationSettingsPage";
import WhatsAppPage from "@/pages/WhatsAppPage";
import LogoManagementPage from "@/pages/LogoManagementPage";
import BlogPostsPage from "@/pages/BlogPostsPage";
import SEOSettingsPage from "@/pages/SEOSettingsPage";
import AbandonedCheckoutsPage from "@/pages/AbandonedCheckoutsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import AdminProfilePage from "@/pages/AdminProfilePage";
import AnnouncementsPage from "@/pages/AnnouncementsPage";
import FooterPage from "@/pages/FooterPage";
import AIContentPage from "@/pages/AIContentPage";
import FailedOrdersPage from "@/pages/FailedOrdersPage";
import CitiesPage from "@/pages/CitiesPage";
import ReviewsPage from "@/pages/ReviewsPage";
import ChatConversationsPage from "@/pages/ChatConversationsPage";
import ChatLeadsPage from "@/pages/ChatLeadsPage";
import EmailSettingsPage from "@/pages/EmailSettingsPage";
import ImageOptimizationPage from "@/pages/ImageOptimizationPage";
import SameDayDeliveryPage from "@/pages/SameDayDeliveryPage";
import ShippingRulesPage from "@/pages/ShippingRulesPage";
import HeaderBuilderPage from "@/pages/HeaderBuilderPage";
import BiddingPage from "@/pages/BiddingPage";
import RestockPage from "@/pages/RestockPage";
import ShopifyDashboardPage from "@/pages/ShopifyDashboardPage";
import ShopifyOrdersPage from "@/pages/ShopifyOrdersPage";
import LogisticsAutomationPage from "@/pages/LogisticsAutomationPage";
import WaOrderConfirmationsPage from "@/pages/WaOrderConfirmationsPage";
import LahoreDeliveriesPage from "@/pages/LahoreDeliveriesPage";
import RidersPage from "@/pages/RidersPage";
import ShopifyCustomersPage from "@/pages/ShopifyCustomersPage";
import ShopifyProductsPage from "@/pages/ShopifyProductsPage";
import FeaturedProductsPage from "@/pages/FeaturedProductsPage";
import ShopifyCampaignsPage from "@/pages/ShopifyCampaignsPage";
import ShopifyEmailCampaignsPage from "@/pages/ShopifyEmailCampaignsPage";
import ShopifyMarketingPage from "@/pages/ShopifyMarketingPage";
import ShopifyWidgetPage from "@/pages/ShopifyWidgetPage";
import WaInboxPage from "@/pages/WaInboxPage";
import WaChatPage from "@/pages/WaChatPage";
import WaChatSettingsPage from "@/pages/WaChatSettingsPage";
import SocialAIPage from "@/pages/SocialAIPage";
import IntelligencePage from "@/pages/IntelligencePage";
import InvoicePage from "@/pages/InvoicePage";
import PaymentGatewayPage from "@/pages/PaymentGatewayPage";
import BranchesPage from "@/pages/BranchesPage";
import BranchLoginPage from "@/pages/BranchLoginPage";
import BranchPosPage from "@/pages/BranchPosPage";
import AdminPOSPage from "@/pages/AdminPOSPage";
import { BranchAuthProvider } from "@/context/BranchAuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import AdminUsersPage from "@/pages/AdminUsersPage";
import AdminRolesPage from "@/pages/AdminRolesPage";
import ActivityLogsPage from "@/pages/ActivityLogsPage";
import StockOverviewPage from "@/pages/StockOverviewPage";
import StockProductsPage from "@/pages/StockProductsPage";
import StockMovementPage from "@/pages/StockMovementPage";
import StockAdjustmentPage from "@/pages/StockAdjustmentPage";
import ERPSettingsPage from "@/pages/ERPSettingsPage";
import AdSensePage from "@/pages/AdSensePage";
import RiderLiveMapPage from "@/pages/RiderLiveMapPage";
import VideoBannersPage from "@/pages/VideoBannersPage";
import MobileReelsPage from "@/pages/MobileReelsPage";
import GoogleIndexingPage from "@/pages/GoogleIndexingPage";

setAuthTokenGetter(() => localStorage.getItem("kdf_admin_token") ?? "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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

function Router() {
  return (
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
      <Route path="/seo"><ProtectedRoute component={SEOSettingsPage} /></Route>
      <Route path="/seo/fast-indexing"><ProtectedRoute component={GoogleIndexingPage} /></Route>
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

      {/* ── Admin IAM (Users, Roles, Activity Logs) ── */}
      <Route path="/admin/users"><ProtectedRoute component={AdminUsersPage} /></Route>
      <Route path="/admin/roles"><ProtectedRoute component={AdminRolesPage} /></Route>
      <Route path="/admin/activity-logs"><ProtectedRoute component={ActivityLogsPage} /></Route>

      <Route path="/">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}

export default App;
