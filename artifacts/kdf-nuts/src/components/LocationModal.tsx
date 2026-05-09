import React, { useState, useEffect } from "react";
import { MapPin, Navigation, ChevronDown, Loader2 } from "lucide-react";
import { useNutsLocation, type OrderType } from "../context/LocationContext";

const BASE = import.meta.env.BASE_URL ?? "/";

async function fetchCities(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}api/cities`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

const FALLBACK_CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad",
  "Multan", "Peshawar", "Quetta", "Sialkot", "Hyderabad",
  "Gujranwala", "Bahawalpur", "Sargodha", "Sukkur", "Larkana",
  "Abbottabad", "Mardan", "Gujrat", "Rahim Yar Khan", "Okara",
];

export function LocationModal({ onClose }: { onClose: () => void }) {
  const { confirmLocation } = useNutsLocation();
  const [orderType, setOrderType] = useState<OrderType>("delivery");
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [citySearch, setCitySearch] = useState("");

  useEffect(() => {
    fetchCities().then((data) => setCities(data.length ? data : FALLBACK_CITIES));
  }, []);

  const filteredCities = cities.filter((c) =>
    c.toLowerCase().includes(citySearch.toLowerCase())
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
            const city = data.city || "";
            if (city) setSelectedCity(city);
          } else {
            /* fallback: Nominatim */
            const nom = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
            );
            const d = await nom.json();
            const city = d.address?.city || d.address?.town || d.address?.county || d.address?.state_district || "";
            if (city) setSelectedCity(city);
          }
        } catch {
          /* silently ignore */
        }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="pt-7 pb-5 px-6 flex flex-col items-center border-b border-gray-100">
          {/* Logo */}
          <div className="w-16 h-16 rounded-2xl overflow-hidden mb-3 shadow-md ring-1 ring-black/5">
            <div className="w-full h-full bg-[#5FA800] flex items-center justify-center text-white font-extrabold text-2xl">K</div>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-0.5">Select your order type</h2>

          {/* Delivery / Pick-Up toggle */}
          <div className="flex mt-3 bg-gray-100 rounded-full p-1 gap-1">
            {(["delivery", "pickup"] as OrderType[]).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  orderType === t
                    ? "bg-[#5FA800] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "delivery" ? "Delivery" : "Pick-Up"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Please select your location */}
          <p className="text-sm font-semibold text-gray-700 text-center">Please select your location</p>

          {/* Use Current Location button */}
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="w-full flex items-center justify-center gap-2 border-2 border-[#5FA800] text-[#5FA800] font-semibold text-sm py-2.5 rounded-xl hover:bg-[#5FA800]/5 transition-colors disabled:opacity-60"
          >
            {detecting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Navigation size={16} />
            )}
            {detecting ? "Detecting…" : "Use Current Location"}
          </button>

          {/* City dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Select City / Region
            </label>
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 text-sm text-left hover:border-[#5FA800] transition-colors bg-white"
              >
                <span className={selectedCity ? "text-gray-900 font-medium" : "text-gray-400"}>
                  {selectedCity || "Select City / Region"}
                </span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
              </button>

              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      placeholder="Search city…"
                      className="w-full text-sm px-3 py-2 rounded-lg bg-gray-50 outline-none focus:ring-1 focus:ring-[#5FA800]"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {filteredCities.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setSelectedCity(c); setShowDropdown(false); setCitySearch(""); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#5FA800]/5 transition-colors ${selectedCity === c ? "bg-[#5FA800]/10 text-[#5FA800] font-semibold" : "text-gray-700"}`}
                      >
                        {c}
                      </button>
                    ))}
                    {filteredCities.length === 0 && (
                      <p className="px-4 py-3 text-sm text-gray-400 text-center">No cities found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          <p className="text-xs text-gray-400 leading-relaxed">
            Note: We deliver across Pakistan in just 60–72 hours at your doorstep. For Karachi &amp; Lahore, same-day delivery available.
          </p>

          {/* Select button */}
          <button
            onClick={handleSelect}
            disabled={!selectedCity}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${
              selectedCity
                ? "bg-[#5FA800] text-white shadow-md hover:bg-[#4d8a00] active:scale-95"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
