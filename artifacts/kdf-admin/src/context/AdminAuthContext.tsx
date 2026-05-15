import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiPublicUrl } from "@/lib/apiBase";

export interface AdminUser {
  id:          number;
  name:        string;
  email:       string;
  phone?:      string;
  avatarUrl?:  string;
  isSuper:     boolean;
  permissions: string[];
  roles:       { id: number; name: string; slug: string; color: string }[];
  lastLoginAt?: string;
}

interface AdminAuthCtx {
  user:             AdminUser | null;
  isLoaded:         boolean;
  hasPermission:    (key: string) => boolean;
  hasAnyPermission: (keys: string[]) => boolean;
  setUser:          (u: AdminUser | null) => void;
  refreshMe:        () => Promise<void>;
  logout:           () => void;
}

const Ctx = createContext<AdminAuthCtx>({
  user: null, isLoaded: false,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  setUser: () => {},
  refreshMe: async () => {},
  logout: () => {},
});

const STORAGE_KEY = "kdf_admin_user";

function parseStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState]  = useState<AdminUser | null>(parseStoredUser);
  const [isLoaded, setLoaded] = useState(false);

  const setUser = useCallback((u: AdminUser | null) => {
    setUserState(u);
    if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    else   localStorage.removeItem(STORAGE_KEY);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("kdf_admin_token");
    localStorage.removeItem(STORAGE_KEY);
    setUserState(null);
    const base = (import.meta.env.BASE_URL || "/admin/").replace(/\/$/, "");
    window.location.href = `${base}/login`;
  }, []);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem("kdf_admin_token");
    if (!token) return;
    try {
      const res  = await fetch(apiPublicUrl("/api/admin-auth/me"), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok && data.user) {
        setUser(data.user);
      }
    } catch {
      /* ignore network errors on refresh */
    }
  }, [setUser]);

  /* On mount: if we have a token but no cached user, fetch me */
  useEffect(() => {
    const token = localStorage.getItem("kdf_admin_token");
    if (token && !user) {
      refreshMe().finally(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasPermission = useCallback((key: string): boolean => {
    if (!isLoaded || !user) return false;
    if (user.isSuper) return true;
    return user.permissions.includes(key);
  }, [user, isLoaded]);

  const hasAnyPermission = useCallback((keys: string[]): boolean => {
    return keys.some(k => hasPermission(k));
  }, [hasPermission]);

  return (
    <Ctx.Provider value={{ user, isLoaded, hasPermission, hasAnyPermission, setUser, refreshMe, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdminAuth() { return useContext(Ctx); }
