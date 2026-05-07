import React, { createContext, useContext, useState, useEffect } from "react";

export type OrderType = "delivery" | "pickup";

interface LocationState {
  orderType: OrderType;
  city: string;
  isSet: boolean;
  setOrderType: (t: OrderType) => void;
  setCity: (c: string) => void;
  confirmLocation: (city: string, orderType: OrderType) => void;
  resetLocation: () => void;
}

const LocationContext = createContext<LocationState | null>(null);

const STORAGE_KEY = "kdf_nuts_location";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [orderType, setOrderTypeState] = useState<OrderType>("delivery");
  const [city, setCityState] = useState("");
  const [isSet, setIsSet] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const d = JSON.parse(stored);
        setCityState(d.city ?? "");
        setOrderTypeState(d.orderType ?? "delivery");
        setIsSet(true);
      }
    } catch {}
  }, []);

  const setOrderType = (t: OrderType) => setOrderTypeState(t);
  const setCity = (c: string) => setCityState(c);

  const confirmLocation = (c: string, t: OrderType) => {
    setCityState(c);
    setOrderTypeState(t);
    setIsSet(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ city: c, orderType: t }));
  };

  const resetLocation = () => {
    setIsSet(false);
    setCityState("");
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <LocationContext.Provider value={{ orderType, city, isSet, setOrderType, setCity, confirmLocation, resetLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useNutsLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useNutsLocation must be used inside LocationProvider");
  return ctx;
}
