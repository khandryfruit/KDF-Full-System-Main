import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Activity, User, Building2 } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  create_tenant: "text-green-400 bg-green-500/20",
  update_tenant: "text-blue-400 bg-blue-500/20",
  cancel_tenant: "text-red-400 bg-red-500/20",
  register: "text-purple-400 bg-purple-500/20",
  change_plan: "text-amber-400 bg-amber-500/20",
};

export default function ActivityPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["saas-activity"],
    queryFn: () => apiFetch("/saas/admin/activity"),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground text-sm mt-0.5">All platform events and actions</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (logs as any[]).length === 0 ? (
          <div className="text-center py-16">
            <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No activity recorded yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(logs as any[]).map((log: any) => {
              const col = ACTION_COLORS[log.action] ?? "text-gray-400 bg-gray-500/20";
              return (
                <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-accent/30 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${col}`}>
                    {log.actorType === "super_admin" ? <User className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground capitalize">
                        {log.action.replace(/_/g, " ")}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${col}`}>
                        {log.actorType === "super_admin" ? "Super Admin" : "Tenant"}
                      </span>
                      {log.entity && <span className="text-[10px] text-muted-foreground">{log.entity} #{log.entityId}</span>}
                    </div>
                    {log.meta && Object.keys(log.meta).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {Object.entries(log.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.ip && ` · ${log.ip}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
