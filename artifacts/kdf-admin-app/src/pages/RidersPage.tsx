import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { useState } from "react";

function apiFetch(path: string, token: string | null, opts?: RequestInit) {
  return fetch(`/api${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
}

function riderDot(r: any) {
  if (r.is_online) return "bg-green-500";
  if (r.status === "active") return "bg-gray-400";
  return "bg-red-500";
}

function riderStatusLabel(r: any) {
  if (r.is_online) return "● Online";
  return "○ Offline";
}

export default function RidersPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [toggling, setToggling] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-riders-app"],
    queryFn:  () => apiFetch("/admin/riders", token).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["admin-riders-stats-app"],
    queryFn:  () => apiFetch("/admin/riders/stats", token).then(r => r.json()),
    refetchInterval: 15_000,
  });

  const riders = data?.riders ?? [];
  const stats  = statsData?.stats ?? {};

  const onlineCount    = stats.active_riders ?? "—";
  const totalLahore    = stats.total_lahore   ?? "—";
  const totalAssigned  = stats.total_assigned ?? "—";
  const unassignedCount = (stats.total_lahore != null && stats.total_assigned != null)
    ? Number(stats.total_lahore) - Number(stats.total_assigned) : "—";

  const toggleOnline = async (riderId: number, currentStatus: string) => {
    setToggling(riderId);
    try {
      await apiFetch(`/admin/riders/${riderId}/toggle-online`, token, { method: "PATCH" });
      await qc.invalidateQueries({ queryKey: ["admin-riders-app"] });
      await qc.invalidateQueries({ queryKey: ["admin-riders-stats-app"] });
    } finally {
      setToggling(null);
    }
  };

  const autoAssign = async () => {
    try {
      const r = await apiFetch("/admin/riders/auto-assign", token, {
        method: "POST",
        body: JSON.stringify({ limit: 50 }),
      });
      const d = await r.json();
      alert(`✅ Assigned ${d.assigned ?? 0} orders to riders`);
      qc.invalidateQueries({ queryKey: ["admin-riders-app"] });
    } catch {
      alert("Error running auto-assign");
    }
  };

  return (
    <AppShell title="Riders">
      <div className="p-4 space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total (Lahore)", value: totalLahore,    color: "text-foreground"  },
            { label: "Online",         value: onlineCount,    color: "text-green-400"   },
            { label: "Unassigned",     value: unassignedCount, color: "text-orange-400" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Auto-Assign Button */}
        <button
          onClick={autoAssign}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition hover:opacity-90 active:scale-[0.98]"
        >
          ⚡ Auto-Assign All Unassigned Orders
        </button>

        {/* Rider List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : riders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <span className="text-4xl mb-3">🏍️</span>
            <p className="text-sm">No riders found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {riders.map((r: any) => (
              <div key={r.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 relative">
                    <span className="text-base font-bold text-foreground">
                      {(r.name ?? "R")[0].toUpperCase()}
                    </span>
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card ${riderDot(r)}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.active_deliveries ?? 0} active · {r.total_delivered ?? 0} delivered
                    </p>
                  </div>

                  {/* Toggle Online */}
                  <button
                    disabled={toggling === r.id}
                    onClick={() => toggleOnline(r.id, r.status)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                      r.is_online
                        ? "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20"
                        : "bg-muted text-muted-foreground border-border hover:bg-accent"
                    } ${toggling === r.id ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {toggling === r.id ? "..." : riderStatusLabel(r)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
