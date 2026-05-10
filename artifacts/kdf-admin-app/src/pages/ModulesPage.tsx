import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { useState, useEffect } from "react";

const ICON_MAP: Record<string, string> = {
  "shopping-bag":   "🛍️",
  "truck":          "🚚",
  "bike":           "🏍️",
  "receipt":        "🧾",
  "message-circle": "💬",
  "megaphone":      "📣",
  "bar-chart-2":    "📊",
  "git-branch":     "🌿",
  "bell":           "🔔",
  "credit-card":    "💳",
  "settings-2":     "⚙️",
  "sliders":        "🎛️",
};

export default function ModulesPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [toggling, setToggling] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-modules-app"],
    queryFn:  () =>
      fetch("/api/admin/modules", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    refetchInterval: 60_000,
  });

  /* SSE live sync */
  useEffect(() => {
    const es = new EventSource("/api/admin/modules/events");
    es.addEventListener("message", (e: any) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "module_update" || d.type === "module_toggled") {
          qc.invalidateQueries({ queryKey: ["admin-modules-app"] });
          setLiveStatus(`Updated: ${d.module?.module_name ?? d.module_name}`);
          setTimeout(() => setLiveStatus(null), 3000);
        }
      } catch {}
    });
    return () => es.close();
  }, [qc]);

  const modules: any[] = data?.modules ?? [];

  const toggle = async (key: string) => {
    setToggling(key);
    try {
      await fetch(`/api/admin/modules/${key}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      await refetch();
    } finally {
      setToggling(null);
    }
  };

  return (
    <AppShell title="Module Controls">
      <div className="p-4 space-y-3">
        {/* Live indicator */}
        {liveStatus && (
          <div className="bg-primary/10 border border-primary/30 text-primary text-xs rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {liveStatus}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Toggle modules on or off to control what features are accessible across the platform.
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {modules.map((m: any) => {
              const emoji  = ICON_MAP[m.icon] ?? "📦";
              const isOn   = m.is_enabled;
              const busy   = toggling === m.module_key;
              return (
                <div
                  key={m.module_key}
                  className={`bg-card border rounded-2xl p-4 flex items-center gap-3 transition ${isOn ? "border-primary/30" : "border-border opacity-70"}`}
                >
                  <span className="text-2xl shrink-0">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.module_name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {m.web_visible && <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Web</span>}
                      {m.app_visible && <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">App</span>}
                    </div>
                  </div>
                  {/* Toggle */}
                  <button
                    disabled={busy}
                    onClick={() => toggle(m.module_key)}
                    className={`w-12 h-6 rounded-full relative transition-all ${isOn ? "bg-primary" : "bg-muted"} ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isOn ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
