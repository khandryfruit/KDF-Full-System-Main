import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import TenantsPage from "@/pages/TenantsPage";
import TenantDetailPage from "@/pages/TenantDetailPage";
import PlansPage from "@/pages/PlansPage";
import ActivityPage from "@/pages/ActivityPage";
import TenantOnboardPage from "@/pages/TenantOnboardPage";
import StorefrontBuilderPage from "@/pages/StorefrontBuilderPage";
import Layout from "@/components/Layout";
import { apiFetch, getToken, clearToken } from "@/lib/api";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["saas-admin-me"],
    queryFn: () => apiFetch("/saas/admin/me"),
    enabled: !!getToken(),
    retry: false,
  });

  if (!getToken()) { setLocation("/login"); return null; }
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (isError) { clearToken(); setLocation("/login"); return null; }
  return <Layout admin={data}>{children}</Layout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <AuthGuard><DashboardPage /></AuthGuard>
      </Route>
      <Route path="/tenants">
        <AuthGuard><TenantsPage /></AuthGuard>
      </Route>
      <Route path="/tenants/new">
        <AuthGuard><TenantOnboardPage /></AuthGuard>
      </Route>
      <Route path="/tenants/:id">
        {(p) => <AuthGuard><TenantDetailPage id={Number(p.id)} /></AuthGuard>}
      </Route>
      <Route path="/tenants/:id/storefront">
        {(p) => <AuthGuard><StorefrontBuilderPage tenantId={Number(p.id)} /></AuthGuard>}
      </Route>
      <Route path="/plans">
        <AuthGuard><PlansPage /></AuthGuard>
      </Route>
      <Route path="/activity">
        <AuthGuard><ActivityPage /></AuthGuard>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
