import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Bike, RefreshCw, Users, Package,
  Wifi, WifiOff, Navigation, Radio, AlertCircle, Phone,
  Clock, TrendingUp, Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/* ── Fix Leaflet default icon paths broken by Vite ── */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const API = "/api";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
async function apiFetch(path: string) {
  const r = await fetch(`${API}${path}`, { headers: hdr() });
  return r.json();
}

function isStale(ts: string | null): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > 10 * 60 * 1000;
}
function timeSince(ts: string | null): string {
  if (!ts) return "Never";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STATUS_COLOR: Record<string, string> = {
  active:   "#22c55e",
  busy:     "#f97316",
  inactive: "#94a3b8",
};

/* ── Create Leaflet divIcon for a rider ── */
function createRiderIcon(rider: any, stale: boolean) {
  const color   = stale ? "#f97316" : (STATUS_COLOR[rider.status] ?? "#22c55e");
  const initial = rider.name.charAt(0).toUpperCase();
  const orders  = Array.isArray(rider.active_orders) ? rider.active_orders.length : 0;

  const html = `
    <style>
      @keyframes kdf-pulse {
        0%,100% { transform:scale(1);   opacity:.25; }
        50%      { transform:scale(1.7); opacity:.08; }
      }
    </style>
    <div style="position:relative;cursor:pointer;width:40px;height:40px;">
      ${!stale ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${color};opacity:.2;animation:kdf-pulse 2s ease-in-out infinite;"></div>` : ""}
      <div style="
        width:40px;height:40px;border-radius:50%;
        background:${color};border:3px solid #fff;
        box-shadow:0 4px 14px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        font-weight:900;font-size:16px;color:#fff;
        font-family:system-ui,sans-serif;position:relative;z-index:1;">
        ${initial}
      </div>
      ${orders > 0 ? `<div style="
        position:absolute;top:-3px;right:-3px;z-index:2;
        background:#ef4444;color:#fff;border-radius:50%;
        width:18px;height:18px;font-size:10px;font-weight:700;
        display:flex;align-items:center;justify-content:center;
        border:2px solid #fff;font-family:system-ui,sans-serif;
        box-shadow:0 2px 6px rgba(0,0,0,.25);">
        ${orders > 9 ? "9+" : orders}
      </div>` : ""}
    </div>`;

  return L.divIcon({
    className: "",
    html,
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
    popupAnchor:[0, -24],
  });
}

/* ── Rider popup HTML ── */
function buildPopupHtml(rider: any) {
  const orders = Array.isArray(rider.active_orders) ? rider.active_orders : [];
  const stale  = isStale(rider.location_updated_at);
  const color  = STATUS_COLOR[rider.status] ?? "#94a3b8";

  const ordersHtml = orders.length > 0
    ? orders.slice(0, 3).map((o: any) => `
        <div style="margin:4px 0;padding:7px 9px;background:#f8fafc;border-radius:8px;font-size:12px;border:1px solid #e2e8f0;">
          <div style="font-weight:700;color:#1e293b;">#${o.shopify_order_number} · ${o.customer_name}</div>
          <div style="color:#64748b;margin-top:2px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${o.delivery_address ?? ""}</div>
          <div style="color:#f97316;font-weight:700;margin-top:3px;font-size:12px;">PKR ${Number(o.cod_amount ?? 0).toLocaleString()}</div>
        </div>`).join("")
    : `<div style="color:#94a3b8;font-size:12px;padding:4px 0;text-align:center;">No active orders</div>`;

  const mapsUrl = `https://www.google.com/maps?q=${rider.location_lat},${rider.location_lng}`;

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:230px;max-width:270px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;">
        <div style="width:38px;height:38px;border-radius:50%;background:${color};
          display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:16px;
          flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.2);">
          ${rider.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-weight:700;font-size:14px;color:#0f172a;">${rider.name}</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px;">${rider.phone ?? ""} · ${rider.vehicle_type ?? "Bike"}</div>
          <div style="display:flex;align-items:center;gap:4px;font-size:10px;margin-top:3px;color:${stale ? "#f97316" : "#22c55e"};">
            <span style="font-size:8px;">●</span>
            <span>${stale ? "Stale · " : "Live · "}${timeSince(rider.location_updated_at)}</span>
          </div>
        </div>
      </div>

      ${orders.length > 0 ? `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Active Orders (${orders.length})</div>` : ""}
      ${ordersHtml}

      <div style="margin-top:10px;display:flex;gap:7px;">
        <a href="${mapsUrl}" target="_blank"
          style="flex:1;text-align:center;padding:7px;background:#3b82f6;color:white;border-radius:8px;
          font-size:11px;font-weight:700;text-decoration:none;display:block;">
          📍 Google Maps
        </a>
        <a href="tel:${rider.phone}"
          style="flex:1;text-align:center;padding:7px;background:#22c55e;color:white;border-radius:8px;
          font-size:11px;font-weight:700;text-decoration:none;display:block;">
          📞 Call Rider
        </a>
      </div>
    </div>`;
}

/* ── Sidebar rider card ── */
function RiderCard({ rider, selected, onClick }: { rider: any; selected: boolean; onClick: () => void }) {
  const stale  = isStale(rider.location_updated_at);
  const hasLoc = rider.location_lat != null && rider.location_lng != null;
  const orders = Array.isArray(rider.active_orders) ? rider.active_orders : [];
  const color  = STATUS_COLOR[rider.status] ?? "#94a3b8";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all mb-2 ${
        selected
          ? "border-green-500 bg-green-50 shadow-sm"
          : "border-border bg-card hover:bg-accent/30"
      }`}
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm"
          style={{ background: color }}
        >
          {rider.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="font-bold text-sm text-foreground truncate">{rider.name}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              orders.length > 0 ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"
            }`}>
              {orders.length} orders
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground capitalize">{rider.vehicle_type ?? "Bike"} · {rider.delivery_area ?? "Lahore"}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[11px]">
        {hasLoc ? (
          stale
            ? <><WifiOff className="w-3 h-3 text-orange-400 shrink-0" /><span className="text-orange-500 font-medium">Stale · {timeSince(rider.location_updated_at)}</span></>
            : <><Wifi className="w-3 h-3 text-green-500 shrink-0" /><span className="text-green-600 font-medium">Live · {timeSince(rider.location_updated_at)}</span></>
        ) : (
          <><MapPin className="w-3 h-3 text-muted-foreground shrink-0" /><span className="text-muted-foreground">Waiting for GPS…</span></>
        )}
      </div>

      {orders.length > 0 && (
        <div className="mt-1.5 space-y-0.5 pl-0.5">
          {orders.slice(0, 2).map((o: any) => (
            <div key={o.id} className="text-[10px] text-muted-foreground truncate">
              #{o.shopify_order_number} · {o.customer_name} · PKR {Number(o.cod_amount ?? 0).toLocaleString()}
            </div>
          ))}
          {orders.length > 2 && <div className="text-[10px] text-muted-foreground">+{orders.length - 2} more</div>}
        </div>
      )}

      {/* Phone quick-call */}
      {rider.phone && (
        <a
          href={`tel:${rider.phone}`}
          onClick={e => e.stopPropagation()}
          className="mt-2 flex items-center gap-1 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded-lg w-fit hover:bg-green-100 transition-colors font-semibold"
        >
          <Phone className="w-2.5 h-2.5" /> {rider.phone}
        </a>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE — Leaflet Map (no API key required)
═══════════════════════════════════════════════════════ */
export default function RiderLiveMapPage() {
  const mapDivRef  = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const [mapReady,      setMapReady]      = useState(false);
  const [selectedRider, setSelectedRider] = useState<any | null>(null);

  /* ── Poll live locations every 8s ── */
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["rider-live-locations"],
    queryFn:  () => apiFetch("/admin/riders/live-locations"),
    refetchInterval: 8_000,
  });
  const riders: any[] = data?.riders ?? [];

  /* ── Init Leaflet map ── */
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center:     [31.5204, 74.3587],
      zoom:       12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    /* KDF NUTS HQ marker */
    L.marker([31.5204, 74.3587], {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          width:36px;height:36px;border-radius:8px;
          background:#1e40af;border:2px solid #fff;
          box-shadow:0 3px 10px rgba(0,0,0,.3);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;">🏪</div>`,
        iconSize:   [36, 36],
        iconAnchor: [18, 18],
        popupAnchor:[0, -20],
      }),
    })
      .addTo(map)
      .bindPopup("<b>KDF NUTS HQ</b><br>Main Warehouse · Lahore");

    mapRef.current = map;
    setMapReady(true);

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Sync rider markers ── */
  const syncMarkers = useCallback(() => {
    if (!mapRef.current || !mapReady) return;
    const map  = mapRef.current;
    const seen = new Set<number>();

    for (const rider of riders) {
      if (rider.location_lat == null || rider.location_lng == null) continue;
      const lat   = parseFloat(rider.location_lat);
      const lng   = parseFloat(rider.location_lng);
      const stale = isStale(rider.location_updated_at);
      seen.add(rider.id);

      if (markersRef.current.has(rider.id)) {
        const m = markersRef.current.get(rider.id)!;
        m.setLatLng([lat, lng]);
        m.setIcon(createRiderIcon(rider, stale));
      } else {
        const m = L.marker([lat, lng], {
          icon:  createRiderIcon(rider, stale),
          title: rider.name,
          zIndexOffset: stale ? 0 : 100,
        });
        m.addTo(map);
        m.on("click", () => {
          setSelectedRider({ ...rider });
          m.setPopupContent(buildPopupHtml(rider));
          m.openPopup();
        });
        m.bindPopup(buildPopupHtml(rider), { maxWidth: 280 });
        markersRef.current.set(rider.id, m);
      }
    }

    /* Remove riders no longer in response */
    for (const [id, m] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
  }, [riders, mapReady]);

  useEffect(() => { syncMarkers(); }, [syncMarkers]);

  /* ── Pan to rider ── */
  const panToRider = (rider: any) => {
    setSelectedRider(rider);
    if (rider.location_lat && rider.location_lng && mapRef.current) {
      mapRef.current.flyTo(
        [parseFloat(rider.location_lat), parseFloat(rider.location_lng)],
        16,
        { animate: true, duration: 0.9 }
      );
      const m = markersRef.current.get(rider.id);
      if (m) {
        m.setPopupContent(buildPopupHtml(rider));
        m.openPopup();
      }
    }
  };

  /* ── Stats ── */
  const liveCount   = riders.filter(r => !isStale(r.location_updated_at) && r.location_lat != null).length;
  const activeCount = riders.filter(r => r.status === "active").length;
  const totalOrders = riders.reduce((s, r) => s + (Array.isArray(r.active_orders) ? r.active_orders.length : 0), 0);
  const totalCOD    = riders.reduce((s, r) => {
    const orders = Array.isArray(r.active_orders) ? r.active_orders : [];
    return s + orders.reduce((ss: number, o: any) => ss + Number(o.cod_amount ?? 0), 0);
  }, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      <style>{`
        .leaflet-container { font-family: system-ui, sans-serif; }
        .leaflet-popup-content-wrapper { border-radius: 12px; padding: 0; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
        .leaflet-popup-content { margin: 14px 16px; }
        .leaflet-popup-tip { background: white; }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-500 animate-pulse" />
          <h1 className="text-lg font-bold text-foreground">Live Rider Map</h1>
          <Badge variant="outline" className="text-[10px] gap-1.5 border-green-300">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            {liveCount} live
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Mini stats */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {activeCount} active</span>
            <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {totalOrders} orders</span>
            <span className="flex items-center gap-1 text-orange-600 font-semibold">PKR {totalCOD.toLocaleString()}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <div className="w-64 flex-shrink-0 border-r border-border bg-card/60 flex flex-col overflow-hidden">
          {/* Stats */}
          <div className="p-3 border-b border-border grid grid-cols-2 gap-2">
            <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black text-green-700">{liveCount}</div>
              <div className="text-[9px] text-green-600 uppercase tracking-wider font-semibold mt-0.5">Live GPS</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black text-orange-700">{totalOrders}</div>
              <div className="text-[9px] text-orange-600 uppercase tracking-wider font-semibold mt-0.5">On Delivery</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center col-span-2">
              <div className="text-base font-black text-blue-700">PKR {totalCOD.toLocaleString()}</div>
              <div className="text-[9px] text-blue-600 uppercase tracking-wider font-semibold mt-0.5">COD Pending</div>
            </div>
          </div>

          {/* Rider list */}
          <div className="flex-1 overflow-y-auto p-2">
            {riders.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">
                <Bike className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No active riders</p>
                <p className="text-[10px] mt-1 opacity-60">Riders appear here when they go online and share GPS</p>
              </div>
            ) : (
              riders.map(r => (
                <RiderCard
                  key={r.id}
                  rider={r}
                  selected={selectedRider?.id === r.id}
                  onClick={() => panToRider(r)}
                />
              ))
            )}
          </div>

          {/* Legend */}
          <div className="p-3 border-t border-border">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Legend</p>
            <div className="space-y-1.5 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                <span>Live GPS (updated &lt; 10 min)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />
                <span>Stale location (&gt; 10 min)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                <span>No GPS received yet</span>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground mt-2 opacity-60">
              GPS updates every 8s from Rider App.<br/>
              Map auto-refreshes every 8s.
            </p>
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative overflow-hidden">
          {/* No riders with GPS — overlay hint */}
          {mapReady && riders.filter(r => r.location_lat != null).length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none">
              <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl px-6 py-5 text-center max-w-xs border border-gray-100">
                <Navigation className="w-10 h-10 mx-auto mb-2 text-blue-400 opacity-60" />
                <p className="font-bold text-gray-700 text-sm">No GPS data yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Riders share their GPS automatically when they open the KDF Rider app.<br/>
                  Location updates every 8 seconds.
                </p>
              </div>
            </div>
          )}

          {/* Live indicator top-right */}
          {mapReady && (
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 bg-white/95 border border-gray-100 rounded-full px-3 py-1.5 shadow-md text-xs font-semibold text-gray-600">
              <Activity className={`w-3 h-3 ${isFetching ? "text-blue-500 animate-pulse" : "text-green-500"}`} />
              {isFetching ? "Syncing…" : `${liveCount} riders live`}
            </div>
          )}

          {/* Leaflet map container */}
          <div ref={mapDivRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
