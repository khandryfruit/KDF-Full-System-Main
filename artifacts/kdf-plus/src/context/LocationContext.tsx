import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

export interface LocationSettings {
  isEnabled: boolean;
  apiKey: string | null;
  autoDetectLocation: boolean;
}

interface LocationContextType {
  city: string;
  setCity: (city: string) => void;
  cities: string[];
  detectLocation: () => Promise<void>;
  isDetecting: boolean;
  locationPermission: "unknown" | "granted" | "denied";
  setLocationPermission: (p: "unknown" | "granted" | "denied") => void;
  mapsSettings: LocationSettings | null;
  mapsLoaded: boolean;
  initAutocomplete: (input: HTMLInputElement, onSelect: (address: string, city?: string) => void) => (() => void) | undefined;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

const FALLBACK_CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad",
  "Multan", "Peshawar", "Quetta", "Sialkot", "Hyderabad",
  "Gujranwala", "Bahawalpur", "Sargodha", "Sukkur", "Larkana",
  "Sheikhupura", "Mardan", "Gujrat", "Rahim Yar Khan", "Abbottabad",
];

let mapsLoadPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (mapsLoadPromise) return mapsLoadPromise;
  if (typeof window !== "undefined" && (window as any).google?.maps?.places) {
    return Promise.resolve();
  }
  mapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // Client key: only Maps JavaScript API + Places API (domain-restricted)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

// Server-side reverse geocoding — uses Server API key (Geocoding API, no domain restriction)
async function reverseGeocodeViaServer(lat: number, lng: number): Promise<{ city: string; fullAddress: string } | null> {
  try {
    const res = await fetch("/api/geocode/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.city) return { city: data.city, fullAddress: data.fullAddress ?? "" };
    return null;
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [city, setCityState] = useState<string>("Karachi");
  const [cities, setCities] = useState<string[]>(FALLBACK_CITIES);
  const [mapsSettings, setMapsSettings] = useState<LocationSettings | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [locationPermission, setLocationPermission] = useState<"unknown" | "granted" | "denied">(() => {
    const saved = localStorage.getItem("kdf_location_permission");
    return (saved as any) ?? "unknown";
  });

  useEffect(() => {
    const saved = localStorage.getItem("kdf_user_city");
    if (saved) setCityState(saved);
  }, []);

  useEffect(() => {
    fetch("/api/cities")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data) && data.length) setCities(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/location-settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setMapsSettings(data);
        if (data.isEnabled && data.apiKey) {
          loadGoogleMaps(data.apiKey)
            .then(() => setMapsLoaded(true))
            .catch(() => setMapsLoaded(false));
        }
      })
      .catch(() => {});
  }, []);

  const setCity = useCallback((newCity: string) => {
    setCityState(newCity);
    localStorage.setItem("kdf_user_city", newCity);
  }, []);

  const handleSetPermission = useCallback((p: "unknown" | "granted" | "denied") => {
    setLocationPermission(p);
    localStorage.setItem("kdf_location_permission", p);
  }, []);

  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) return;
    setIsDetecting(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );
      handleSetPermission("granted");
      const { latitude, longitude } = position.coords;

      let detectedCity = "";
      let fullAddress = "";

      // Always use server-side geocoding (Server API key — no domain restriction)
      const result = await reverseGeocodeViaServer(latitude, longitude);
      if (result?.city) { detectedCity = result.city; fullAddress = result.fullAddress; }

      if (detectedCity) setCity(detectedCity);

      fetch("/api/user-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude, fullAddress, city: detectedCity, country: "Pakistan" }),
      }).catch(() => {});
    } catch {
      handleSetPermission("denied");
    } finally {
      setIsDetecting(false);
    }
  }, [mapsLoaded, setCity, handleSetPermission]);

  const initAutocomplete = useCallback(
    (input: HTMLInputElement, onSelect: (address: string, city?: string) => void) => {
      if (!mapsLoaded || !(window as any).google?.maps?.places) return undefined;
      const g = (window as any).google;
      const autocomplete = new g.maps.places.Autocomplete(input, {
        componentRestrictions: { country: "pk" },
        fields: ["formatted_address", "address_components", "geometry"],
        types: ["geocode", "establishment"],
      });
      const listener = autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place) return;
        const cityComp = place.address_components?.find(
          (c: any) => c.types.includes("locality") || c.types.includes("administrative_area_level_2")
        );
        onSelect(place.formatted_address ?? input.value, cityComp?.long_name);
      });
      return () => {
        g.maps.event.removeListener(listener);
      };
    },
    [mapsLoaded]
  );

  return (
    <LocationContext.Provider
      value={{
        city,
        setCity,
        cities,
        detectLocation,
        isDetecting,
        locationPermission,
        setLocationPermission: handleSetPermission,
        mapsSettings,
        mapsLoaded,
        initAutocomplete,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useUserLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useUserLocation must be used within a LocationProvider");
  }
  return context;
}
