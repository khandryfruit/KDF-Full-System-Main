import { useLocation, Link } from "wouter";
import { useAuth } from "@/App";
import type { ReactNode } from "react";
import {
  LayoutDashboard, Package, Bike, MessageCircle, Grid3X3, LogOut,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ComponentType<{ className?: string }>;
}

const ALL_NAV: NavItem[] = [
  { href: "/",        label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders",  label: "Orders",    icon: Package         },
  { href: "/riders",  label: "Riders",    icon: Bike            },
  { href: "/wa",      label: "WhatsApp",  icon: MessageCircle   },
  { href: "/more",    label: "More",      icon: Grid3X3         },
];

export default function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

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
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-[10px]">
            {(user?.name ?? user?.email ?? "A")[0].toUpperCase()}
          </div>
          <span className="text-xs text-muted-foreground max-w-[90px] truncate hidden sm:block">
            {user?.name ?? user?.email ?? "Admin"}
          </span>
          <button
            onClick={logout}
            title="Logout"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-sm border-t border-border flex items-center justify-around z-20 px-1">
        {ALL_NAV.map(item => {
          const href   = `${BASE}${item.href}`;
          const active = item.href === "/"
            ? location === "/" || location === "" || location === BASE
            : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={href}>
              <button className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all active:scale-95">
                <div className={`w-9 h-8 rounded-xl flex items-center justify-center transition-colors ${
                  active ? "bg-primary/15" : ""
                }`}>
                  <Icon className={`w-5 h-5 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <span className={`text-[10px] font-semibold leading-none transition-colors ${
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
