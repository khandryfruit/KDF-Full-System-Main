import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Search, Phone, Mail, MapPin, Download, Trash2,
  MessageCircle, RefreshCw,
  UserCheck, UserPlus, ShoppingBag, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const getToken = () => localStorage.getItem("kdf_admin_token") ?? "";
function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, { ...opts, headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" } });
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_OPTIONS = [
  { value: "new", label: "New Lead", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "contacted", label: "Contacted", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "interested", label: "Interested", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "ordered", label: "Ordered", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "follow_up", label: "Follow-up", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "converted", label: "Converted", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

const SOURCE_LABELS: Record<string, string> = {
  kdf_nuts: "KDF Nuts",
  kdf_plus: "KDF Plus",
};

interface Lead {
  id: number;
  sessionId: string | null;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  source: string;
  status: string;
  visitSource: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadsResponse {
  leads: Lead[];
  total: number;
}

export default function ChatLeadsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
  if (search) params.set("q", search);
  if (statusFilter) params.set("status", statusFilter);
  if (cityFilter) params.set("city", cityFilter);
  if (sourceFilter) params.set("source", sourceFilter);

  const { data, isLoading, refetch } = useQuery<LeadsResponse>({
    queryKey: ["chat-leads", search, statusFilter, cityFilter, sourceFilter, page],
    queryFn: () => authFetch(`/api/admin/chat/leads?${params}`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`/api/admin/chat/leads/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat-leads"] }),
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`/api/admin/chat/leads/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chat-leads"] }); toast({ title: "Lead deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const handleExport = async () => {
    const res = await authFetch(`/api/admin/chat/leads/export`);
    if (!res.ok) return toast({ title: "Export failed", variant: "destructive" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-leads-${new Date().toLocaleDateString("en-PK").replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = (s: string) => STATUS_OPTIONS.find(o => o.value === s)?.color ?? "bg-gray-100 text-gray-600";
  const statusLabel = (s: string) => STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;

  const stats = {
    total: total,
    new: leads.filter(l => l.status === "new").length,
    converted: leads.filter(l => l.status === "converted").length,
    ordered: leads.filter(l => l.status === "ordered").length,
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-[#5FA800]" /> Chat Leads CRM
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Leads captured from live chat pre-form — KDF Nuts & KDF Plus</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button onClick={handleExport} variant="outline" size="sm" className="gap-1.5">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Leads", value: total, icon: Users, color: "text-blue-600 bg-blue-50" },
            { label: "New Today", value: stats.new, icon: UserPlus, color: "text-[#5FA800] bg-green-50" },
            { label: "Ordered", value: stats.ordered, icon: ShoppingBag, color: "text-purple-600 bg-purple-50" },
            { label: "Converted", value: stats.converted, icon: UserCheck, color: "text-emerald-600 bg-emerald-50" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search name, phone, email…"
              className="w-full border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5FA800]/20 bg-background"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(0); }}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
          >
            <option value="">All Sources</option>
            <option value="kdf_nuts">KDF Nuts</option>
            <option value="kdf_plus">KDF Plus</option>
          </select>
          <input
            value={cityFilter}
            onChange={e => { setCityFilter(e.target.value); setPage(0); }}
            placeholder="Filter by city…"
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5FA800]/20 bg-background w-36"
          />
          {(search || statusFilter || cityFilter || sourceFilter) && (
            <button onClick={() => { setSearch(""); setStatusFilter(""); setCityFilter(""); setSourceFilter(""); setPage(0); }}
              className="text-xs text-muted-foreground hover:text-foreground underline flex-shrink-0">
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {["Lead", "Contact", "City", "Source", "Status", "Date", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Loading leads…</td></tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-muted-foreground text-sm">No leads found</p>
                      <p className="text-muted-foreground text-xs mt-1">Leads appear when customers fill the pre-chat form</p>
                    </td>
                  </tr>
                ) : leads.map(lead => (
                  <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                    {/* Lead name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#5FA800]/10 flex items-center justify-center text-[#5FA800] font-bold text-sm flex-shrink-0">
                          {lead.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{lead.name}</p>
                          {lead.email && <p className="text-xs text-muted-foreground truncate max-w-36">{lead.email}</p>}
                        </div>
                      </div>
                    </td>
                    {/* Contact */}
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <a
                          href={`tel:${lead.phone}`}
                          className="flex items-center gap-1 text-sm font-mono hover:text-[#5FA800] transition-colors"
                        >
                          <Phone className="w-3 h-3" />{lead.phone}
                        </a>
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Mail className="w-3 h-3" />{lead.email}
                          </a>
                        )}
                      </div>
                    </td>
                    {/* City */}
                    <td className="px-4 py-3">
                      {lead.city ? (
                        <span className="flex items-center gap-1 text-sm"><MapPin className="w-3 h-3 text-muted-foreground" />{lead.city}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    {/* Source */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${lead.source === "kdf_plus" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                      </span>
                    </td>
                    {/* Status dropdown */}
                    <td className="px-4 py-3">
                      <select
                        value={lead.status}
                        onChange={e => statusMut.mutate({ id: lead.id, status: e.target.value })}
                        className={`text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none ${statusColor(lead.status)}`}
                      >
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    {/* Date */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />{timeAgo(lead.createdAt)}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${lead.name}! We noticed you visited KDF Nuts. How can we help you today?`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 flex items-center justify-center transition-colors"
                          title="WhatsApp"
                        >
                          <svg viewBox="0 0 24 24" fill="#25D366" width={14} height={14}>
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                        </a>
                        {lead.sessionId && (
                          <a
                            href="/chat-conversations"
                            className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors"
                            title="View Chat"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                          </a>
                        )}
                        <button
                          onClick={() => { if (confirm("Delete this lead?")) deleteMut.mutate(lead.id); }}
                          className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors text-muted-foreground hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>Next</Button>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
