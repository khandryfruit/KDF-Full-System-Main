import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, ChevronDown, X, Loader2, Search, Check } from "lucide-react";
import { useNutsLocation, type OrderType } from "../context/LocationContext";

const BASE = import.meta.env.BASE_URL ?? "/";

const FALLBACK_CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad",
  "Multan", "Peshawar", "Quetta", "Sialkot", "Hyderabad",
  "Gujranwala", "Bahawalpur", "Sargodha", "Sukkur", "Larkana",
  "Abbottabad", "Mardan", "Gujrat", "Rahim Yar Khan", "Okara",
  "Sahiwal", "Jhang", "Sheikhupura", "Mingora / Swat", "Dera Ghazi Khan",
  "Mirpur Khas", "Nawabshah", "Kasur", "Dera Ismail Khan", "Attock",
  "Muzaffarabad", "Chiniot", "Kamoke", "Hafizabad", "Jhelum",
  "Sadiqabad", "Kohat", "Khanewal", "Turbat", "Mansehra",
  "Wah Cantonment", "Nowshera", "Burewala", "Pakpattan", "Tando Adam",
];

async function fetchCities(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}api/cities`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export function LocationModal({ onClose }: { onClose: () => void }) {
  const { confirmLocation } = useNutsLocation();
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCities().then((data) => setCities(data.length ? data : FALLBACK_CITIES));
  }, []);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (dropOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 60);
    }
  }, [dropOpen]);

  const filtered = cities.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  const handleDetect = () => {
    setDetecting(true);
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`${BASE}api/geocode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.city) setSelectedCity(data.city);
          } else {
            const nom = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
            );
            const d = await nom.json();
            const city = d.address?.city || d.address?.town || d.address?.county || d.address?.state_district || "";
            if (city) setSelectedCity(city);
          }
        } catch { /* ignore */ }
        setDetecting(false);
      },
      () => setDetecting(false),
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelect = () => {
    if (!selectedCity) return;
    confirmLocation(selectedCity, orderType);
    onClose();
  };

  return (
    /* z-[500] — above BottomNav (z-50) and ChatWidget */
    <div
      className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center px-0 sm:px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.52)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-[400px] bg-white overflow-hidden
          rounded-t-[28px] sm:rounded-[24px]
          shadow-[0_-8px_40px_rgba(0,0,0,0.15)] sm:shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
        style={{ animation: "locSlide 0.28s cubic-bezier(0.32,0.72,0,1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 pb-4 sm:pt-5">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#e8f5d4,#d4edb0)" }}
            >
              <MapPin className="w-5 h-5" style={{ color: "#5FA800" }} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-[15px] leading-tight">Set Delivery Location</h2>
              <p className="text-xs text-gray-400 mt-0.5">We deliver across all Pakistan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400
              hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />

        <div className="px-5 pt-4 pb-4 space-y-4">
          {/* Order type toggle */}
          <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
            {(["delivery", "pickup"] as OrderType[]).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                  orderType === t
                    ? "bg-white text-[#5FA800] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "delivery" ? "🚚  Delivery" : "🏪  Pick-Up"}
              </button>
            ))}
          </div>

          {/* GPS detect */}
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-2xl
              border-2 border-[#5FA800] text-[#5FA800] font-semibold text-sm
              hover:bg-[#5FA800]/5 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {detecting
              ? <><Loader2 size={15} className="animate-spin" /> Detecting…</>
              : <><Navigation size={15} /> Use Current Location</>
            }
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or select city</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Searchable city dropdown */}
          <div ref={dropRef} className="relative">
            <button
              onClick={() => setDropOpen(!dropOpen)}
              className={`w-full flex items-center justify-between border rounded-2xl px-4 py-3 text-sm text-left
                bg-white transition-all
                ${dropOpen ? "border-[#5FA800] ring-2 ring-[#5FA800]/15" : "border-gray-200 hover:border-[#5FA800]"}`}
            >
              <span className={selectedCity ? "text-gray-900 font-medium" : "text-gray-400"}>
                {selectedCity || "Select city / region…"}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${dropOpen ? "rotate-180" : ""}`}
              />
            </button>

            {dropOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-2xl
                shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-20 overflow-hidden">
                <div className="p-2.5 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search city…"
                      className="w-full text-sm pl-8 pr-3 py-2 rounded-xl bg-gray-50 outline-none
                        focus:ring-1 focus:ring-[#5FA800] focus:bg-white transition-all"
                    />
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto overscroll-contain">
                  {filtered.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setSelectedCity(c); setDropOpen(false); setSearch(""); }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left
                        transition-colors
                        ${selectedCity === c
                          ? "bg-[#5FA800]/10 text-[#5FA800] font-semibold"
                          : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      {c}
                      {selectedCity === c && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <p className="px-4 py-4 text-sm text-gray-400 text-center">No city found</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <p className="text-xs text-gray-400 leading-relaxed text-center">
            60–72 hr nationwide delivery · Same-day in Karachi &amp; Lahore
          </p>

          {/* Confirm button */}
          <button
            onClick={handleSelect}
            disabled={!selectedCity}
            className={`w-full h-12 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]
              ${selectedCity ? "text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
            style={selectedCity ? {
              background: "linear-gradient(135deg,#6db800 0%,#5FA800 60%,#4d8a00 100%)",
              boxShadow: "0 4px 16px rgba(95,168,0,0.35)",
            } : {}}
          >
            {selectedCity ? `Confirm — ${selectedCity}` : "Select a city to continue"}
          </button>
        </div>

        {/* Bottom spacer — clears mobile BottomNav (≈64 px) */}
        <div className="h-16 sm:h-0" style={{ paddingBottom: "env(safe-area-inset-bottom,0px)" }} />
      </div>

      <style>{`
        @keyframes locSlide {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @media (min-width: 640px) {
          @keyframes locSlide {
            from { transform: translateY(10px) scale(0.97); opacity: 0; }
            to   { transform: translateY(0)    scale(1);    opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
