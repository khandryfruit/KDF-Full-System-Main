import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { formatDate, statusColor, tierColor, industryIcon } from "@/lib/utils";

export default function TenantsPage() {
  const [, navigate] = useLocation();
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", storeName: "",
    ownerName: "", ownerPhone: "", industry: "other", planId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    const [t, p] = await Promise.all([api.tenants.list(params), api.plans.list()]);
    setTenants(t);
    setPlans(p);
    setLoading(false);
  }

  useEffect(() => { load(); }, [search, statusFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.tenants.create({
        ...form,
        planId: form.planId ? Number(form.planId) : undefined,
      });
      setShowAdd(false);
      setForm({ name: "", email: "", password: "", storeName: "", ownerName: "", ownerPhone: "", industry: "other", planId: "" });
      load();
    } catch (err: any) {
      setError(err.message || "Failed to create tenant");
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend(id: number) {
    if (!confirm("Suspend this tenant?")) return;
    await api.tenants.suspend(id, "Suspended by admin");
    load();
  }

  async function handleActivate(id: number) {
    await api.tenants.activate(id);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Cancel this tenant account? This marks it as cancelled.")) return;
    await api.tenants.delete(id);
    load();
  }

  const industries = ["grocery", "fashion", "electronics", "pharmacy", "food", "beauty", "sports", "furniture", "books", "other"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="text-slate-400 text-sm mt-1">{tenants.length} stores on the platform</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Tenant
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search stores or emails..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 w-64"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
        >
          <option value="">All Status</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800 bg-slate-900/50">
                <th className="text-left px-4 py-3">Store</th>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Trial Ends</th>
                <th className="text-left px-4 py-3">Joined</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{industryIcon(t.industry)}</span>
                      <div>
                        <button
                          onClick={() => navigate(`/tenants/${t.id}`)}
                          className="font-medium text-white hover:text-emerald-400 transition-colors text-left"
                        >
                          {t.storeName}
                        </button>
                        <div className="text-xs text-slate-500">{t.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <div>{t.ownerName || "—"}</div>
                    <div className="text-xs text-slate-600">{t.ownerPhone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tierColor(t.planTier || "")}`}>
                      {t.planName || "No Plan"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(t.status)}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(t.trialEndsAt)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/tenants/${t.id}`)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                      >
                        View
                      </button>
                      {t.status === "suspended" ? (
                        <button
                          onClick={() => handleActivate(t.id)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                        >
                          Activate
                        </button>
                      ) : t.status !== "cancelled" ? (
                        <button
                          onClick={() => handleSuspend(t.id)}
                          className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                        >
                          Suspend
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    No tenants found. Add your first tenant above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Add New Tenant</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Store Name *</label>
                  <input
                    value={form.storeName}
                    onChange={e => setForm(p => ({ ...p, storeName: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                    placeholder="My Store"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Owner Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Password *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Industry</label>
                  <select
                    value={form.industry}
                    onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  >
                    {industries.map(i => <option key={i} value={i} className="capitalize">{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Plan</label>
                  <select
                    value={form.planId}
                    onChange={e => setForm(p => ({ ...p, planId: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  >
                    <option value="">No Plan</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Owner Phone</label>
                  <input
                    value={form.ownerPhone}
                    onChange={e => setForm(p => ({ ...p, ownerPhone: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                    placeholder="03001234567"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setError(""); }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
                >
                  {saving ? "Creating..." : "Create Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
