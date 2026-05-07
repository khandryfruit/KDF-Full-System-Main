import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Production API base URL.
 *
 * Priority order:
 *   1. EXPO_PUBLIC_API_URL  — set this in eas.json env or .env.local for production
 *   2. EXPO_PUBLIC_DOMAIN   — auto-set in Replit dev environment
 *   3. Empty string (will cause fetch errors — always set one of the above)
 *
 * Example eas.json env:
 *   "env": { "EXPO_PUBLIC_API_URL": "https://api.yourdomain.com" }
 */
export const BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "");

export interface Rider {
  id: number;
  name: string;
  phone: string;
  whatsapp_number?: string;
  delivery_area?: string;
  vehicle_type?: string;
  status: string;
  delivery_charge_per_order?: number;
  cnic?: string;
}

interface AuthContextType {
  rider: Rider | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  rider: null,
  token: null,
  loading: true,
  login: async () => ({ ok: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("kdf_rider_token");
        const savedRider = await AsyncStorage.getItem("kdf_rider_data");
        if (saved && savedRider) {
          setToken(saved);
          setRider(JSON.parse(savedRider));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/rider/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "Login failed" };
      await AsyncStorage.setItem("kdf_rider_token", data.token);
      await AsyncStorage.setItem("kdf_rider_data", JSON.stringify(data.rider));
      setToken(data.token);
      setRider(data.rider);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Check your connection." };
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem("kdf_rider_token");
    await AsyncStorage.removeItem("kdf_rider_data");
    setToken(null);
    setRider(null);
  }, []);

  return (
    <AuthContext.Provider value={{ rider, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function riderFetch(path: string, token: string | null, options: RequestInit = {}) {
  const url = `${BASE_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  return res;
}
