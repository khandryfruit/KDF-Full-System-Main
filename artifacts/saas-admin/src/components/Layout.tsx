import { useLocation } from "wouter";
import {
  LayoutDashboard, Users, CreditCard, Activity, LogOut,
  Building2, Zap, ChevronRight, Menu, X, Settings,
  Globe, ShoppingBag, Bell,
} from "lucide-react";
import { clearToken } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const NAV = [
  { href: "/",          label: "Dashboard",   icon: LayoutDashboard },
  { href: "/tenants",   label: "Tenants",      icon: Users },
  { href: "/plans",     label: "Plans",        icon: CreditCard },
  { href: "/activity",  label: "Activity",     icon: Activity },
];

export default function Layout({ children, admin }: { children: React.ReactNode; admin?: any }) {
  const [location, setLocation] = useLocation();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    clearToken();
    qc.clear();
    setLocation("/login");
  };

  const NavItems = () => (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? location === "/" : location.startsWith(href);
        return (
          <button
            key={href}
            onClick={() => { setLocation(href); setMobileOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active
                ? "bg-primary text-primary-foreground shadow"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-60 bg-sidebar border-r border-sidebar-border flex flex-col
        transition-transform duration-200
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-sm text-sidebar-foreground">SaaS Platform</p>
            <p className="text-[10px] text-muted-foreground">Super Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Management</p>
          <NavItems />
          <div className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Quick Links</p>
            <button
              onClick={() => window.open("/", "_blank")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-all"
            >
              <Globe className="w-4 h-4" /> KDF NUTS Store
            </button>
            <button
              onClick={() => window.open("/kdf-admin/", "_blank")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-all"
            >
              <ShoppingBag className="w-4 h-4" /> KDF Admin Panel
            </button>
          </div>
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">{admin?.name?.[0] ?? "A"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{admin?.name ?? "Admin"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{admin?.email ?? ""}</p>
            </div>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button className="relative text-muted-foreground hover:text-foreground">
            <Bell className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{admin?.name?.[0] ?? "A"}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
