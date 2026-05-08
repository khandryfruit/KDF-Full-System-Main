import { useState, useEffect, useRef } from "react";
import {
  Bell, X, ShoppingCart, MessageCircle, Truck, CreditCard,
  Package, CheckCheck, Trash2, Volume2, VolumeX, Settings,
  Check,
} from "lucide-react";
import { useLocation } from "wouter";
import { useNotifications, type SoundSettings } from "@/context/NotificationContext";

/* ── Admin API helper ── */
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

function fmt(d: string) {
  const date = new Date(d);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
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

const TYPE_ICON: Record<string, React.ElementType> = {
  order:   ShoppingCart,
  wa:      MessageCircle,
  rider:   Truck,
  payment: CreditCard,
  default: Package,
};

const TYPE_COLOR: Record<string, string> = {
  order:   "bg-amber-50 text-amber-600",
  wa:      "bg-emerald-50 text-emerald-600",
  rider:   "bg-blue-50 text-blue-600",
  payment: "bg-purple-50 text-purple-600",
  default: "bg-gray-50 text-gray-500",
};

/* ═══════════════════════════════════════════════
   SOUND SETTINGS PANEL
═══════════════════════════════════════════════ */
function SoundPanel({ settings, onChange, onClose }: {
  settings: SoundSettings;
  onChange: (s: Partial<SoundSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-[60] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#5FA800]" />
          <span className="font-semibold text-sm">Sound Settings</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4 space-y-4">

        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings.enabled ? <Volume2 className="w-4 h-4 text-[#5FA800]" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
            <span className="text-sm font-medium">Notification Sounds</span>
          </div>
          <button
            onClick={() => onChange({ enabled: !settings.enabled })}
            className={`relative w-10 h-5 rounded-full transition-colors ${settings.enabled ? "bg-[#5FA800]" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Volume slider */}
        {settings.enabled && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Volume</span>
              <span className="text-xs font-medium text-[#5FA800]">{Math.round(settings.volume * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05"
              value={settings.volume}
              onChange={e => onChange({ volume: parseFloat(e.target.value) })}
              className="w-full h-1.5 rounded-full appearance-none bg-muted accent-[#5FA800]"
            />
          </div>
        )}

        {/* Mute per category */}
        {settings.enabled && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mute Categories</p>
            {[
              { key: "muteWa",      label: "WhatsApp Messages", icon: "💬" },
              { key: "muteOrders",  label: "New Orders",        icon: "🛒" },
              { key: "muteRider",   label: "Rider Updates",     icon: "🚴" },
              { key: "mutePayment", label: "Payments",          icon: "💰" },
            ].map(({ key, label, icon }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs flex items-center gap-1.5">{icon} {label}</span>
                <button
                  onClick={() => onChange({ [key]: !settings[key as keyof SoundSettings] })}
                  className={`relative w-8 h-4 rounded-full transition-colors ${settings[key as keyof SoundSettings] ? "bg-red-400" : "bg-[#5FA800]"}`}
                >
                  <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${settings[key as keyof SoundSettings] ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quiet mode */}
        {settings.enabled && (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">🌙 Quiet Mode</span>
              <button
                onClick={() => onChange({ quietMode: !settings.quietMode })}
                className={`relative w-8 h-4 rounded-full transition-colors ${settings.quietMode ? "bg-[#5FA800]" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${settings.quietMode ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {settings.quietMode && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="time" value={settings.quietFrom}
                  onChange={e => onChange({ quietFrom: e.target.value })}
                  className="border border-border rounded px-1 py-0.5 text-xs bg-background"
                />
                <span>to</span>
                <input
                  type="time" value={settings.quietTo}
                  onChange={e => onChange({ quietTo: e.target.value })}
                  className="border border-border rounded px-1 py-0.5 text-xs bg-background"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export function NotificationBell() {
  const [, setLocation] = useLocation();
  const { orderUnread, setOrderUnread, soundSettings, updateSoundSettings, pushPermission, requestPushPermission } = useNotifications();
  const [open, setOpen] = useState(false);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(orderUnread);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* Sync local unread with context orderUnread */
  useEffect(() => { setUnreadCount(c => c + orderUnread); }, [orderUnread]);

  /* Close on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSoundPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Fetch notifications */
  const fetchNotifs = async () => {
    try {
      const data = await apiFetch("/api/admin/notifications");
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setOrderUnread(0);
    } catch {}
  };

  useEffect(() => { fetchNotifs(); }, []);

  const markAllRead = async () => {
    try {
      await apiFetch("/api/admin/notifications/read-all", { method: "PATCH" });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const markRead = async (id: number) => {
    try {
      await apiFetch(`/api/admin/notifications/${id}/read`, { method: "PATCH" });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  };

  const deleteNotif = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
      const removed = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (removed && !removed.isRead) setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  };

  const handleNotifClick = async (n: Notification) => {
    if (!n.isRead) await markRead(n.id);
    setOpen(false);
    if (n.type === "order" || n.orderId) setLocation("/orders");
    else if (n.type === "wa") setLocation("/wa-inbox");
    else if (n.type === "rider") setLocation("/logistics/riders");
    else if (n.type === "payment") setLocation("/orders");
  };

  const totalBadge = unreadCount;

  return (
    <div ref={dropdownRef} className="relative">

      {/* ── Bell Button ── */}
      <button
        onClick={() => { setOpen(o => !o); setShowSoundPanel(false); if (!open) fetchNotifs(); }}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        title="Notifications"
      >
        <Bell className={`w-5 h-5 ${totalBadge > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
        {totalBadge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none animate-in zoom-in-50 duration-200">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
        {/* Pulsing ring when unread */}
        {totalBadge > 0 && (
          <span className="absolute inset-0 rounded-lg animate-ping bg-amber-400/20 pointer-events-none" />
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && !showSoundPanel && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#5FA800]" />
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{unreadCount} new</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Sound toggle */}
              <button
                onClick={() => setShowSoundPanel(true)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                title="Sound settings"
              >
                {soundSettings.enabled
                  ? <Volume2 className="w-3.5 h-3.5 text-[#5FA800]" />
                  : <VolumeX className="w-3.5 h-3.5 text-red-400" />}
              </button>
              {/* Push permission */}
              {pushPermission === "default" && (
                <button
                  onClick={() => { requestPushPermission(); }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  title="Enable browser notifications"
                >
                  <Bell className="w-3.5 h-3.5" />
                </button>
              )}
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-[#5FA800] hover:underline font-medium flex items-center gap-1 px-1">
                  <CheckCheck className="w-3 h-3" /> All read
                </button>
              )}
            </div>
          </div>

          {/* Push permission banner */}
          {pushPermission === "default" && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <span className="text-[11px] text-blue-700">Enable browser notifications</span>
              <button
                onClick={requestPushPermission}
                className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded hover:bg-blue-200 transition-colors"
              >
                Enable
              </button>
            </div>
          )}
          {pushPermission === "granted" && (
            <div className="px-4 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-1.5">
              <Check className="w-3 h-3 text-emerald-600" />
              <span className="text-[11px] text-emerald-700 font-medium">Browser notifications active</span>
            </div>
          )}

          {/* List */}
          <div className="max-h-[340px] overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Bell className="w-8 h-8 opacity-20" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICON[n.type] ?? TYPE_ICON.default;
                const colorClass = TYPE_COLOR[n.type] ?? TYPE_COLOR.default;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 group ${!n.isRead ? "bg-[#5FA800]/5" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
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
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-[#5FA800] flex-shrink-0 mt-1.5 animate-pulse" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2.5 flex items-center justify-between bg-muted/20">
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

      {/* ── Sound Settings Panel ── */}
      {open && showSoundPanel && (
        <SoundPanel
          settings={soundSettings}
          onChange={updateSoundSettings}
          onClose={() => setShowSoundPanel(false)}
        />
      )}
    </div>
  );
}
