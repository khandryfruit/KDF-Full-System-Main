import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  Plus, Search, Filter, MoreVertical, CheckCircle2, Clock, PauseCircle, XCircle,
  Globe, Building2, ChevronRight, Trash2, Play, Pause, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  trial: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  suspended: "bg-red-500/20 text-red-400 border-red-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  pending: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};
const INDUSTRY_ICONS: Record<string, string> = {
  grocery: "🛒", fashion: "👗", electronics: "💻", pharmacy: "💊",
  food: "🍕", beauty: "💄", sports: "⚽", furniture: "🪑", books: "📚", other: "🏪",
};

export default function TenantsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ["saas-tenants", search, status],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (status) p.set("status", status);
      return apiFetch(`/saas/admin/tenants?${p}`);
    },
  });

  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => apiFetch(`/saas/admin/tenants/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenants"] }); toast({ title: "Tenant suspended" }); },
  });
  const activate = useMutation({
    mutationFn: (id: number) => apiFetch(`/saas/admin/tenants/${id}/activate`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenants"] }); toast({ title: "Tenant activated" }); },
  });
  const cancel = useMutation({
    mutationFn: (id: number) => apiFetch(`/saas/admin/tenants/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saas-tenants"] }); toast({ title: "Tenant cancelled" }); },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{(tenants as any[]).length} total tenants</p>
        </div>
        <button
          onClick={() => setLocation("/tenants/new")}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground hover:bg-accent">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (tenants as any[]).length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No tenants found</p>
            <button onClick={() => setLocation("/tenants/new")} className="mt-4 text-primary text-sm hover:underline">
              + Add your first tenant
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Store</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Industry</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(tenants as any[]).map((t: any) => (
                  <tr key={t.id} className="border-b border-border hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => setLocation(`/tenants/${t.id}`)} className="flex items-center gap-3 text-left">
                        {t.logoUrl ? (
                          <img src={t.logoUrl} className="w-9 h-9 rounded-lg object-cover border border-border" alt="" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center text-base flex-shrink-0">
                            {INDUSTRY_ICONS[t.industry] ?? "🏪"}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground hover:text-primary transition-colors">{t.storeName}</p>
                          <p className="text-xs text-muted-foreground">{t.email}</p>
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs capitalize text-muted-foreground">{INDUSTRY_ICONS[t.industry] ?? "🏪"} {t.industry}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-foreground">{t.planName ?? <span className="text-muted-foreground">No plan</span>}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full border ${STATUS_COLORS[t.status] ?? STATUS_COLORS.trial}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs text-foreground">{t.ownerName ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{t.ownerPhone ?? ""}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenu === t.id && (
                          <div className="absolute right-0 top-8 z-50 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                            <button onClick={() => { setLocation(`/tenants/${t.id}`); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left">
                              <ChevronRight className="w-3.5 h-3.5" /> View Details
                            </button>
                            <button onClick={() => { setLocation(`/tenants/${t.id}/storefront`); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left">
                              <Globe className="w-3.5 h-3.5" /> Storefront Builder
                            </button>
                            {t.status !== "active" && (
                              <button onClick={() => { activate.mutate(t.id); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left text-green-400">
                                <Play className="w-3.5 h-3.5" /> Activate
                              </button>
                            )}
                            {t.status !== "suspended" && (
                              <button onClick={() => { suspend.mutate({ id: t.id }); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left text-amber-400">
                                <Pause className="w-3.5 h-3.5" /> Suspend
                              </button>
                            )}
                            <button onClick={() => { if (confirm("Cancel this tenant?")) { cancel.mutate(t.id); setOpenMenu(null); } }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left text-red-400">
                              <Trash2 className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Close dropdown on outside click */}
      {openMenu !== null && <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />}
    </div>
  );
}
