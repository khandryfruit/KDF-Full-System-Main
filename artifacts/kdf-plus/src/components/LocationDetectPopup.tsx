import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, ChevronDown, X, Loader2, Search, Check } from "lucide-react";
import { useUserLocation } from "@/context/LocationContext";

const PAKISTAN_CITIES = [
  "Karachi","Lahore","Islamabad","Rawalpindi","Faisalabad",
  "Multan","Peshawar","Quetta","Sialkot","Hyderabad",
  "Gujranwala","Bahawalpur","Sargodha","Sukkur","Larkana",
  "Abbottabad","Mardan","Gujrat","Rahim Yar Khan","Okara",
  "Sahiwal","Jhang","Sheikhupura","Mingora / Swat","Dera Ghazi Khan",
  "Mirpur Khas","Nawabshah","Kasur","Dera Ismail Khan","Attock",
  "Muzaffarabad","Chiniot","Kamoke","Hafizabad","Jhelum",
  "Sadiqabad","Kohat","Khanewal","Turbat","Mansehra",
  "Wah Cantonment","Nowshera","Burewala","Pakpattan","Tando Adam",
];

interface Props { onDismiss: () => void }

const NAV_H = 64; // kdf-plus bottom nav height in px

export function LocationDetectPopup({ onDismiss }: Props) {
  const { detectLocation, cities, setCity, setLocationPermission, isDetecting } = useUserLocation();
  const [step, setStep]           = useState<"ask" | "manual">("ask");
  const [selectedCity, setSel]    = useState("");
  const [search, setSearch]       = useState("");
  const [dropOpen, setDropOpen]   = useState(false);
  const dropRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const allCities = cities?.length ? cities : PAKISTAN_CITIES;
  const filtered  = allCities.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  /* Close dropdown on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (dropOpen) setTimeout(() => searchRef.current?.focus(), 60);
  }, [dropOpen]);

  const handleAllow = async () => { await detectLocation(); onDismiss(); };
  const handleClose = () => { setLocationPermission("denied"); onDismiss(); };
  const handleConfirm = () => {
    if (!selectedCity) return;
    setCity(selectedCity);
    setLocationPermission("denied");
    onDismiss();
  };

  return (
    <>
      {/*
        ┌──────────────────────────────────────┐
        │  fixed overlay  z-[500]              │
        │  Covers full screen BUT pushes       │
        │  the sheet UP by NAV_H px so it      │
        │  never slides behind the bottom nav  │
        └──────────────────────────────────────┘
      */}
      <div
        className="fixed inset-0 z-[600] flex items-end justify-center sm:items-center"
        style={{
          /* Push sheet above bottom nav on mobile; reset on sm+ */
          paddingBottom: `max(${NAV_H}px, calc(${NAV_H}px + env(safe-area-inset-bottom, 0px)))`,
        }}
      >
        {/* Backdrop — covers the full viewport INCLUDING behind the nav */}
        <div
          className="absolute inset-0 bg-black/50 sm:bg-black/40"
          style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={handleClose}
        />

        {/* Sheet */}
        <div
          className="
            relative w-full sm:max-w-[400px] bg-white z-10
            rounded-t-[24px] sm:rounded-[20px]
            shadow-[0_-6px_30px_rgba(0,0,0,0.15)] sm:shadow-[0_8px_40px_rgba(0,0,0,0.18)]
          "
          style={{ animation: "kpSlide .26s cubic-bezier(.32,.72,0,1) both" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag pill */}
          <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
            <div className="w-8 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 pt-2 pb-3 sm:pt-4 sm:px-5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#e8f5d4,#d4edb0)" }}
            >
              <MapPin className="w-4 h-4" style={{ color: "#5FA800" }} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 text-[14px] leading-tight">
                {step === "ask" ? "Allow Location Access?" : "Select Your City"}
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {step === "ask" ? "For accurate delivery estimates" : "Find delivery options near you"}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400
                hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 mx-4" />

          {/* Body */}
          <div className="px-4 pt-3 pb-4 sm:px-5 sm:pb-5 space-y-2.5">

            {step === "ask" ? (
              <>
                <p className="text-[12.5px] text-gray-500 leading-relaxed">
                  We'll detect your location to show delivery availability and accurate
                  delivery times across Pakistan.
                </p>

                {/* GPS button */}
                <button
                  onClick={handleAllow}
                  disabled={isDetecting}
                  className="w-full h-11 rounded-xl font-semibold text-sm text-white
                    flex items-center justify-center gap-2
                    transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: isDetecting
                      ? "#8bc34a"
                      : "linear-gradient(135deg,#6db800,#5FA800)",
                    boxShadow: "0 3px 12px rgba(95,168,0,0.32)",
                  }}
                >
                  {isDetecting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Detecting…</>
                    : <><Navigation className="w-4 h-4" /> Use Current Location</>
                  }
                </button>

                {/* OR divider */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[11px] text-gray-400 font-medium">or</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* Manual city button */}
                <button
                  onClick={() => setStep("manual")}
                  className="w-full h-10 rounded-xl border border-gray-200 font-medium text-sm text-gray-700
                    hover:border-[#5FA800] hover:text-[#5FA800] hover:bg-[#5FA800]/5
                    active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" /> Choose City Manually
                </button>
              </>
            ) : (
              <>
                <p className="text-[12px] text-gray-500">Search or pick your delivery city:</p>

                {/* Searchable dropdown */}
                <div ref={dropRef} className="relative">
                  <button
                    onClick={() => setDropOpen(!dropOpen)}
                    className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5
                      text-sm text-left bg-white transition-all
                      ${dropOpen
                        ? "border-[#5FA800] ring-2 ring-[#5FA800]/15"
                        : "border-gray-200 hover:border-[#5FA800]"}`}
                  >
                    <span className={selectedCity ? "text-gray-900 font-medium text-[13px]" : "text-gray-400 text-[13px]"}>
                      {selectedCity || "Select city…"}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0
                        ${dropOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {dropOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200
                      rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-20 overflow-hidden">
                      {/* Search */}
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search city…"
                            className="w-full text-[13px] pl-8 pr-3 py-1.5 rounded-lg bg-gray-50 outline-none
                              focus:ring-1 focus:ring-[#5FA800] focus:bg-white transition-all"
                          />
                        </div>
                      </div>
                      {/* List */}
                      <div className="max-h-40 overflow-y-auto overscroll-contain">
                        {filtered.map(c => (
                          <button
                            key={c}
                            onClick={() => { setSel(c); setDropOpen(false); setSearch(""); }}
                            className={`w-full flex items-center justify-between px-3.5 py-2 text-[13px] text-left
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
                          <p className="px-3.5 py-3 text-[12px] text-gray-400 text-center">No city found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <button
                  onClick={handleConfirm}
                  disabled={!selectedCity}
                  className={`w-full h-11 rounded-xl font-semibold text-sm
                    transition-all active:scale-[0.98]
                    ${selectedCity
                      ? "text-white"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                  style={selectedCity ? {
                    background: "linear-gradient(135deg,#6db800,#5FA800)",
                    boxShadow: "0 3px 12px rgba(95,168,0,0.32)",
                  } : {}}
                >
                  {selectedCity ? `Deliver to ${selectedCity}` : "Select a city first"}
                </button>

                <button
                  onClick={() => setStep("ask")}
                  className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors py-0.5"
                >
                  ← Try GPS detection instead
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes kpSlide {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @media (min-width: 640px) {
          @keyframes kpSlide {
            from { transform: translateY(10px) scale(0.97); opacity: 0; }
            to   { transform: translateY(0)    scale(1);    opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}
