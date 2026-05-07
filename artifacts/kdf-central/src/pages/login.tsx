import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Star, LogIn, AlertCircle } from "lucide-react";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await api.login(email, password);
      if (user.role !== "admin") {
        setError("Access restricted to admin accounts only.");
        return;
      }
      setToken(token);
      onLogin();
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      {/* Brand badge */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-sidebar-primary rounded-2xl flex items-center justify-center shadow-lg">
            <Star className="h-6 w-6 text-sidebar" />
          </div>
          <div>
            <p className="text-xl font-bold text-sidebar-foreground">KDF Central</p>
            <p className="text-xs text-sidebar-foreground/60">Multi-Branch Enterprise Platform</p>
          </div>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Admin Login</CardTitle>
            <CardDescription className="text-sm">Sign in with your KDF admin credentials to access the central dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs font-medium">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@khanbabadryfruits.com"
                  className="mt-1"
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1"
                  required
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />Signing in…</span>
                ) : (
                  <span className="flex items-center gap-2"><LogIn className="h-4 w-4" />Sign In</span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-sidebar-foreground/40 mt-6">
          Khan Dry Fruits © {new Date().getFullYear()} — All Branches Unified
        </p>
      </div>
    </div>
  );
}
