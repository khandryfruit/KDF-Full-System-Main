import { useState } from "react";
import { MapPin, Navigation, ChevronDown, X, Loader2 } from "lucide-react";
import { useUserLocation } from "@/context/LocationContext";
import { Button } from "@/components/ui/button";

interface LocationDetectPopupProps {
  onDismiss: () => void;
}

export function LocationDetectPopup({ onDismiss }: LocationDetectPopupProps) {
  const { detectLocation, cities, setCity, setLocationPermission, isDetecting } = useUserLocation();
  const [showManual, setShowManual] = useState(false);
  const [selectedCity, setSelectedCity] = useState("");

  const handleAllow = async () => {
    await detectLocation();
    onDismiss();
  };

  const handleManual = () => {
    setShowManual(true);
  };

  const handleSelectCity = () => {
    if (selectedCity) {
      setCity(selectedCity);
      setLocationPermission("denied");
      onDismiss();
    }
  };

  const handleClose = () => {
    setLocationPermission("denied");
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full sm:max-w-sm bg-white sm:rounded-2xl rounded-t-3xl shadow-2xl z-10 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#e8f5d4" }}>
              <MapPin className="w-5 h-5" style={{ color: "#5FA800" }} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">Allow Location Access?</h2>
              <p className="text-xs text-gray-500 mt-0.5">For accurate delivery estimates</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {!showManual ? (
            <>
              <p className="text-sm text-gray-600 leading-relaxed">
                We'll detect your location to show delivery availability and estimate accurate delivery times across Pakistan.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full h-11 font-semibold text-white rounded-xl"
                  style={{ backgroundColor: "#5FA800" }}
                  onClick={handleAllow}
                  disabled={isDetecting}
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Detecting...
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4 mr-2" />
                      Allow Location Access
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-10 font-medium text-gray-700 rounded-xl"
                  onClick={handleManual}
                >
                  Enter City Manually
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">Select your city to continue:</p>
              <div className="relative">
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm appearance-none focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/10 bg-gray-50 pr-10"
                >
                  <option value="">— Select a city —</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <Button
                className="w-full h-11 font-semibold text-white rounded-xl"
                style={{ backgroundColor: "#5FA800" }}
                onClick={handleSelectCity}
                disabled={!selectedCity}
              >
                Confirm City
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
