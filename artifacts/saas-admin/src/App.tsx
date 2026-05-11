import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { clearToken, isLoggedIn, api, setToken } from "@/lib/api";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import TenantsPage from "@/pages/TenantsPage";
import TenantDetailPage from "@/pages/TenantDetailPage";
import PlansPage from "@/pages/PlansPage";
import StorefrontBuilderPage from "@/pages/StorefrontBuilderPage";
import ActivityPage from "@/pages/ActivityPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const NAV = [
  { path: "/", label: "Dashboard", icon: "📊" },
  { path: "/tenants", label: "Tenants", icon: "🏪" },
  { path: "/plans", label: "Plans", icon: "📦" },
  { path: "/storefront", label: "Storefront Builder", icon: "🎨" },
  { path: "/activity", label: "Activity Log", icon: "📋" },
];

function Sidebar({ onLogout }: { onLogout: () => void }) {
  const [location, navigate] = useLocation();

  return (
    <aside className="w-56 flex-shrink-0 bg-[#0d1424] border-r border-slate-800 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm">⚡</div>
          <div>
            <div className="text-white font-bold text-sm">SaaS Platform</div>
            <div className="text-slate-500 text-xs">Super Admin</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const active = item.path === "/" ? location === "/" : location.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <span>🚪</span> Sign Out
        </button>
      </div>
    </aside>
  );
}

function Layout({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen bg-[#080d1a]">
      <Sidebar onLogout={onLogout} />
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function AppRoutes({ onLogout }: { onLogout: () => void }) {
  return (
    <Layout onLogout={onLogout}>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/tenants" component={TenantsPage} />
        <Route path="/tenants/:id" component={TenantDetailPage} />
        <Route path="/plans" component={PlansPage} />
        <Route path="/storefront" component={StorefrontBuilderPage} />
        <Route path="/activity" component={ActivityPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { setAuthed(false); return; }
    api.me().then(() => setAuthed(true)).catch(() => { clearToken(); setAuthed(false); });
  }, []);

  function handleLogin() { setAuthed(true); }
  function handleLogout() { clearToken(); setAuthed(false); }

  if (authed === null) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        {!authed
          ? <LoginPage onLogin={handleLogin} />
          : <AppRoutes onLogout={handleLogout} />
        }
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
