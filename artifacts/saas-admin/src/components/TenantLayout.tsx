import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api, clearTenantToken, isTenantLoggedIn } from "@/lib/api";
import { industryIcon } from "@/lib/utils";

interface TenantInfo {
  storeName: string;
  name: string;
  status: string;
  industry: string;
  plan?: { name: string; tier: string };
}

const NAV = [
  { path: "/portal/dashboard", icon: "📊", label: "Dashboard" },
  { path: "/portal/theme",     icon: "🎨", label: "My Theme" },
  { path: "/portal/settings",  icon: "⚙️", label: "Settings" },
  { path: "/portal/upgrade",   icon: "🚀", label: "Upgrade" },
];

function statusDot(status: string) {
  if (status === "active") return "bg-emerald-500";
  if (status === "trial")  return "bg-amber-500";
  return "bg-slate-500";
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isTenantLoggedIn()) { navigate("/portal/login"); return; }
    api.tenant.me()
      .then((d: any) => setTenant({ storeName: d.storeName, name: d.name, status: d.status, industry: d.industry, plan: d.plan }))
      .catch(() => { clearTenantToken(); navigate("/portal/login"); });
  }, []);

  function handleLogout() {
    clearTenantToken();
    navigate("/portal/login");
  }

  return (
    <div className="flex min-h-screen bg-[#080d1a]">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-16" : "w-56"} flex-shrink-0 bg-[#0d1424] border-r border-slate-800 flex flex-col h-screen sticky top-0 transition-all duration-200`}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-800 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xs flex-shrink-0">
                {tenant ? industryIcon(tenant.industry) : "⚡"}
              </div>
              <div className="min-w-0">
                <div className="text-white font-bold text-xs truncate">{tenant?.storeName ?? "My Store"}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${statusDot(tenant?.status ?? "trial")}`} />
                  <span className="text-slate-500 text-xs capitalize">{tenant?.status ?? "loading"}</span>
                </div>
              </div>
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)} className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0">
            {collapsed ? "→" : "←"}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = location === item.path || location.startsWith(item.path + "/");
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {!collapsed && item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-slate-800 space-y-0.5">
          {!collapsed && tenant?.plan && (
            <div className="px-3 py-2 rounded-lg bg-slate-800/50">
              <p className="text-xs text-slate-500">Current plan</p>
              <p className="text-xs font-semibold text-white capitalize">{tenant.plan.name}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? "Sign Out" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all ${collapsed ? "justify-center" : ""}`}
          >
            <span>🚪</span>
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
