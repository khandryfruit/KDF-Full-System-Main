import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface BranchUser {
  id: number;
  name: string;
  username: string;
  role: string;
}

export interface Branch {
  id: number;
  name: string;
  slug: string;
  city: string;
  address?: string;
  phone?: string;
}

interface BranchAuthState {
  token: string | null;
  user: BranchUser | null;
  branch: Branch | null;
  isLoading: boolean;
}

interface BranchAuthContextValue extends BranchAuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const BranchAuthContext = createContext<BranchAuthContextValue | null>(null);

const TOKEN_KEY = "kdf_branch_token";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function BranchAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BranchAuthState>({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
    branch: null,
    isLoading: true,
  });

  const fetchMe = useCallback(async (token: string) => {
    try {
      const data = await apiFetch("/api/branch/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setState({ token, user: data.user, branch: data.branch, isLoading: false });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setState({ token: null, user: null, branch: null, isLoading: false });
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) {
      fetchMe(t);
    } else {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, [fetchMe]);

  const login = async (username: string, password: string) => {
    const data = await apiFetch("/api/branch/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    setState({ token: data.token, user: data.user, branch: data.branch, isLoading: false });
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ token: null, user: null, branch: null, isLoading: false });
  };

  return (
    <BranchAuthContext.Provider
      value={{ ...state, login, logout, isAuthenticated: !!state.token && !!state.user }}
    >
      {children}
    </BranchAuthContext.Provider>
  );
}

export function useBranchAuth() {
  const ctx = useContext(BranchAuthContext);
  if (!ctx) throw new Error("useBranchAuth must be inside BranchAuthProvider");
  return ctx;
}
