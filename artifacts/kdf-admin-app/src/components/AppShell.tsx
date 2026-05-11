import { useLocation, Link } from "wouter";
import { useAuth } from "@/App";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import {
  LayoutDashboard, Package, Truck, MessageCircle, Grid3X3,
  Bell, ShoppingBag, X, CheckCheck, Trash2, CircleDot,
} from "lucide-react";

/* ── helpers ─────────────────────────────────────────── */
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NOTIF_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  new_order:       ShoppingBag,
  order_update:    Package,
  booking_success: Truck,
};

const NOTIF_COLOR: Record<string, string> = {
  new_order:       "bg-primary/15 text-primary",
  order_update:    "bg-cyan-500/15 text-cyan-400",
  booking_success: "bg-green-500/15 text-green-400",
};

/* ── notification drawer ─────────────────────────────── */
function NotifDrawer({
  token, onClose,
}: { token: string | null; onClose: () => void }) {
  const qc  = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const h   = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

  const { data } = useQuery<any>({
    queryKey: ["notifs"],
    queryFn: () => fetch("/api/admin/notifications?limit=30", { headers: h() }).then(r => r.json()),
    staleTime: 5_000,
  });

  const notifs: any[] = data?.notifications ?? [];

  const markRead = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/notifications/${id}/read`, { method: "PATCH", headers: h() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifs"] }),
  });

  const markAll = useMutation({
    mutationFn: () =>
      fetch("/api/admin/notifications/read-all", { method: "PATCH", headers: h() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifs"] }),
  });

  const clear = useMutation({
    mutationFn: () =>
      fetch("/api/admin/notifications", { method: "DELETE", headers: h() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifs"] }),
  });

  /* close on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const unread = notifs.filter(n => !n.isRead).length;

  return (
    <div ref={ref}
      className="absolute top-14 right-0 left-0 sm:left-auto sm:right-4 sm:w-96 bg-card border border-border shadow-2xl z-40 max-h-[70vh] flex flex-col"
      style={{ borderRadius: "0 0 16px 16px" }}>
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Notifications</span>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-[10px] text-primary px-2 py-1 rounded-lg hover:bg-primary/10">
              <CheckCheck className="w-3 h-3" /> All read
            </button>
          )}
          {notifs.length > 0 && (
            <button onClick={() => clear.mutate()}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* list */}
      <div className="overflow-y-auto flex-1">
        {notifs.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          notifs.map((n: any) => {
            const Icon  = NOTIF_ICON[n.type] ?? CircleDot;
            const color = NOTIF_COLOR[n.type] ?? "bg-muted text-muted-foreground";
            return (
              <button key={n.id}
                onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/50 hover:bg-muted/40 transition ${!n.isRead ? "bg-primary/3" : ""}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-xs font-semibold truncate ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                      {n.title ?? n.type?.replace(/_/g, " ")}
                    </p>
                    {!n.isRead && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  {n.message && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{n.message}</p>
                  )}
                  <p className="text-[9px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt ?? n.created_at ?? "")}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── nav config ──────────────────────────────────────── */
interface NavItem {
  href:  string;
  label: string;
  icon:  React.ComponentType<{ className?: string }>;
}

const ALL_NAV: NavItem[] = [
  { href: "/",          label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders",    label: "Orders",    icon: Package         },
  { href: "/logistics", label: "Logistics", icon: Truck           },
  { href: "/wa",        label: "WhatsApp",  icon: MessageCircle   },
  { href: "/more",      label: "More",      icon: Grid3X3         },
];

/* ── main component ──────────────────────────────────── */
export default function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const [location]       = useLocation();
  const { user, token }  = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);

  const h = () => ({ Authorization: `Bearer ${token}` });

  /* poll unread count every 30s */
  const { data: notifData } = useQuery<any>({
    queryKey: ["notifs"],
    queryFn: () => fetch("/api/admin/notifications?limit=30", { headers: h() }).then(r => r.json()),
    refetchInterval: 30_000,
    enabled: !!token,
  });

  const unread: number = notifData?.unreadCount ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Top bar ── */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
            <span className="text-primary-foreground text-xs font-black">K</span>
          </div>
          <span className="font-semibold text-sm text-foreground tracking-tight">{title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* notification bell */}
          <button
            onClick={() => setShowNotifs(v => !v)}
            className="relative w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted transition"
          >
            <Bell className={`w-4.5 h-4.5 transition ${showNotifs ? "text-primary" : "text-muted-foreground"}`} style={{ width: 18, height: 18 }} />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5 leading-none">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* avatar */}
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-[10px]">
            {(user?.name ?? user?.email ?? "A")[0].toUpperCase()}
          </div>
        </div>
      </header>

      {/* notification drawer */}
      {showNotifs && (
        <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <NotifDrawer token={token} onClose={() => setShowNotifs(false)} />
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-sm border-t border-border flex items-center justify-around z-20 px-1">
        {ALL_NAV.map(item => {
          const active = item.href === "/"
            ? location === "/" || location === ""
            : location.startsWith(item.href);
          const Icon = item.icon;
          /* show unread badge on Orders tab */
          const showBadge = item.href === "/orders" && unread > 0;
          return (
            <Link key={item.href} href={item.href}>
              <button
                onClick={() => setShowNotifs(false)}
                className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all active:scale-95 relative">
                <div className={`w-9 h-8 rounded-xl flex items-center justify-center transition-colors ${active ? "bg-primary/15" : ""}`}>
                  <Icon className={`w-5 h-5 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`} />
                  {showBadge && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </div>
                <span className={`text-[10px] font-semibold leading-none transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
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
