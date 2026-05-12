import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, ChevronDown, X, Loader2, Search, Check } from "lucide-react";
import { useUserLocation } from "@/context/LocationContext";

const PAKISTAN_CITIES = [
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

interface Props {
  onDismiss: () => void;
}

export function LocationDetectPopup({ onDismiss }: Props) {
  const { detectLocation, cities, setCity, setLocationPermission, isDetecting } = useUserLocation();
  const [step, setStep] = useState<"ask" | "manual">("ask");
  const [selectedCity, setSelectedCity] = useState("");
  const [search, setSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const allCities = cities?.length ? cities : PAKISTAN_CITIES;
  const filtered = allCities.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );

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

  const handleAllow = async () => {
    await detectLocation();
    onDismiss();
  };

  const handleClose = () => {
    setLocationPermission("denied");
    onDismiss();
  };

  const handleConfirmCity = () => {
    if (!selectedCity) return;
    setCity(selectedCity);
    setLocationPermission("denied");
    onDismiss();
  };

  return (
    /* Overlay — z-[500] to sit above bottom nav (z-[400]) and WhatsApp btn (z-[450]) */
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-[400px] bg-white z-10 overflow-hidden
          rounded-t-[28px] sm:rounded-[24px]
          shadow-[0_-8px_40px_rgba(0,0,0,0.18)] sm:shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
        style={{
          /* On mobile, add padding for bottom nav (≈64px) + phone safe area */
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          marginBottom: 0,
          /* Slide up animation */
          animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1) both",
        }}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-3 pb-3 sm:pt-5">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#e8f5d4 0%,#d4edb0 100%)" }}
            >
              <MapPin className="w-5 h-5" style={{ color: "#5FA800" }} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-[15px] leading-snug">
                {step === "ask" ? "Allow Location Access?" : "Select Your City"}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === "ask" ? "For accurate delivery estimates" : "Choose the nearest city"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400
              hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors flex-shrink-0 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />

        {/* Body */}
        <div className="px-5 pt-4 pb-5 space-y-3">
          {step === "ask" ? (
            <>
              <p className="text-sm text-gray-600 leading-relaxed">
                We'll detect your location to show delivery availability and estimate
                accurate delivery times across Pakistan.
              </p>

              {/* Allow button */}
              <button
                onClick={handleAllow}
                disabled={isDetecting}
                className="w-full h-12 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2
                  transition-all active:scale-[0.98] disabled:opacity-60"
                style={{
                  background: isDetecting
                    ? "#8bc34a"
                    : "linear-gradient(135deg,#6db800 0%,#5FA800 60%,#4d8a00 100%)",
                  boxShadow: "0 4px 16px rgba(95,168,0,0.35)",
                }}
              >
                {isDetecting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Detecting location…</>
                ) : (
                  <><Navigation className="w-4 h-4" /> Use Current Location</>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 font-medium">or</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Manual button */}
              <button
                onClick={() => setStep("manual")}
                className="w-full h-11 rounded-2xl border border-gray-200 font-medium text-sm text-gray-700
                  hover:border-[#5FA800] hover:text-[#5FA800] hover:bg-[#5FA800]/5
                  active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" /> Enter City Manually
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">Search or pick your city to see delivery options:</p>

              {/* Custom searchable dropdown */}
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
                    {/* Search */}
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

                    {/* City list */}
                    <div className="max-h-48 overflow-y-auto overscroll-contain">
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

              {/* Confirm */}
              <button
                onClick={handleConfirmCity}
                disabled={!selectedCity}
                className={`w-full h-12 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]
                  ${selectedCity
                    ? "text-white shadow-md"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                style={selectedCity ? {
                  background: "linear-gradient(135deg,#6db800 0%,#5FA800 60%,#4d8a00 100%)",
                  boxShadow: "0 4px 16px rgba(95,168,0,0.35)",
                } : {}}
              >
                {selectedCity ? `Deliver to ${selectedCity}` : "Select a City First"}
              </button>

              <button
                onClick={() => setStep("ask")}
                className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
              >
                ← Try GPS detection instead
              </button>
            </>
          )}
        </div>

        {/* Bottom spacer — clears mobile bottom nav (≈64 px) */}
        <div className="h-16 sm:h-0" />
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @media (min-width: 640px) {
          @keyframes slideUp {
            from { transform: translateY(12px) scale(0.97); opacity: 0; }
            to   { transform: translateY(0)    scale(1);    opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
