import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { apiPublicUrl } from "@/lib/apiBase";
import { safeJsonParse } from "@/lib/safeJson";

/* ═══════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════ */
export type SoundType = "wa_message" | "new_order" | "rider_update" | "payment" | "delivered";

export interface SoundSettings {
  enabled: boolean;
  volume: number;
  muteWa: boolean;
  muteOrders: boolean;
  muteRider: boolean;
  mutePayment: boolean;
  quietMode: boolean;
  quietFrom: string;
  quietTo: string;
}

export interface ToastPayload {
  id: string;
  type: SoundType | "system";
  title: string;
  message: string;
  link?: string;
  conversationId?: number;
  orderId?: number;
  timestamp: number;
}

export interface NotificationCtx {
  waUnread: number;
  orderUnread: number;
  setWaUnread: (n: number) => void;
  setOrderUnread: (n: number) => void;
  decrementWaUnread: () => void;
  soundSettings: SoundSettings;
  updateSoundSettings: (s: Partial<SoundSettings>) => void;
  playSound: (type: SoundType) => void;
  toasts: ToastPayload[];
  dismissToast: (id: string) => void;
  pushPermission: NotificationPermission;
  requestPushPermission: () => Promise<void>;
}

/* ═══════════════════════════════════════════════════════════
   SOUND ENGINE — Web Audio API (no files needed)
═══════════════════════════════════════════════════════════ */
const audioCtxRef = { current: null as AudioContext | null };

function getAudioCtx(): AudioContext | null {
  try {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  } catch {
    return null;
  }
}

function playTone(freqs: { f: number; t: number; dur: number }[], volume = 0.35) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
  resume.then(() => {
    freqs.forEach(({ f, t, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, ctx.currentTime + t);
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    });
  }).catch(() => {});
}

const SOUNDS: Record<SoundType, (vol: number) => void> = {
  wa_message: (vol) => playTone([
    { f: 880, t: 0,    dur: 0.15 },
    { f: 660, t: 0.18, dur: 0.15 },
  ], vol),
  new_order: (vol) => playTone([
    { f: 523, t: 0,    dur: 0.12 },
    { f: 659, t: 0.13, dur: 0.12 },
    { f: 784, t: 0.26, dur: 0.22 },
  ], vol),
  rider_update: (vol) => playTone([
    { f: 440, t: 0,    dur: 0.10 },
    { f: 550, t: 0.12, dur: 0.10 },
  ], vol),
  payment: (vol) => playTone([
    { f: 880, t: 0,    dur: 0.10 },
    { f: 1047, t: 0.12, dur: 0.10 },
    { f: 1319, t: 0.24, dur: 0.20 },
    { f: 1047, t: 0.46, dur: 0.15 },
  ], vol),
  delivered: (vol) => playTone([
    { f: 523, t: 0,    dur: 0.08 },
    { f: 784, t: 0.10, dur: 0.08 },
    { f: 1047, t: 0.20, dur: 0.25 },
  ], vol),
};

/* ═══════════════════════════════════════════════════════════
   QUIET MODE CHECK
═══════════════════════════════════════════════════════════ */
function isQuietTime(from: string, to: string): boolean {
  const now = new Date();
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const fromMin = (fh || 22) * 60 + (fm || 0);
  const toMin   = (th || 7)  * 60 + (tm || 0);
  if (fromMin <= toMin) return nowMin >= fromMin && nowMin < toMin;
  return nowMin >= fromMin || nowMin < toMin;
}

/* ═══════════════════════════════════════════════════════════
   DEFAULT SETTINGS
═══════════════════════════════════════════════════════════ */
const DEFAULT_SOUND: SoundSettings = {
  enabled: true,
  volume: 0.4,
  muteWa: false,
  muteOrders: false,
  muteRider: false,
  mutePayment: false,
  quietMode: false,
  quietFrom: "22:00",
  quietTo: "07:00",
};

function loadSoundSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem("kdf_sound_settings");
    if (raw) return { ...DEFAULT_SOUND, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SOUND;
}

/* ═══════════════════════════════════════════════════════════
   CONTEXT
═══════════════════════════════════════════════════════════ */
const Ctx = createContext<NotificationCtx | null>(null);

export function useNotifications(): NotificationCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}

