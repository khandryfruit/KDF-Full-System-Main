import { useLocation, Link } from "wouter";
import { useAuth, useModules } from "@/App";
import type { ReactNode } from "react";
import {
  LayoutDashboard, Package, Bike, Sliders, LogOut, Bell,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NavItem {
  href:       string;
  label:      string;
  icon:       React.ComponentType<{ className?: string }>;
  moduleKey?: string;
}

const ALL_NAV: NavItem[] = [
  { href: "/",        label: "Dashboard", icon: LayoutDashboard                     },
  { href: "/orders",  label: "Orders",    icon: Package,    moduleKey: "ecommerce"  },
  { href: "/riders",  label: "Riders",    icon: Bike,       moduleKey: "riders"     },
  { href: "/modules", label: "Modules",   icon: Sliders                             },
];

export default function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [location]              = useLocation();
  const { user, logout }        = useAuth();
  const { activeModules }       = useModules();

  const visibleNav = ALL_NAV.filter(item =>
    !item.moduleKey || activeModules.includes(item.moduleKey)
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Top bar ── */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
            <span className="text-primary-foreground text-xs font-black">K</span>
          </div>
          <span className="font-semibold text-sm text-foreground tracking-tight">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2 mr-1">
            <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-[10px]">
              {(user?.name ?? user?.email ?? "A")[0].toUpperCase()}
            </div>
            <span className="text-xs text-muted-foreground max-w-[80px] truncate hidden sm:block">
              {user?.name ?? user?.email ?? "Admin"}
            </span>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-sm border-t border-border flex items-center justify-around z-20 px-2">
        {visibleNav.map(item => {
          const href   = `${BASE}${item.href}`;
          const active = item.href === "/"
            ? location === "/" || location === ""
            : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={href}>
              <button className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                  active ? "bg-primary/12" : ""
                }`}>
                  <Icon className={`w-4.5 h-4.5 ${active ? "text-primary" : ""}`} />
                </div>
                <span className={`text-[10px] font-semibold leading-none ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}>
                  {item.label}
                </span>
              </button>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
