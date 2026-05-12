import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [, setLocation]    = useLocation();
  const { toast }          = useToast();
  const { setUser }        = useAdminAuth();
  const [email, setEmail]  = useState("");
  const [password, setPwd] = useState("");
  const [loading, setLoad] = useState(false);
  const [showPwd, setShow] = useState(false);
  const [error, setError]  = useState("");

  // On Railway each service gets its own domain. Set VITE_API_BASE_URL to the
  // full API service URL (e.g. https://kdf-api.up.railway.app) so login works
  // across separate Railway services. Defaults to "" (relative) on Replit.
  const API = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

  /** Fetch JSON safely — 15 s timeout, shows readable error on non-JSON response. */
  const fetchJson = async (url: string, init: RequestInit) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(API + url, { ...init, signal: controller.signal });
    } catch (e: any) {
      clearTimeout(tid);
      if (e?.name === "AbortError") throw new Error("Request timed out — please try again.");
      throw new Error(e?.message ?? "Network error — please try again.");
    }
    clearTimeout(tid);
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); }
    catch {
      const preview = text.replace(/<[^>]+>/g, " ").trim().slice(0, 120);
      throw new Error(preview || `Server returned ${res.status}`);
    }
    return { res, body };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Email and password are required"); return; }
    setError("");
    setLoad(true);
    try {
      /* ── Try new RBAC admin login first ── */
      const { res, body: json } = await fetchJson("/api/admin-auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (res.ok && json.ok) {
        localStorage.setItem("kdf_admin_token", json.token);
        setUser(json.user);
        toast({ title: `Welcome back, ${json.user.name}!` });
        setLocation("/dashboard");
        return;
      }

      /* ── Fallback: legacy storefront admin (users table) ── */
      const { res: legacyRes, body: legacyJson } = await fetchJson("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password }),
      });

      if (legacyRes.ok && legacyJson.token) {
        if (legacyJson.user?.role !== "admin") {
          setError("Access denied — admin accounts only.");
          return;
        }
        localStorage.setItem("kdf_admin_token", legacyJson.token);
        toast({ title: "Logged in successfully" });
        setLocation("/dashboard");
        return;
      }

      setError(json.error ?? legacyJson?.error ?? "Invalid credentials. Please try again.");
    } catch (err: any) {
      setError(err.message ?? "Network error — please try again.");
    } finally {
      setLoad(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-primary/25">
            <span className="text-primary-foreground font-black text-2xl tracking-tighter">KDF</span>
          </div>
          <h1 className="text-2xl font-bold">KDF NUTS Command Center</h1>
          <p className="text-muted-foreground text-sm">Enterprise Admin Dashboard</p>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="pb-4 text-center">
            <CardTitle className="text-lg flex items-center justify-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Secure Sign In
            </CardTitle>
            <CardDescription>Enter your admin credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@kdfnuts.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-11"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPwd(e.target.value)}
                    className="h-11 pr-10"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                {loading ? "Authenticating…" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Protected by Enterprise RBAC · KDF NUTS v2.0
        </p>
      </div>
    </div>
  );
}
