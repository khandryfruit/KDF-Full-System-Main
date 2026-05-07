import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Bike, RefreshCw, Users, Package, Clock,
  Wifi, WifiOff, Navigation, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import L from "leaflet";
import type { Map as LMap, Marker as LMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

const API = "/api";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

async function apiFetch(path: string) {
  const r = await fetch(`${API}${path}`, { headers: hdr() });
  return r.json();
}

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  busy:   "#f97316",
  inactive: "#94a3b8",
};

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

/* ── Rider sidebar card ── */
function RiderCard({ rider, selected, onClick }: { rider: any; selected: boolean; onClick: () => void }) {
  const stale  = isStale(rider.location_updated_at);
  const hasLoc = rider.location_lat != null && rider.location_lng != null;
  const orders = Array.isArray(rider.active_orders) ? rider.active_orders : [];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all mb-2 ${
        selected
          ? "border-green-500 bg-green-50 dark:bg-green-950/30"
          : "border-border bg-card hover:bg-accent/30"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: STATUS_COLOR[rider.status] ?? "#94a3b8" }} />
          <span className="font-semibold text-sm text-foreground truncate max-w-[120px]">
            {rider.name}
          </span>
        </div>
        <Badge variant="outline"
          className={`text-[10px] px-1.5 py-0 ${orders.length > 0 ? "border-orange-400 text-orange-600" : "border-border text-muted-foreground"}`}>
          {orders.length} order{orders.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {hasLoc ? (
          stale
            ? <><WifiOff className="w-3 h-3 text-orange-400" /><span className="text-orange-500">Stale · {timeSince(rider.location_updated_at)}</span></>
            : <><Wifi className="w-3 h-3 text-green-500" /><span className="text-green-600">Live · {timeSince(rider.location_updated_at)}</span></>
        ) : (
          <><MapPin className="w-3 h-3" /><span>No GPS yet</span></>
        )}
      </div>
      {orders.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {orders.slice(0, 2).map((o: any) => (
            <div key={o.id} className="text-[10px] text-muted-foreground truncate">
              #{o.shopify_order_number} · {o.customer_name}
            </div>
          ))}
          {orders.length > 2 && <div className="text-[10px] text-muted-foreground">+{orders.length - 2} more</div>}
        </div>
      )}
    </button>
  );
}

