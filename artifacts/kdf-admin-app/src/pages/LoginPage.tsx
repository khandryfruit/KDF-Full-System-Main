import { useState } from "react";
import { useAuth } from "@/App";

const BASE = import.meta.env.BASE_URL;

export default function LoginPage() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  // On Railway set VITE_API_BASE_URL to the full API service URL so this
  // app can reach the API when deployed as a separate Railway service.
  const API = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const r    = await fetch(API + "/api/admin-auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const text = await r.text();
      let d: any;
      try { d = JSON.parse(text); }
      catch {
        const preview = text.replace(/<[^>]+>/g, " ").trim().slice(0, 120);
        setError(preview || `Server error (${r.status})`);
        return;
      }
      if (!r.ok) { setError(d.error ?? "Login failed"); return; }
      login(d.token, d.user ?? d.admin);
      window.location.href = BASE;
    } catch (err: any) {
      setError(err.message ?? "Network error — check your connection");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-3 shadow-lg shadow-primary/30">
            <span className="text-primary-foreground font-black text-2xl">K</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">KDF Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-xl"
        >
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@kdfnuts.com"
              required
              className="w-full h-11 rounded-xl bg-muted border border-border px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full h-11 rounded-xl bg-muted border border-border px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-1"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-5">
          KDF NUTS Admin Dashboard • Mobile Edition
        </p>
      </div>
    </div>
  );
}
