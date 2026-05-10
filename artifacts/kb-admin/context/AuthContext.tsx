import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export const BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "");

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
}

interface AuthContextType {
  adminUser: AdminUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  adminUser: null,
  token: null,
  loading: true,
  login: async () => ({ ok: false }),
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem("kb_admin_token");
        const d = await AsyncStorage.getItem("kb_admin_data");
        if (t && d) {
          setToken(t);
          setAdminUser(JSON.parse(d));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "Login failed" };
      await AsyncStorage.setItem("kb_admin_token", data.token);
      await AsyncStorage.setItem("kb_admin_data", JSON.stringify(data.user));
      setToken(data.token);
      setAdminUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Check your connection." };
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove(["kb_admin_token", "kb_admin_data"]);
    setToken(null);
    setAdminUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ adminUser, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }

export async function adminFetch(path: string, token: string | null, options: RequestInit = {}) {
  return fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}
