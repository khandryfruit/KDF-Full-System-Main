import { useState } from "react";
import { api, setToken } from "@/lib/api";

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("admin@platform.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [seedMode, setSeedMode] = useState(false);
  const [seedName, setSeedName] = useState("Platform Admin");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login(email, password);
      setToken(data.token);
      onLogin();
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.seed(seedName, email, password);
      setToken(data.token);
      onLogin();
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-4">
            <span className="text-2xl">⚡</span>
          </div>
          <h1 className="text-2xl font-bold text-white">SaaS Platform</h1>
          <p className="text-slate-400 text-sm mt-1">Super Admin Console</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
          <div className="flex mb-6 bg-slate-800/50 rounded-lg p-1">
            <button
              onClick={() => setSeedMode(false)}
              className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-all ${!seedMode ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setSeedMode(true)}
              className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-all ${seedMode ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              First Setup
            </button>
          </div>

          <form onSubmit={seedMode ? handleSeed : handleLogin} className="space-y-4">
            {seedMode && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Your Name</label>
                <input
                  value={seedName}
                  onChange={e => setSeedName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Platform Admin"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
                placeholder="admin@platform.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? "Please wait..." : seedMode ? "Create Admin Account" : "Sign In"}
            </button>
          </form>

          {!seedMode && (
            <p className="text-center text-xs text-slate-500 mt-4">
              Default: admin@platform.com / Admin@SaaS2024
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
