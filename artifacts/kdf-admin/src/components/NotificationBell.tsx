import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, Package, ShoppingCart, CheckCheck, Trash2 } from "lucide-react";
import { useLocation } from "wouter";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  orderId?: number;
  createdAt: string;
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const times = [0, 0.18];
    times.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime + t);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + t + 0.15);
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.25);
    });
  } catch { /* AudioContext not available */ }
}

function fmt(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return date.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<Notification | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/notifications");
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch { /* ignore */ }
  }, []);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Initial fetch */
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  /* SSE connection */
  useEffect(() => {
    const token = ADMIN_TOKEN();
    if (!token) return;

    function connect() {
      const es = new EventSource(`/api/admin/sse?token=${encodeURIComponent(token)}`);
      sseRef.current = es;

      es.addEventListener("new_order", (e: MessageEvent) => {
        const data = JSON.parse(e.data) as Notification;
        setNotifications(prev => [data, ...prev].slice(0, 50));
        setUnreadCount(c => c + 1);
        playNotificationSound();

        /* Toast popup */
        setToast(data);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 6000);
      });

      es.onerror = () => {
        es.close();
        /* Reconnect after 5s */
        setTimeout(connect, 5000);
      };
    }

    connect();
    return () => { sseRef.current?.close(); };
  }, []);

  const markAllRead = async () => {
    try {
      await apiFetch("/api/admin/notifications/read-all", { method: "PATCH" });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const markRead = async (id: number) => {
    try {
      await apiFetch(`/api/admin/notifications/${id}/read`, { method: "PATCH" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const deleteNotif = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
      const removed = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (removed && !removed.isRead) setUnreadCount(c => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const handleNotifClick = async (n: Notification) => {
    if (!n.isRead) await markRead(n.id);
    if (n.orderId) {
      setOpen(false);
      setLocation("/orders");
    }
  };

  return (
    <>
      {/* Bell Button */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="relative p-2 rounded-lg hover:bg-muted transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#5FA800]" />
                <span className="font-semibold text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{unreadCount} new</span>
                )}
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-[#5FA800] hover:underline font-medium flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" />Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Bell className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 group ${!n.isRead ? "bg-[#5FA800]/5" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${n.type === "order" ? "bg-[#5FA800]/10" : "bg-blue-50"}`}>
                      {n.type === "order"
                        ? <ShoppingCart className="w-4 h-4 text-[#5FA800]" />
                        : <Package className="w-4 h-4 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-xs leading-snug ${!n.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>{n.title}</p>
                        <button
                          onClick={(e) => deleteNotif(n.id, e)}
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{fmt(n.createdAt)}</p>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-[#5FA800] flex-shrink-0 mt-1.5" />}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
                <button onClick={() => { setLocation("/orders"); setOpen(false); }} className="text-xs text-[#5FA800] font-medium hover:underline">
                  View all orders →
                </button>
                <button
                  onClick={async () => {
                    try { await apiFetch("/api/admin/notifications", { method: "DELETE" }); setNotifications([]); setUnreadCount(0); } catch {}
                  }}
                  className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast Popup */}
      {toast && (
        <div className="fixed top-4 right-4 z-[9999] w-72 bg-card border border-border rounded-xl shadow-2xl p-4 animate-in slide-in-from-right-5 fade-in-0 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#5FA800]/10 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-5 h-5 text-[#5FA800]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{toast.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{toast.message}</p>
              {toast.orderId && (
                <button
                  onClick={() => { setLocation("/orders"); setToast(null); }}
                  className="text-xs text-[#5FA800] font-medium mt-1.5 hover:underline"
                >
                  View order →
                </button>
              )}
            </div>
            <button onClick={() => setToast(null)} className="text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
