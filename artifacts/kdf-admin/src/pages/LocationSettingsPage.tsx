import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Eye, EyeOff, Loader2, Plus, Trash2,
  ToggleLeft, ToggleRight, Navigation, CheckCircle2,
  XCircle, AlertTriangle, Map, Server, Globe, FlaskConical,
  Wifi, WifiOff, Crosshair, Bug, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

/* ─── Location Debug Panel ────────────────────────────── */
type PermStatus = "unknown" | "granted" | "denied" | "prompt" | "checking";
type GeoResult = { lat: number; lng: number; accuracy: number } | null;
type GeoError = { code: number; message: string } | null;
type GeocodeResult = { city?: string; area?: string; street?: string; province?: string; postalCode?: string; fullAddress?: string } | null;

function LocationDebugPanel({ adminToken }: { adminToken: string }) {
  const [permStatus, setPermStatus] = useState<PermStatus>("unknown");
  const [coords, setCoords] = useState<GeoResult>(null);
  const [geoError, setGeoError] = useState<GeoError>(null);
  const [isGettingGPS, setIsGettingGPS] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<GeocodeResult>(null);
  const [geocodeRaw, setGeocodeRaw] = useState<string>("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const checkPermission = useCallback(async () => {
    setPermStatus("checking");
    try {
      if (!navigator.permissions) { setPermStatus("unknown"); return; }
      const result = await navigator.permissions.query({ name: "geolocation" });
      setPermStatus(result.state as PermStatus);
      result.onchange = () => setPermStatus(result.state as PermStatus);
    } catch { setPermStatus("unknown"); }
  }, []);

  useEffect(() => { checkPermission(); }, [checkPermission]);

  const getGPS = () => {
    if (!navigator.geolocation) {
      setGeoError({ code: 0, message: "Geolocation API not available in this browser." });
      return;
    }
    setIsGettingGPS(true); setGeoError(null); setCoords(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setPermStatus("granted"); setIsGettingGPS(false);
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: "Permission denied — user blocked location access",
          2: "Position unavailable — GPS signal lost",
          3: "Timeout — GPS took too long to respond",
        };
        setGeoError({ code: err.code, message: msgs[err.code] ?? err.message });
        if (err.code === 1) setPermStatus("denied");
        setIsGettingGPS(false);
      },
      { timeout: 12000, enableHighAccuracy: true }
    );
  };

  const runGeocode = async () => {
    if (!coords) return;
    setIsGeocoding(true); setGeocodeError(null); setGeocodeResult(null); setGeocodeRaw("");
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ lat: coords.lat, lng: coords.lng }),
      });
      const data = await res.json();
      setGeocodeRaw(JSON.stringify(data, null, 2));
      if (res.ok) setGeocodeResult(data);
      else setGeocodeError(data.error ?? `HTTP ${res.status}`);
    } catch (e: any) { setGeocodeError(e.message); }
    finally { setIsGeocoding(false); }
  };

  const permColor: Record<PermStatus, string> = {
    unknown:  "text-gray-500",
    checking: "text-yellow-500",
    granted:  "text-green-600",
    denied:   "text-red-500",
    prompt:   "text-blue-500",
  };
  const permLabel: Record<PermStatus, string> = {
    unknown:  "Unknown",
    checking: "Checking…",
    granted:  "Granted ✓",
    denied:   "Denied ✗",
    prompt:   "Will prompt",
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
          <Bug className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h2 className="font-semibold text-base">Location Debug Console</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Test GPS, permission status, and geocoding API live</p>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Permission status row */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/40 border border-border">
          <div className="flex items-center gap-2 flex-1">
            {permStatus === "granted" ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-gray-400" />}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Browser GPS Permission</p>
              <p className={`text-sm font-bold ${permColor[permStatus]}`}>{permLabel[permStatus]}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={checkPermission} className="h-8 gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Recheck
          </Button>
        </div>

        {/* GPS Test */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Step 1 — Get GPS Coordinates</p>
            <Button size="sm" onClick={getGPS} disabled={isGettingGPS} className="h-8 gap-1.5" style={{ backgroundColor: "#5FA800" }}>
              {isGettingGPS ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Getting GPS…</> : <><Crosshair className="w-3.5 h-3.5" /> Test GPS</>}
            </Button>
          </div>

          {geoError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-700">GPS Error (Code {geoError.code})</p>
                <p className="text-xs text-red-600 mt-0.5">{geoError.message}</p>
                {geoError.code === 1 && (
                  <p className="text-xs text-red-500 mt-1 italic">
                    Fix: Click the lock icon in browser address bar → Allow location
                  </p>
                )}
              </div>
            </div>
          )}

          {coords && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                <p className="text-xs font-bold text-green-700">Coordinates Obtained</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Latitude", value: coords.lat.toFixed(6) },
                  { label: "Longitude", value: coords.lng.toFixed(6) },
                  { label: "Accuracy", value: `±${coords.accuracy}m` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-md px-2 py-1.5 border border-green-100">
                    <p className="text-[10px] text-green-600 font-medium">{label}</p>
                    <p className="text-sm font-bold text-green-800 font-mono">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Geocoding Test */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Step 2 — Test Reverse Geocoding</p>
            <Button size="sm" onClick={runGeocode} disabled={!coords || isGeocoding} variant="outline" className="h-8 gap-1.5">
              {isGeocoding ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Geocoding…</> : <><Navigation className="w-3.5 h-3.5" /> Test Geocode</>}
            </Button>
          </div>

          {!coords && (
            <p className="text-xs text-muted-foreground italic">Get GPS coordinates first (Step 1)</p>
          )}

          {geocodeError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-700">Geocoding Failed</p>
                <p className="text-xs text-red-600 mt-0.5">{geocodeError}</p>
                <p className="text-xs text-red-500 mt-1 italic">Check: Server API key, Geocoding API enabled, billing active</p>
              </div>
            </div>
          )}

          {geocodeResult && (
            <div className="space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  <p className="text-xs font-bold text-green-700">Geocoding Successful</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Full Address", value: geocodeResult.fullAddress },
                    { label: "City", value: geocodeResult.city },
                    { label: "Area", value: geocodeResult.area },
                    { label: "Street", value: geocodeResult.street },
                    { label: "Province", value: geocodeResult.province },
                    { label: "Postal Code", value: geocodeResult.postalCode },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-md px-2 py-1.5 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium">{label}</p>
                      <p className="text-xs font-semibold text-green-800">{value || <span className="text-gray-400 font-normal italic">not available</span>}</p>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
              >
                {showRaw ? "Hide" : "Show"} raw JSON response
              </button>
              {showRaw && (
                <pre className="bg-muted/60 rounded-lg p-3 text-[11px] font-mono overflow-x-auto border border-border max-h-48">
                  {geocodeRaw}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Common error reference */}
        <details className="group">
          <summary className="text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground select-none list-none flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Common Errors Reference
          </summary>
          <div className="mt-2 space-y-1.5">
            {[
              { icon: "❌", error: "REQUEST_DENIED", fix: "API key wrong or Geocoding API not enabled in GCP console" },
              { icon: "❌", error: "OVER_DAILY_LIMIT", fix: "Quota exceeded — billing not enabled or limit reached" },
              { icon: "❌", error: "INVALID_REQUEST", fix: "Lat/lng outside valid range or missing parameters" },
              { icon: "❌", error: "GPS Code 1", fix: "User denied permission — ask them to allow in browser settings" },
              { icon: "❌", error: "GPS Code 3", fix: "GPS timeout — try outdoors or check enableHighAccuracy setting" },
            ].map(({ icon, error, fix }) => (
              <div key={error} className="flex gap-2 text-xs bg-muted/40 rounded-lg px-3 py-2">
                <span>{icon}</span>
                <span className="font-mono font-bold text-red-600 min-w-[120px]">{error}</span>
                <span className="text-muted-foreground">{fix}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

export default function LocationSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  /* ─── Settings state ────────────────────────────────── */
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/admin/location-settings"],
    queryFn: () => apiFetch("/api/admin/location-settings"),
  });

  const [form, setForm] = useState({
    apiKey: "",
    serverApiKey: "",
    isEnabled: false,
    autoDetectLocation: true,
    defaultCountry: "Pakistan",
  });
  const [showClientKey, setShowClientKey] = useState(false);
  const [showServerKey, setShowServerKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const isConfigured = !!(form.apiKey || form.serverApiKey);

  useEffect(() => {
    if (settings) {
      setForm({
        apiKey: settings.apiKey ?? "",
        serverApiKey: settings.serverApiKey ?? "",
        isEnabled: settings.isEnabled ?? false,
        autoDetectLocation: settings.autoDetectLocation ?? true,
        defaultCountry: settings.defaultCountry ?? "Pakistan",
      });
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () => apiFetch("/api/admin/location-settings", { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/location-settings"] });
      toast({ title: "Settings saved successfully" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch("/api/admin/location-settings/test", {
        method: "POST",
        body: JSON.stringify({ apiKey: form.apiKey, serverApiKey: form.serverApiKey }),
      });
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setIsTesting(false);
    }
  };

  /* ─── Cities state ───────────────────────────────────── */
  const { data: cities, isLoading: citiesLoading } = useQuery({
    queryKey: ["/api/admin/cities"],
    queryFn: () => apiFetch("/api/admin/cities"),
  });

  const [newCity, setNewCity] = useState({ cityName: "", province: "" });
  const [addingCity, setAddingCity] = useState(false);

  const seedCities = useMutation({
    mutationFn: () => apiFetch("/api/admin/cities/seed", { method: "POST" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cities"] });
      toast({ title: d.message });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const addCity = useMutation({
    mutationFn: () => apiFetch("/api/admin/cities", { method: "POST", body: JSON.stringify(newCity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cities"] });
      setNewCity({ cityName: "", province: "" });
      setAddingCity(false);
      toast({ title: "City added" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const toggleCity = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/api/admin/cities/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/cities"] }),
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const deleteCity = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/cities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cities"] });
      toast({ title: "City deleted" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <MapPin className="w-6 h-6 text-primary" />
          Location Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure Google Maps integration and manage Pakistan delivery cities.
        </p>
      </div>

      {/* ── Warning banner ───────────────────────────────── */}
      {!isConfigured && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            Without configuring this section, map functionality will not work properly — thus the whole system will not work as planned.
          </p>
        </div>
      )}

      {/* ── Google Map API card ──────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Map className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Google Map API</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fill-up google apis credentials to setup & activate google map integration to your system.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isTesting || !isConfigured}
              className="h-9 gap-1.5 font-medium"
            >
              {isTesting ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…</>
              ) : (
                <><FlaskConical className="w-3.5 h-3.5" /> Test Map View</>
              )}
            </Button>
            <Switch
              checked={form.isEnabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))}
            />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-start gap-3 mx-5 mt-4 px-4 py-3 rounded-xl border text-sm ${
            testResult.success
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {testResult.success
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
              : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />}
            <span>{testResult.success ? testResult.message : testResult.error}</span>
          </div>
        )}

        {/* Fields */}
        {settingsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm px-5 py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="px-5 py-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Client key */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  Map api key (Client)
                </Label>
                <div className="relative">
                  <Input
                    type={showClientKey ? "text" : "password"}
                    value={form.apiKey}
                    onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                    placeholder="AIzaSy…"
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientKey(!showClientKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showClientKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-blue-700">Browser / Frontend key</p>
                  <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
                    <li>Restriction: <span className="font-medium">Websites</span></li>
                    <li>Allowed: <code className="bg-blue-100 px-1 rounded">https://khanbabadryfruits.com/*</code></li>
                    <li>APIs: <span className="font-medium">Maps JavaScript API</span>, <span className="font-medium">Places API (New)</span></li>
                  </ul>
                </div>
              </div>

              {/* Server key */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Server className="w-3.5 h-3.5 text-orange-500" />
                  Map api key (Server)
                </Label>
                <div className="relative">
                  <Input
                    type={showServerKey ? "text" : "password"}
                    value={form.serverApiKey}
                    onChange={(e) => setForm((f) => ({ ...f, serverApiKey: e.target.value }))}
                    placeholder="AIzaSy…"
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowServerKey(!showServerKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showServerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-xs font-semibold text-orange-700">Backend / Server key</p>
                  <ul className="text-xs text-orange-600 space-y-0.5 list-disc list-inside">
                    <li>Restriction: <span className="font-medium">None</span> (or Server IP later)</li>
                    <li>APIs: <span className="font-medium">Geocoding API</span> only</li>
                    <li>Used for: reverse geocoding on location detect</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Toggles row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Auto-Detect Location</p>
                  <p className="text-xs text-muted-foreground">Prompt visitors on first page load</p>
                </div>
                <Switch
                  checked={form.autoDetectLocation}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, autoDetectLocation: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Default Country</Label>
                <Input
                  value={form.defaultCountry}
                  onChange={(e) => setForm((f) => ({ ...f, defaultCountry: e.target.value }))}
                  placeholder="Pakistan"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 leading-relaxed">
              <span className="font-semibold">Required APIs:</span> Maps JavaScript API, Places API (New), Geocoding API.
              {" "}Enable them at{" "}
              <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noreferrer" className="underline font-medium">
                console.cloud.google.com
              </a>
              {" "}and restrict the client key to your domain.
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={() => saveSettings.mutate()}
                disabled={saveSettings.isPending}
                style={{ backgroundColor: "#5FA800" }}
                className="text-white gap-1.5"
              >
                {saveSettings.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Information"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (settings) {
                    setForm({
                      apiKey: settings.apiKey ?? "",
                      serverApiKey: settings.serverApiKey ?? "",
                      isEnabled: settings.isEnabled ?? false,
                      autoDetectLocation: settings.autoDetectLocation ?? true,
                      defaultCountry: settings.defaultCountry ?? "Pakistan",
                    });
                  } else {
                    setForm({ apiKey: "", serverApiKey: "", isEnabled: false, autoDetectLocation: true, defaultCountry: "Pakistan" });
                  }
                  setTestResult(null);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Pakistan Cities card ─────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Pakistan Cities</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Delivery cities shown in checkout dropdowns</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedCities.mutate()}
              disabled={seedCities.isPending}
            >
              {seedCities.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Seed Default Cities"}
            </Button>
            <Button
              size="sm"
              style={{ backgroundColor: "#5FA800" }}
              className="text-white"
              onClick={() => setAddingCity(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add City
            </Button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {addingCity && (
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-medium">Add New City</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">City Name *</Label>
                  <Input value={newCity.cityName} onChange={(e) => setNewCity((c) => ({ ...c, cityName: e.target.value }))} placeholder="e.g. Lahore" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Province</Label>
                  <Input value={newCity.province} onChange={(e) => setNewCity((c) => ({ ...c, province: e.target.value }))} placeholder="e.g. Punjab" className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addCity.mutate()} disabled={addCity.isPending || !newCity.cityName.trim()} style={{ backgroundColor: "#5FA800" }} className="text-white">
                  {addCity.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddingCity(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {citiesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading cities…
            </div>
          ) : !cities?.length ? (
            <div className="text-center py-10 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No cities added yet.</p>
              <p className="text-xs mt-1">Click "Seed Default Cities" to add Pakistan's 30 major cities.</p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">City</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Province</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(cities as any[]).map((city: any) => (
                    <tr key={city.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{city.cityName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{city.province ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={city.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}>
                          {city.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => toggleCity.mutate({ id: city.id, isActive: !city.isActive })} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title={city.isActive ? "Deactivate" : "Activate"}>
                            {city.isActive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                          <button onClick={() => deleteCity.mutate(city.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
