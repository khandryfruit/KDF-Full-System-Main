import { useLocation, Link } from "wouter";
import { useAuth } from "@/App";
import type { ReactNode } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAV = [
  { href: "/",        icon: "⬛", label: "Dashboard" },
  { href: "/orders",  icon: "📦", label: "Orders"    },
  { href: "/riders",  icon: "🏍️", label: "Riders"    },
  { href: "/modules", icon: "🔧", label: "Modules"   },
];

export default function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-black">K</span>
          </div>
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{user?.name ?? user?.email ?? "Admin"}</span>
          <button
            onClick={logout}
            className="text-xs text-destructive px-2 py-1 rounded-lg hover:bg-destructive/10 transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around z-20">
        {NAV.map(item => {
          const href    = `${BASE}${item.href}`;
          const active  = item.href === "/"
            ? location === "/"
            : location.startsWith(item.href);
          return (
            <Link key={item.href} href={href}>
              <button className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition ${active ? "text-primary" : "text-muted-foreground"}`}>
                <span className="text-xl leading-none">{item.icon}</span>
                <span className={`text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
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
