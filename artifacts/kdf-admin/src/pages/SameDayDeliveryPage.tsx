import { useState, useEffect } from "react";
import { Zap, Save, Clock, MapPin, DollarSign, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api/admin/shipping/same-day";

function getAuthHeaders() {
  const token = localStorage.getItem("kdf_admin_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function SameDayDeliveryPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    enabled: false,
    price: 250,
    city: "Lahore",
    cutoffHour: 15,
  });

  useEffect(() => {
    fetch(API, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        setSettings({
          enabled: d.enabled ?? false,
          price: d.price ?? 250,
          city: d.city ?? "Lahore",
          cutoffHour: d.cutoffHour ?? 15,
        });
      })
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setSettings({
        enabled: data.enabled,
        price: data.price,
        city: data.city,
        cutoffHour: data.cutoffHour,
      });
      toast({ title: "Settings saved successfully" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fmt12h = (h: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${suffix}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-green-100 rounded-xl">
          <Zap className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Same Day Delivery</h1>
          <p className="text-sm text-gray-500">Configure Same Day Delivery for Lahore orders</p>
        </div>
      </div>

      {/* Enable / Disable */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Status</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Enable Same Day Delivery</p>
            <p className="text-sm text-gray-500 mt-0.5">
              When enabled, customers in {settings.city} will see this option at checkout
            </p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, enabled: !s.enabled }))}
            className="flex-shrink-0"
          >
            {settings.enabled
              ? <ToggleRight className="w-10 h-10 text-green-500" />
              : <ToggleLeft className="w-10 h-10 text-gray-400" />}
          </button>
        </div>
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${settings.enabled ? "bg-green-50 text-green-700 border border-green-100" : "bg-gray-50 text-gray-500 border border-gray-100"}`}>
          {settings.enabled ? "✅ Same Day Delivery is ACTIVE" : "⛔ Same Day Delivery is DISABLED"}
        </div>
      </div>

      {/* Delivery Charge */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Charge</h2>
        <div>
          <label className="text-sm text-gray-600 font-medium mb-1.5 block flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-green-500" />
            Delivery Charge (Rs.)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-semibold">Rs.</span>
            <input
              type="number"
              min={0}
              value={settings.price}
              onChange={e => setSettings(s => ({ ...s, price: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/10"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Recommended: Rs. 200–300 for same day delivery</p>
        </div>
      </div>

      {/* City */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">City</h2>
        <div>
          <label className="text-sm text-gray-600 font-medium mb-1.5 block flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-green-500" />
            Available City
          </label>
          <input
            type="text"
            value={settings.city}
            onChange={e => setSettings(s => ({ ...s, city: e.target.value }))}
            placeholder="Lahore"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/10"
          />
          <p className="text-xs text-gray-400 mt-1">Same Day Delivery will only show for orders from this city</p>
        </div>
      </div>

      {/* Cutoff Time */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Cutoff Time</h2>
        <div>
          <label className="text-sm text-gray-600 font-medium mb-1.5 block flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-green-500" />
            Order Cutoff Hour (24h format)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={8}
              max={20}
              value={settings.cutoffHour}
              onChange={e => setSettings(s => ({ ...s, cutoffHour: Number(e.target.value) }))}
              className="flex-1 accent-green-600"
            />
            <span className="text-lg font-bold text-green-700 w-24 text-right">{fmt12h(settings.cutoffHour)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Orders placed after {fmt12h(settings.cutoffHour)} will NOT qualify for Same Day Delivery
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-800 mb-1">How it works</p>
          <ul className="text-xs text-amber-700 space-y-1">
            <li>• Checkout shows Same Day option only if city = {settings.city}</li>
            <li>• Option hidden after {fmt12h(settings.cutoffHour)} with a clear message</li>
            <li>• Charge of Rs. {settings.price} is added to the order total</li>
            <li>• Chat bot replies with delivery info automatically</li>
          </ul>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
