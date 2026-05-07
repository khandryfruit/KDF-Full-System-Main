import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Bike, RefreshCw, Users, Package, Clock,
  Wifi, WifiOff, Navigation, Radio, Layers, AlertCircle,
  Satellite, Route, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = "/api";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
async function apiFetch(path: string) {
  const r = await fetch(`${API}${path}`, { headers: hdr() });
  return r.json();
}

/* ── Distance (Haversine) ── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Helpers ── */
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

/* ── Google Maps script loader ── */
let gmapsPromise: Promise<void> | null = null;
function loadGoogleMaps(apiKey: string): Promise<void> {
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry,directions`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gmapsPromise = null; reject(new Error("Failed to load Google Maps")); };
    document.head.appendChild(s);
  });
  return gmapsPromise;
}

/* ── Rider sidebar card ── */
function RiderCard({ rider, selected, onClick }: { rider: any; selected: boolean; onClick: () => void }) {
  const stale   = isStale(rider.location_updated_at);
  const hasLoc  = rider.location_lat != null && rider.location_lng != null;
  const orders  = Array.isArray(rider.active_orders) ? rider.active_orders : [];

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
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: STATUS_COLOR[rider.status] ?? "#94a3b8" }}>
            {rider.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground truncate max-w-[100px]">{rider.name}</div>
            <div className="text-[10px] text-muted-foreground">{rider.vehicle_type ?? "Bike"}</div>
          </div>
        </div>
        <Badge variant="outline"
          className={`text-[10px] px-1.5 py-0 ${orders.length > 0 ? "border-orange-400 text-orange-600" : "border-border text-muted-foreground"}`}>
          {orders.length} {orders.length === 1 ? "order" : "orders"}
        </Badge>
      </div>

      <div className="flex items-center gap-1 text-[11px] mt-1">
        {hasLoc ? (
          stale
            ? <><WifiOff className="w-3 h-3 text-orange-400" /><span className="text-orange-500">Stale · {timeSince(rider.location_updated_at)}</span></>
            : <><Wifi className="w-3 h-3 text-green-500" /><span className="text-green-600">Live · {timeSince(rider.location_updated_at)}</span></>
        ) : (
          <><MapPin className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">No GPS yet</span></>
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

/* ═══════════════════════════════════════════════════════
   GOOGLE MAPS — MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function RiderLiveMapPage() {
  const mapDivRef       = useRef<HTMLDivElement>(null);
  const gmapRef         = useRef<google.maps.Map | null>(null);
  const markersRef      = useRef<Map<number, google.maps.marker.AdvancedMarkerElement | google.maps.Marker>>(new Map());
  const infoWindowRef   = useRef<google.maps.InfoWindow | null>(null);
  const directionsRef   = useRef<google.maps.DirectionsRenderer | null>(null);

  const [mapReady,       setMapReady]       = useState(false);
  const [mapsError,      setMapsError]      = useState(false);
  const [mapType,        setMapType]        = useState<"roadmap" | "satellite">("roadmap");
  const [showTraffic,    setShowTraffic]    = useState(false);
  const [selectedRider,  setSelectedRider]  = useState<any | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);

  /* ── Fetch Google Maps API key (admin endpoint) ── */
  const { data: keyData } = useQuery({
    queryKey: ["gmaps-key"],
    queryFn:  () => apiFetch("/admin/location-settings/map-key"),
    staleTime: 5 * 60_000,
  });
  const mapsApiKey: string | null = keyData?.apiKey ?? null;

  /* ── Poll live rider locations every 8s ── */
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["rider-live-locations"],
    queryFn:  () => apiFetch("/admin/riders/live-locations"),
    refetchInterval: 8_000,
  });
  const riders: any[] = data?.riders ?? [];

  /* ── Init Google Maps once key is available ── */
  useEffect(() => {
    if (!mapsApiKey || !mapDivRef.current || gmapRef.current) return;

    loadGoogleMaps(mapsApiKey).then(() => {
      if (!mapDivRef.current) return;

      const map = new google.maps.Map(mapDivRef.current, {
        center: { lat: 31.5204, lng: 74.3587 },
        zoom: 12,
        mapTypeId: "roadmap",
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "transit", elementType: "labels", stylers: [{ visibility: "simplified" }] },
        ],
      });

      infoWindowRef.current  = new google.maps.InfoWindow();
      directionsRef.current  = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { strokeColor: "#3b82f6", strokeWeight: 4, strokeOpacity: 0.75 },
      });
      directionsRef.current.setMap(map);

      gmapRef.current = map;
      setMapReady(true);
    }).catch(() => setMapsError(true));

    return () => {
      markersRef.current.forEach(m => {
        if ((m as any).map !== undefined) (m as any).map = null;
        else (m as google.maps.Marker).setMap(null);
      });
      markersRef.current.clear();
      gmapRef.current = null;
    };
  }, [mapsApiKey]);

  /* ── Map type toggle ── */
  useEffect(() => {
    if (!gmapRef.current) return;
    gmapRef.current.setMapTypeId(mapType);
  }, [mapType]);

  /* ── Traffic layer toggle ── */
  useEffect(() => {
    if (!gmapRef.current) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(gmapRef.current);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
  }, [showTraffic, mapReady]);

  /* ── Sync rider markers ── */
  const syncMarkers = useCallback(() => {
    if (!gmapRef.current || !mapReady) return;
    const map  = gmapRef.current;
    const seen = new Set<number>();

    for (const rider of riders) {
      if (rider.location_lat == null || rider.location_lng == null) continue;
      const lat   = parseFloat(rider.location_lat);
      const lng   = parseFloat(rider.location_lng);
      const stale = isStale(rider.location_updated_at);
      const color = stale ? "#f97316" : (STATUS_COLOR[rider.status] ?? "#22c55e");
      const orders = Array.isArray(rider.active_orders) ? rider.active_orders : [];
      seen.add(rider.id);

      /* Build custom HTML marker */
      const markerHtml = document.createElement("div");
      markerHtml.innerHTML = `
        <div style="position:relative;cursor:pointer;">
          ${!stale ? `<div style="
            position:absolute;inset:-4px;border-radius:50%;
            background:${color};opacity:0.2;
            animation:pulse 2s infinite;
          "></div>` : ""}
          <div style="
            width:40px;height:40px;border-radius:50%;
            background:${color};border:3px solid #fff;
            box-shadow:0 3px 10px rgba(0,0,0,.3);
            display:flex;align-items:center;justify-content:center;
            font-weight:800;font-size:15px;color:#fff;
            font-family:system-ui,sans-serif;position:relative;z-index:1;
          ">${rider.name.charAt(0).toUpperCase()}</div>
          ${orders.length > 0 ? `<div style="
            position:absolute;top:-4px;right:-4px;z-index:2;
            background:#ef4444;color:#fff;border-radius:50%;
            width:18px;height:18px;font-size:10px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            border:2px solid #fff;font-family:system-ui,sans-serif;
          ">${orders.length > 9 ? "9+" : orders.length}</div>` : ""}
        </div>`;

      const pos = new google.maps.LatLng(lat, lng);

      if (markersRef.current.has(rider.id)) {
        const m = markersRef.current.get(rider.id) as google.maps.Marker;
        m.setPosition(pos);
      } else {
        const m = new google.maps.Marker({
          position: pos,
          map,
          icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="${color}" stroke="white" stroke-width="3"/>
              <text x="20" y="25" font-family="system-ui" font-size="16" font-weight="800"
                fill="white" text-anchor="middle">${rider.name.charAt(0).toUpperCase()}</text>
            </svg>
          `)}`, scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) },
          title: rider.name,
          zIndex: stale ? 1 : 10,
        });
        m.addListener("click", () => {
          setSelectedRider({ ...rider });
          showRiderInfo({ ...rider }, m, map);
        });
        markersRef.current.set(rider.id, m);
      }
    }

    /* Remove stale markers */
    for (const [id, m] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        (m as google.maps.Marker).setMap(null);
        markersRef.current.delete(id);
      }
    }
  }, [riders, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { syncMarkers(); }, [syncMarkers]);

  /* ── Show Info Window ── */
  const showRiderInfo = (rider: any, marker: google.maps.Marker, map: google.maps.Map) => {
    const orders = Array.isArray(rider.active_orders) ? rider.active_orders : [];
    const stale  = isStale(rider.location_updated_at);

    const ordersHtml = orders.length > 0
      ? orders.slice(0, 3).map((o: any) => `
          <div style="margin:4px 0;padding:6px 8px;background:#f8fafc;border-radius:6px;font-size:12px;">
            <div style="font-weight:600;color:#1e293b;">#${o.shopify_order_number} · ${o.customer_name}</div>
            <div style="color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">${o.delivery_address ?? ""}</div>
            <div style="color:#f97316;font-weight:600;margin-top:2px;">PKR ${Number(o.cod_amount).toLocaleString()}</div>
          </div>`).join("")
      : `<div style="color:#94a3b8;font-size:12px;padding:4px 0;">No active orders</div>`;

    const mapsUrl = `https://www.google.com/maps?q=${rider.location_lat},${rider.location_lng}`;

    const content = `
      <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:260px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${STATUS_COLOR[rider.status] ?? "#94a3b8"};
            display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:15px;">
            ${rider.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;color:#1e293b;">${rider.name}</div>
            <div style="font-size:11px;color:#64748b;">${rider.phone} · ${rider.vehicle_type ?? "Bike"}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;font-size:11px;margin-bottom:8px;
          color:${stale ? "#f97316" : "#22c55e"};">
          <span>●</span>
          <span>${stale ? "Stale · " : "Live · "}${timeSince(rider.location_updated_at)}</span>
        </div>
        ${orders.length > 0 ? `<div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;">Active Orders (${orders.length})</div>` : ""}
        ${ordersHtml}
        <div style="margin-top:8px;display:flex;gap:6px;">
          <a href="${mapsUrl}" target="_blank"
            style="flex:1;text-align:center;padding:6px;background:#3b82f6;color:white;border-radius:6px;
            font-size:11px;font-weight:600;text-decoration:none;">
            📍 Open Maps
          </a>
          <a href="tel:${rider.phone}"
            style="flex:1;text-align:center;padding:6px;background:#22c55e;color:white;border-radius:6px;
            font-size:11px;font-weight:600;text-decoration:none;">
            📞 Call
          </a>
        </div>
      </div>`;

    infoWindowRef.current!.setContent(content);
    infoWindowRef.current!.open({ anchor: marker, map });

    /* Show route to first active order if address available */
    if (orders.length > 0 && orders[0].delivery_address && rider.location_lat && rider.location_lng && mapsApiKey) {
      const directionsService = new google.maps.DirectionsService();
      directionsService.route({
        origin: new google.maps.LatLng(parseFloat(rider.location_lat), parseFloat(rider.location_lng)),
        destination: orders[0].delivery_address,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === "OK" && result) {
          directionsRef.current?.setDirections(result);
        }
      });
    }
  };

  /* ── Pan to rider ── */
  const panToRider = (rider: any) => {
    setSelectedRider(rider);
    if (rider.location_lat && rider.location_lng && gmapRef.current) {
      gmapRef.current.panTo({ lat: parseFloat(rider.location_lat), lng: parseFloat(rider.location_lng) });
      gmapRef.current.setZoom(15);
      const marker = markersRef.current.get(rider.id) as google.maps.Marker | undefined;
      if (marker) showRiderInfo(rider, marker, gmapRef.current);
    }
  };

  /* ── Stats ── */
  const liveCount    = riders.filter(r => !isStale(r.location_updated_at) && r.location_lat != null).length;
  const totalActive  = riders.filter(r => r.status === "active").length;
  const withLocation = riders.filter(r => r.location_lat != null).length;
  const totalOrders  = riders.reduce((s, r) => s + (Array.isArray(r.active_orders) ? r.active_orders.length : 0), 0);

  /* ── If no Maps key configured ── */
  if (mapsApiKey === null && keyData !== undefined) {
    return (
      <div className="flex flex-col h-[calc(100vh-80px)] items-center justify-center gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-orange-500" />
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">Google Maps Not Configured</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            To enable the Live Rider Map with Google Maps, please add your Google Maps API key in
            <strong> Settings → Location Settings</strong>. Make sure to enable the Maps JavaScript API
            and Directions API in your Google Cloud Console.
          </p>
          <a href="/admin/location-settings" className="mt-4 inline-block text-sm text-blue-600 underline">
            → Go to Location Settings
          </a>
        </div>
      </div>
    );
  }

  if (mapsError) {
    return (
      <div className="flex flex-col h-[calc(100vh-80px)] items-center justify-center gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">Failed to Load Google Maps</h2>
          <p className="text-muted-foreground text-sm">Check that your API key has the Maps JavaScript API enabled.</p>
          <Button className="mt-4" onClick={() => { setMapsError(false); gmapsPromise = null; }}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* ── Pulse animation style ── */}
      <style>{`
        @keyframes pulse {
          0%   { transform: scale(1);   opacity: 0.25; }
          50%  { transform: scale(1.5); opacity: 0.1;  }
          100% { transform: scale(1);   opacity: 0.25; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-600 animate-pulse" />
          <h1 className="text-lg font-bold text-foreground">Live Rider Map</h1>
          <Badge variant="outline" className="text-[11px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            {liveCount} live · {withLocation} tracked
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground mr-2">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{totalActive} active</span>
            <span className="flex items-center gap-1"><Package className="w-3 h-3" />{totalOrders} orders</span>
          </div>

          {/* Traffic toggle */}
          <Button
            variant={showTraffic ? "default" : "outline"}
            size="sm"
            onClick={() => setShowTraffic(p => !p)}
            className="gap-1.5 h-8 text-xs"
          >
            <Route className="w-3.5 h-3.5" />
            Traffic
          </Button>

          {/* Map type toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMapType(p => p === "roadmap" ? "satellite" : "roadmap")}
            className="gap-1.5 h-8 text-xs"
          >
            {mapType === "roadmap"
              ? <><Satellite className="w-3.5 h-3.5" />Satellite</>
              : <><Layers className="w-3.5 h-3.5" />Map</>
            }
          </Button>

          {/* Clear route */}
          {selectedRider && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedRider(null); directionsRef.current?.setDirections({ routes: [] } as any); infoWindowRef.current?.close(); }}
              className="h-8 text-xs"
            >
              Clear
            </Button>
          )}

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
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-2">
                <div className="text-lg font-bold text-green-700">{liveCount}</div>
                <div className="text-[9px] text-green-600 uppercase tracking-wide">Live GPS</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-2">
                <div className="text-lg font-bold text-orange-700">{totalOrders}</div>
                <div className="text-[9px] text-orange-600 uppercase tracking-wide">Active Orders</div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {riders.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                <Bike className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No active riders</p>
                <p className="text-[10px] mt-1 opacity-60">Add riders from Logistics → Riders</p>
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
            <div className="text-[10px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Live GPS (&lt;10 min)</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500" />Stale / offline</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-400" />No location yet</div>
            </div>
            <div className="text-[9px] text-muted-foreground mt-2 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-blue-500 inline-block" />
              Google Maps · Auto-refresh 8s
            </div>
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative">
          {/* Loading overlay */}
          {!mapReady && !mapsError && (
            <div className="absolute inset-0 bg-card flex items-center justify-center z-10">
              <div className="text-center text-sm text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 animate-bounce opacity-50" />
                <p>Loading Google Maps…</p>
              </div>
            </div>
          )}

          <div ref={mapDivRef} className="w-full h-full" />

          {/* No location banner */}
          {mapReady && withLocation === 0 && riders.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[999] bg-card border border-border rounded-xl px-4 py-2 shadow text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              Riders haven't shared GPS yet. Location updates when the Rider App is open.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
