import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/App";
import { MessageCircle, Search, RefreshCw, Phone, Clock } from "lucide-react";

function apiFetch(path: string, token: string | null) {
  return fetch(`/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusDot(status: string) {
  if (status === "open")    return "bg-green-500";
  if (status === "pending") return "bg-yellow-500";
  if (status === "closed")  return "bg-muted-foreground";
  return "bg-blue-500";
}

export default function WhatsAppPage() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "pending">("all");

  const { data: rawData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["wa-conversations", filter],
    queryFn:  () => apiFetch(
      `/admin/whatsapp/conversations${filter !== "all" ? `?status=${filter}` : ""}`,
      token
    ),
    refetchInterval: 20_000,
  });

  const allConversations: any[] = Array.isArray(rawData) ? rawData : (rawData?.conversations ?? rawData?.rows ?? []);

  const conversations = allConversations.filter((c: any) =>
    !search ||
    (c.contact_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search)
  );

  const unread = allConversations.reduce((sum: number, c: any) => sum + (Number(c.unread_count) || 0), 0);

  return (
    <AppShell title="WhatsApp">
      <div className="p-4 space-y-3">
        {/* Header stats */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              Conversations
            </h2>
            {unread > 0 && (
              <p className="text-xs text-orange-400 font-medium">{unread} unread message{unread > 1 ? "s" : ""}</p>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/70 transition"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["all", "open", "pending"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading conversations…</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-12 text-center">
            <MessageCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No conversations found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((c: any) => (
              <div key={c.id}
                className="bg-card border border-border rounded-2xl p-3.5 flex items-start gap-3 active:scale-[0.99] transition-transform">
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center font-bold text-green-400 text-sm">
                    {(c.contact_name ?? c.phone ?? "?")[0].toUpperCase()}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${statusDot(c.status)}`} />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {c.contact_name ?? "Unknown"}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                      <Clock className="w-3 h-3" />
                      {c.last_message_at ? timeAgo(c.last_message_at) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">{c.phone ?? "—"}</span>
                  </div>
                  {c.last_message && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.last_message}</p>
                  )}
                </div>
                {/* Unread badge */}
                {(c.unread_count ?? 0) > 0 && (
                  <div className="shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-white">
                    {c.unread_count}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
