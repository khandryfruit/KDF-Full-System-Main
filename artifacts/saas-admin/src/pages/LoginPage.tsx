import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";
import { apiFetch, setToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);

  const login = useMutation({
    mutationFn: () => apiFetch("/saas/admin/login", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: (data: any) => {
      setToken(data.token);
      qc.invalidateQueries({ queryKey: ["saas-admin-me"] });
      setLocation("/");
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const seed = useMutation({
    mutationFn: () => apiFetch("/saas/admin/seed", {
      method: "POST",
      body: JSON.stringify({ name: "Platform Admin", email: form.email || "admin@platform.com", password: form.password || "Admin@SaaS2024" }),
    }),
    onSuccess: (data: any) => {
      setToken(data.token);
      qc.invalidateQueries({ queryKey: ["saas-admin-me"] });
      setLocation("/");
      toast({ title: "Super admin created & logged in!" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/30">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">SaaS Platform</h1>
          <p className="text-muted-foreground text-sm mt-1">Super Admin Console</p>
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="admin@platform.com"
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={e => e.key === "Enter" && login.mutate()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-input border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={e => e.key === "Enter" && login.mutate()}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <button
            onClick={() => login.mutate()}
            disabled={login.isPending || !form.email || !form.password}
            className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {login.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign In
          </button>
        </div>

        {/* First time setup */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-2">First time setup?</p>
          <button
            onClick={() => seed.mutate()}
            disabled={seed.isPending}
            className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
          >
            {seed.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Create default super admin account
          </button>
          <p className="text-[10px] text-muted-foreground mt-1">
            Default: admin@platform.com / Admin@SaaS2024
          </p>
        </div>
      </div>
    </div>
  );
}
