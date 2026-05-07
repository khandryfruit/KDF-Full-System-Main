import React, { createContext, useContext, useState } from 'react';

export interface UserProfile {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  postalCode?: string | null;
  createdAt?: string;
}

interface AppContextType {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  setAuth: (token: string, user: UserProfile) => void;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("kdf_token"));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const stored = localStorage.getItem("kdf_user");
    if (stored) {
      try { return JSON.parse(stored) as UserProfile; } catch { return null; }
    }
    return null;
  });

  const setAuth = (newToken: string, newUser: UserProfile) => {
    localStorage.setItem("kdf_token", newToken);
    localStorage.setItem("kdf_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem("kdf_token");
    localStorage.removeItem("kdf_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AppContext.Provider value={{ isAuthenticated: !!token && !!user, user, token, setAuth, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