/* ── Popup panel ── */
function RiderPopup({ rider, onClose }: { rider: any; onClose: () => void }) {
  const orders = Array.isArray(rider.active_orders) ? rider.active_orders : [];
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-card border border-border rounded-xl shadow-xl p-4 w-72">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLOR[rider.status] ?? "#94a3b8" }} />
          <span className="font-bold text-foreground">{rider.name}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
      </div>
      <div className="text-xs text-muted-foreground mb-1">{rider.phone} · {rider.vehicle_type ?? "Bike"}</div>
      <div className="text-xs text-muted-foreground mb-2">Updated: {timeSince(rider.location_updated_at)}</div>
      {orders.length > 0 && (
        <>
          <div className="text-xs font-semibold text-foreground mb-1.5">Active Orders ({orders.length})</div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {orders.map((o: any) => (
              <div key={o.id} className="p-2 bg-muted rounded-lg text-xs">
                <div className="font-medium">#{o.shopify_order_number} · {o.customer_name}</div>
                <div className="text-muted-foreground truncate">{o.delivery_address}</div>
                <div className="text-orange-600 font-medium">PKR {Number(o.cod_amount).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {rider.location_lat && rider.location_lng && (
        <a
          href={`https://www.google.com/maps?q=${rider.location_lat},${rider.location_lng}`}
          target="_blank" rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          <Navigation className="w-3 h-3" /> Open in Google Maps
        </a>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function RiderLiveMapPage() {
  const mapRef     = useRef<HTMLDivElement>(null);
  const lmapRef    = useRef<LMap | null>(null);
  const markersRef = useRef<Map<number, LMarker>>(new Map());

  const [mapReady,      setMapReady]      = useState(false);
  const [selectedRider, setSelectedRider] = useState<any | null>(null);

  /* ── Init Leaflet map once ── */
  useEffect(() => {
    if (lmapRef.current || !mapRef.current) return;

    /* Fix default icon paths broken by Vite bundler */
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(mapRef.current, {
      center:    [31.5204, 74.3587],
      zoom:      12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    lmapRef.current = map;
    setMapReady(true);

    return () => {
      lmapRef.current?.remove();
      lmapRef.current = null;
    };
  }, []);

  /* ── Poll live locations every 10s ── */
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["rider-live-locations"],
    queryFn:  () => apiFetch("/admin/riders/live-locations"),
    refetchInterval: 10_000,
  });

  const riders: any[] = data?.riders ?? [];

  /* ── Sync markers ── */
  const syncMarkers = useCallback(() => {
    if (!lmapRef.current || !mapReady) return;
    const map  = lmapRef.current;
    const seen = new Set<number>();

    for (const rider of riders) {
      if (rider.location_lat == null || rider.location_lng == null) continue;
      const lat   = parseFloat(rider.location_lat);
      const lng   = parseFloat(rider.location_lng);
      const stale = isStale(rider.location_updated_at);
      const color = stale ? "#f97316" : (STATUS_COLOR[rider.status] ?? "#22c55e");
      const count = Array.isArray(rider.active_orders) ? rider.active_orders.length : 0;
      seen.add(rider.id);

      const iconHtml = `
        <div style="position:relative;width:36px;height:36px;">
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:${color};border:3px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,.35);
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:14px;color:#fff;
            font-family:system-ui,sans-serif;
          ">${rider.name.charAt(0).toUpperCase()}</div>
          ${count > 0 ? `<div style="
            position:absolute;top:-4px;right:-4px;
            background:#ef4444;color:#fff;border-radius:50%;
            width:16px;height:16px;font-size:9px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            border:1.5px solid #fff;
          ">${count > 9 ? "9+" : count}</div>` : ""}
        </div>`;

      const divIcon = L.divIcon({ html: iconHtml, className: "", iconSize: [36, 36], iconAnchor: [18, 18] });

      if (markersRef.current.has(rider.id)) {
        const m = markersRef.current.get(rider.id)!;
        m.setLatLng([lat, lng]);
        m.setIcon(divIcon);
      } else {
        const m = L.marker([lat, lng], { icon: divIcon }).addTo(map);
        m.on("click", () => setSelectedRider({ ...rider }));
        markersRef.current.set(rider.id, m);
      }
    }

    /* Remove stale markers */
    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) { marker.remove(); markersRef.current.delete(id); }
    }
  }, [riders, mapReady]);

  useEffect(() => { syncMarkers(); }, [syncMarkers]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Pan to rider ── */
  const panToRider = (rider: any) => {
    setSelectedRider(rider);
    if (rider.location_lat && rider.location_lng && lmapRef.current) {
      lmapRef.current.setView([parseFloat(rider.location_lat), parseFloat(rider.location_lng)], 15, { animate: true });
    }
  };

  /* ── Stats ── */
  const totalActive  = riders.filter(r => r.status === "active").length;
  const withLocation = riders.filter(r => r.location_lat != null).length;
  const totalOrders  = riders.reduce((s, r) => s + (Array.isArray(r.active_orders) ? r.active_orders.length : 0), 0);
  const liveCount    = riders.filter(r => !isStale(r.location_updated_at) && r.location_lat != null).length;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-600 animate-pulse" />
          <h1 className="text-lg font-bold text-foreground">Live Rider Map</h1>
          <Badge variant="outline" className="text-[11px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            {liveCount} live · {withLocation} tracked
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{totalActive} active</span>
            <span className="flex items-center gap-1"><Package className="w-3 h-3" />{totalOrders} orders</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 h-8 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="w-64 flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Riders</div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-1.5">
                <div className="text-base font-bold text-green-700">{liveCount}</div>
                <div className="text-[9px] text-green-600 uppercase">Live GPS</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-1.5">
                <div className="text-base font-bold text-orange-700">{totalOrders}</div>
                <div className="text-[9px] text-orange-600 uppercase">Orders</div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {riders.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                <Bike className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No active riders
              </div>
            ) : (
              riders.map(r => (
                <RiderCard key={r.id} rider={r} selected={selectedRider?.id === r.id} onClick={() => panToRider(r)} />
              ))
            )}
          </div>

          {/* Legend */}
          <div className="p-3 border-t border-border">
            <div className="text-[10px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" />Live GPS (&lt;10 min)</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500" />Stale / offline</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-400" />No location yet</div>
            </div>
            <div className="text-[9px] text-muted-foreground mt-1.5">Auto-refreshes every 10s · OpenStreetMap</div>
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" />

          {/* Popup */}
          {selectedRider && <RiderPopup rider={selectedRider} onClose={() => setSelectedRider(null)} />}

          {/* No location banner */}
          {mapReady && withLocation === 0 && riders.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[999] bg-card border border-border rounded-xl px-4 py-2 shadow text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Riders haven't shared GPS yet. Location updates when the Rider app is open.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