/* ═══════════════════════════════════════════════════════════
   PROVIDER
═══════════════════════════════════════════════════════════ */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [waUnread,    setWaUnread]    = useState(0);
  const [orderUnread, setOrderUnread] = useState(0);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(loadSoundSettings);
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const sseRef = useRef<EventSource | null>(null);
  const toastDedup = useRef<Set<string>>(new Set());

  /* Persist sound settings */
  useEffect(() => {
    try { localStorage.setItem("kdf_sound_settings", JSON.stringify(soundSettings)); } catch {}
  }, [soundSettings]);

  const updateSoundSettings = useCallback((s: Partial<SoundSettings>) => {
    setSoundSettings(prev => ({ ...prev, ...s }));
  }, []);

  /* ── Sound player ── */
  const playSound = useCallback((type: SoundType) => {
    const s = soundSettings;
    if (!s.enabled) return;
    if (s.quietMode && isQuietTime(s.quietFrom, s.quietTo)) return;
    if (type === "wa_message" && s.muteWa) return;
    if (type === "new_order"  && s.muteOrders) return;
    if (type === "rider_update" && s.muteRider) return;
    if (type === "payment"    && s.mutePayment) return;
    SOUNDS[type]?.(s.volume);
  }, [soundSettings]);

  /* ── Push permission ── */
  useEffect(() => {
    if ("Notification" in window) setPushPermission(Notification.permission);
  }, []);

  const requestPushPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setPushPermission(perm);
  }, []);

  /* ── Browser push ── */
  const sendPush = useCallback((title: string, body: string, link?: string) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      const n = new Notification(title, {
        body,
        icon: "/admin/favicon.ico",
        badge: "/admin/favicon.ico",
        tag: `kdf-${Date.now()}`,
      });
      if (link) n.onclick = () => { setLocation(link); window.focus(); n.close(); };
    } catch {}
  }, [setLocation]);

  /* ── Add toast helper ── */
  const addToast = useCallback((t: Omit<ToastPayload, "id" | "timestamp">) => {
    const key = `${t.type}-${t.title}-${t.message}`;
    if (toastDedup.current.has(key)) return;
    toastDedup.current.add(key);
    setTimeout(() => toastDedup.current.delete(key), 3000);

    const payload: ToastPayload = { ...t, id: `${Date.now()}-${Math.random()}`, timestamp: Date.now() };
    setToasts(prev => [payload, ...prev].slice(0, 5));
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== payload.id)), 7000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /* ── Fetch initial WA unread ── */
  const fetchWaUnread = useCallback(async () => {
    const token = localStorage.getItem("kdf_admin_token");
    if (!token) return;
    try {
      const r = await fetch("/api/admin/wa/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d = await r.json();
        setWaUnread(d.total ?? 0);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchWaUnread(); }, [fetchWaUnread]);

  /* ── SSE connection (singleton) ── */
  useEffect(() => {
    const token = localStorage.getItem("kdf_admin_token");
    if (!token) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const es = new EventSource(
        apiPublicUrl(`/api/admin/sse?token=${encodeURIComponent(token!)}`),
      );
      sseRef.current = es;

      /* ── WA message (inbound) ── */
      es.addEventListener("wa_message", (e: MessageEvent) => {
        const d = safeJsonParse<Record<string, unknown>>(e.data, {});
        if (d.direction !== "in") return;

        setWaUnread(n => n + 1);
        playSound("wa_message");

        const name = String(d.contactName ?? d.phone ?? "Customer");
        const content = typeof d.content === "string" ? d.content : "";
        const preview = content ? (content.length > 50 ? content.slice(0, 50) + "…" : content) : "New message";
        const conversationId = typeof d.conversationId === "number" ? d.conversationId : undefined;

        addToast({
          type: "wa_message",
          title: `💬 ${name}`,
          message: preview,
          link: "/wa-inbox",
          conversationId,
        });
        sendPush(`WhatsApp: ${name}`, preview, "/wa-inbox");
      });

      /* ── WA unread count sync ── */
      es.addEventListener("wa_unread_count", (e: MessageEvent) => {
        const d = safeJsonParse<{ total?: number }>(e.data, {});
        setWaUnread(d.total ?? 0);
      });

      /* ── New order ── */
      es.addEventListener("new_order", (e: MessageEvent) => {
        const d = safeJsonParse<Record<string, unknown>>(e.data, {});
        setOrderUnread(n => n + 1);
        playSound("new_order");

        addToast({
          type: "new_order",
          title: `🛒 New Order!`,
          message: String(d.message ?? `Order #${d.orderId} received`),
          link: "/orders",
          orderId: typeof d.orderId === "number" ? d.orderId : undefined,
        });
        sendPush("New Order Received!", String(d.message ?? `Order #${d.orderId}`), "/orders");
      });

      /* ── Shopify new order ── */
      es.addEventListener("new_shopify_order", (e: MessageEvent) => {
        const d = safeJsonParse<Record<string, unknown>>(e.data, {});
        setOrderUnread(n => n + 1);
        playSound("new_order");

        addToast({
          type: "new_order",
          title: `🛒 Shopify Order!`,
          message: String(d.message ?? `Order ${d.orderName ?? d.orderId} received`),
          link: "/shopify/orders",
          orderId: typeof d.orderId === "number" ? d.orderId : undefined,
        });
        sendPush("New Shopify Order!", String(d.message ?? `Order ${d.orderName}`), "/shopify/orders");
      });

      /* ── Rider update ── */
      es.addEventListener("rider_status_update", (e: MessageEvent) => {
        const d = safeJsonParse<Record<string, unknown>>(e.data, {});
        playSound("rider_update");

        addToast({
          type: "rider_update",
          title: `🚴 Rider Update`,
          message: d.message || `Delivery status updated`,
          link: "/logistics/riders",
        });
        sendPush("Rider Update", d.message || "Delivery status changed", "/logistics/riders");
      });

      /* ── Payment confirmed ── */
      es.addEventListener("payment_confirmed", (e: MessageEvent) => {
        const d = safeJsonParse<Record<string, unknown>>(e.data, {});
        playSound("payment");

        addToast({
          type: "payment",
          title: `💰 Payment Received!`,
          message: d.message || "Customer confirmed payment",
          link: "/orders",
        });
        sendPush("Payment Confirmed!", d.message || "Customer confirmed payment", "/orders");
      });

      /* ── Order delivered ── */
      es.addEventListener("order_delivered", (e: MessageEvent) => {
        const d = safeJsonParse<Record<string, unknown>>(e.data, {});
        playSound("delivered");

        addToast({
          type: "delivered",
          title: `✅ Order Delivered`,
          message: d.message || "Order delivered successfully",
          link: "/orders",
        });
        sendPush("Order Delivered!", d.message || "Order delivered", "/orders");
      });

      es.onerror = () => {
        es.close();
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      sseRef.current?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [playSound, addToast, sendPush]);

  const decrementWaUnread = useCallback(() => {
    setWaUnread(n => Math.max(0, n - 1));
  }, []);

  return (
    <Ctx.Provider value={{
      waUnread, orderUnread,
      setWaUnread, setOrderUnread, decrementWaUnread,
      soundSettings, updateSoundSettings, playSound,
      toasts, dismissToast,
      pushPermission, requestPushPermission,
    }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} setLocation={setLocation} />
    </Ctx.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════
   TOAST CONTAINER — enterprise-style, stacked
═══════════════════════════════════════════════════════════ */
const TOAST_ICONS: Record<string, string> = {
  wa_message:   "💬",
  new_order:    "🛒",
  rider_update: "🚴",
  payment:      "💰",
  delivered:    "✅",
  system:       "🔔",
};
const TOAST_COLORS: Record<string, string> = {
  wa_message:   "border-l-[#25D366]",
  new_order:    "border-l-amber-400",
  rider_update: "border-l-blue-400",
  payment:      "border-l-emerald-500",
  delivered:    "border-l-purple-400",
  system:       "border-l-gray-400",
};

function ToastContainer({
  toasts,
  onDismiss,
  setLocation,
}: {
  toasts: ToastPayload[];
  onDismiss: (id: string) => void;
  setLocation: (p: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t, i) => (
        <div
          key={t.id}
          style={{ animationDelay: `${i * 30}ms` }}
          className={`
            pointer-events-auto w-72 bg-white border border-gray-200 border-l-4 ${TOAST_COLORS[t.type] ?? "border-l-gray-400"}
            rounded-xl shadow-2xl p-3 flex items-start gap-3
            animate-in slide-in-from-right-4 fade-in-0 duration-300
          `}
        >
          <div className="text-xl leading-none flex-shrink-0 mt-0.5">{TOAST_ICONS[t.type] ?? "🔔"}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-xs text-gray-900 leading-tight">{t.title}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{t.message}</p>
            {t.link && (
              <button
                onClick={() => { setLocation(t.link!); onDismiss(t.id); }}
                className="text-[10px] text-[#5FA800] font-semibold mt-1 hover:underline"
              >
                View →
              </button>
            )}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-0.5 rounded hover:bg-gray-100 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
