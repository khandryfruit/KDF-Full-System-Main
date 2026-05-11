import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { useLocation } from "wouter";
import {
  BarChart3, Users, MessageCircle, Sliders,
  Package, CreditCard, Store, Bell, GitBranch, Truck,
  LogOut, Bike, Receipt,
} from "lucide-react";


interface MenuItem {
  label: string;
  desc:  string;
  icon:  React.ComponentType<{ className?: string }>;
  color: string;
  bg:    string;
  href:  string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: "Analytics",
    desc:  "Revenue, orders & trends",
    icon:  BarChart3,
    color: "text-purple-400",
    bg:    "bg-purple-500/15",
    href:  "/analytics",
  },
  {
    label: "Customers",
    desc:  "Browse & search customers",
    icon:  Users,
    color: "text-blue-400",
    bg:    "bg-blue-500/15",
    href:  "/customers",
  },
  {
    label: "WhatsApp",
    desc:  "Conversations & broadcasts",
    icon:  MessageCircle,
    color: "text-green-400",
    bg:    "bg-green-500/15",
    href:  "/wa",
  },
  {
    label: "Logistics",
    desc:  "Courier bookings & tracking",
    icon:  Truck,
    color: "text-orange-400",
    bg:    "bg-orange-500/15",
    href:  "/logistics",
  },
  {
    label: "Riders",
    desc:  "Lahore delivery fleet",
    icon:  Bike,
    color: "text-teal-400",
    bg:    "bg-teal-500/15",
    href:  "/riders",
  },
  {
    label: "Products",
    desc:  "Inventory & catalogue",
    icon:  Package,
    color: "text-cyan-400",
    bg:    "bg-cyan-500/15",
    href:  "/products",
  },
  {
    label: "POS / Invoice",
    desc:  "Fast billing & invoices",
    icon:  Receipt,
    color: "text-violet-400",
    bg:    "bg-violet-500/15",
    href:  "/pos",
  },
  {
    label: "Payments",
    desc:  "Payment settings",
    icon:  CreditCard,
    color: "text-pink-400",
    bg:    "bg-pink-500/15",
    href:  "/payments",
  },
  {
    label: "Branches",
    desc:  "Multi-branch management",
    icon:  GitBranch,
    color: "text-indigo-400",
    bg:    "bg-indigo-500/15",
    href:  "/branches",
  },
  {
    label: "Store",
    desc:  "Storefront & SEO settings",
    icon:  Store,
    color: "text-emerald-400",
    bg:    "bg-emerald-500/15",
    href:  "/store",
  },
  {
    label: "Notifications",
    desc:  "Push & WA notifications",
    icon:  Bell,
    color: "text-amber-400",
    bg:    "bg-amber-500/15",
    href:  "/notifications",
  },
  {
    label: "Modules",
    desc:  "Feature visibility controls",
    icon:  Sliders,
    color: "text-muted-foreground",
    bg:    "bg-muted",
    href:  "/modules",
  },
];

export default function MorePage() {
  const { user, logout } = useAuth();
  const [, navigate]     = useLocation();

  return (
    <AppShell title="More">
      <div className="p-4 space-y-4">
        {/* User card */}
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary text-lg">
            {(user?.name ?? user?.email ?? "A")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{user?.name ?? "Admin"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
            {user?.isSuper && (
              <span className="inline-flex mt-1 px-2 py-0.5 bg-amber-500/15 text-amber-400 text-[10px] font-bold rounded-full">
                Super Admin
              </span>
            )}
          </div>
        </div>

        {/* Menu grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {MENU_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5 text-left active:scale-95 transition-transform hover:border-primary/30"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.bg}`}>
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-2xl text-destructive text-sm font-semibold active:scale-[0.99] transition-transform"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>

        <p className="text-center text-[10px] text-muted-foreground pb-2">
          KDF Admin App v2.0 · KDF NUTS
        </p>
      </div>
    </AppShell>
  );
}
