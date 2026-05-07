import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Settings, Globe, MessageCircle,
  Send, RefreshCw, Loader2, CheckCircle2, XCircle,
  BarChart2, Copy, ExternalLink,
  Zap, Bot, Shield, Link2, LogOut, AlertTriangle, ChevronDown, ChevronUp,
  Inbox, Users, Phone, Tag, Clock, CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

type Tab = "connect" | "settings" | "logs" | "stats" | "webhook" | "test" | "inbox" | "leads" | "debug";

const AI_MODELS = [
  { value: "gpt-4o-mini",   label: "GPT-4o Mini (Fast, Recommended)" },
  { value: "gpt-4o",        label: "GPT-4o (Most Capable)" },
  { value: "gpt-4-turbo",   label: "GPT-4 Turbo (Powerful)" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Fastest, Cheapest)" },
];

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  instagram: <span className="text-pink-500 text-lg">📸</span>,
  facebook:  <span className="text-blue-600 text-lg">📘</span>,
};

const TYPE_LABELS: Record<string, string> = {
  dm:        "DM Reply",
  comment:   "Comment Reply",
  follow_up: "Follow-up DM",
};

/* ─── Webhook Debug Tab ────────────────────────────── */
function WebhookDebugTab() {
  const { toast } = useToast();
  const [payloads, setPayloads] = useState<any[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedRaw, setExpandedRaw] = useState<number | null>(null);
  const [simPlatform, setSimPlatform] = useState<"instagram" | "facebook">("instagram");
  const [simType, setSimType] = useState<"dm" | "comment">("dm");
  const [simText, setSimText] = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  const fetchPayloads = React.useCallback(async () => {
    try {
      const d = await apiFetch("/api/admin/social/webhook-logs");
      setPayloads(d);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchPayloads(); }, [fetchPayloads]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchPayloads, 3000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchPayloads]);

  async function simulate() {
    setSimLoading(true); setSimResult(null);
    try {
      const d = await apiFetch("/api/admin/social/simulate-webhook", {
        method: "POST",
        body: JSON.stringify({ platform: simPlatform, type: simType, text: simText || undefined }),
      });
      setSimResult(d);
      if (d.success) toast({ title: "Simulation sent", description: "Check Activity Logs for result" });
      fetchPayloads();
    } catch (e: any) {
      setSimResult({ success: false, error: e.message });
    } finally { setSimLoading(false); }
  }

  const OkBadge = ({ ok }: { ok: boolean }) => (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${ok ? "bg-green-500" : "bg-red-500"}`} />
  );

  const IdChip = ({ label, value }: { label: string; value: string | null }) => (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-mono ${value ? "bg-green-50 border-green-300 text-green-800" : "bg-red-50 border-red-300 text-red-700"}`}>
      <span className="font-sans font-semibold">{label}:</span>
      {value ? value.slice(0, 20) + (value.length > 20 ? "…" : "") : "null ❌"}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* Header + controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Webhook Live Debug
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every payload Meta sends is captured here with full ID breakdown. Auto-refreshes every 3s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{autoRefresh ? "🟢 Live" : "⏸ Paused"}</span>
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${autoRefresh ? "border-green-300 bg-green-50 text-green-700" : "border-border bg-card text-muted-foreground"}`}
          >
            {autoRefresh ? "Pause" : "Resume"}
          </button>
          <Button size="sm" variant="outline" onClick={fetchPayloads} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPayloads([])} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            Clear
          </Button>
        </div>
      </div>

      {/* Simulate panel */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-amber-50/50 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-sm">Simulate Webhook Event</h3>
          <span className="text-xs text-muted-foreground ml-1">Injects a fake event through the real AI processor — no real Meta DM needed</span>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="space-y-1">
              <p className="text-xs font-medium">Platform</p>
              <div className="flex gap-1">
                {(["instagram", "facebook"] as const).map(p => (
                  <button key={p} onClick={() => setSimPlatform(p)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${simPlatform === p ? "border-pink-400 bg-pink-50 text-pink-700" : "border-border bg-card text-muted-foreground"}`}>
                    {p === "instagram" ? "📸 Instagram" : "📘 Facebook"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Type</p>
              <div className="flex gap-1">
                {(["dm", "comment"] as const).map(t => (
                  <button key={t} onClick={() => setSimType(t)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${simType === t ? "border-purple-400 bg-purple-50 text-purple-700" : "border-border bg-card text-muted-foreground"}`}>
                    {t === "dm" ? "💬 DM" : "💭 Comment"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-48 space-y-1">
              <p className="text-xs font-medium">Message (optional)</p>
              <Input value={simText} onChange={e => setSimText(e.target.value)} placeholder={simType === "dm" ? "badam ka price kya hai?" : "ye kahan se milega?"} className="text-xs h-8" />
            </div>
            <div className="flex items-end">
              <Button size="sm" onClick={simulate} disabled={simLoading} className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white h-8">
                {simLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Simulate
              </Button>
            </div>
          </div>
          {simResult && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${simResult.success ? "bg-green-50 border-green-200 text-green-800" : simResult.skipped ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700"}`}>
              {simResult.success ? `✓ ${simResult.message}` : simResult.skipped ? `⚠ Skipped: ${simResult.reason}` : `✗ ${simResult.error}`}
            </div>
          )}
        </div>
      </div>

      {/* Payload list */}
      {payloads.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <Zap className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">No webhook payloads received yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Use "Simulate" above or send a real DM/comment from Meta. Payloads appear within 3 seconds.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payloads.map((p: any, i: number) => {
            const allOk = p.breakdown.every((e: any) =>
              (e.messaging.length === 0 || e.messaging.some((m: any) => m.ok)) &&
              (e.changes.length === 0   || e.changes.some((c: any) => c.ok))
            );
            return (
              <div key={i} className={`rounded-xl border overflow-hidden ${allOk ? "border-green-200" : "border-red-200"}`}>
                {/* Header row */}
                <div className={`flex items-center gap-3 px-4 py-2.5 ${allOk ? "bg-green-50" : "bg-red-50"}`}>
                  <OkBadge ok={allOk} />
                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${p.platform?.startsWith("ig") || p.object === "instagram" ? "bg-pink-100 text-pink-800" : p.platform?.startsWith("simulate") ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                    {p.platform}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">object: <strong>{p.object ?? "?"}</strong></span>
                  <span className="text-xs text-muted-foreground">entries: {p.entryCount}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(p.ts).toLocaleTimeString("en-PK")}</span>
                  <button onClick={() => setExpandedRaw(expandedRaw === i ? null : i)} className="text-xs text-muted-foreground underline">
                    {expandedRaw === i ? "Hide JSON" : "Raw JSON"}
                  </button>
                </div>

                {/* Entry breakdown */}
                <div className="px-4 py-3 space-y-3 bg-card">
                  {p.breakdown.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No entries in this payload</p>
                  )}
                  {p.breakdown.map((entry: any, ei: number) => (
                    <div key={ei} className="space-y-2">
                      <p className="text-[10px] font-mono text-muted-foreground">entry[{ei}] id: {entry.entryId ?? "?"}</p>

                      {/* messaging events */}
                      {entry.messaging.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-foreground">messaging[] — {entry.messaging.length} event(s)</p>
                          {entry.messaging.map((m: any, mi: number) => (
                            <div key={mi} className={`rounded-lg border px-3 py-2 space-y-1.5 ${m.ok ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}`}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <OkBadge ok={m.ok} />
                                <IdChip label="senderId" value={m.senderId} />
                                <IdChip label="recipientId" value={m.recipientId} />
                                {m.isEcho && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">is_echo — SKIPPED</span>}
                              </div>
                              {m.text && <p className="text-xs text-muted-foreground pl-4">"{m.text}"</p>}
                              {!m.ok && !m.isEcho && (
                                <p className="text-[10px] text-red-700 pl-4">
                                  {!m.senderId ? "❌ senderId is null" : !m.text ? "❌ message.text is null/missing" : "❌ unknown issue"}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* changes events */}
                      {entry.changes.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-foreground">changes[] — {entry.changes.length} event(s)</p>
                          {entry.changes.map((c: any, ci: number) => (
                            <div key={ci} className={`rounded-lg border px-3 py-2 space-y-1.5 ${c.ok ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}`}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <OkBadge ok={c.ok} />
                                <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border">field: {c.field}</span>
                                {c.item && <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border font-mono">item: {c.item}</span>}
                                <IdChip label="commentId" value={c.commentId} />
                                <IdChip label="senderId" value={c.senderId} />
                              </div>
                              {c.text && <p className="text-xs text-muted-foreground pl-4">"{c.text}"</p>}
                              {c.valueKeys?.length > 0 && (
                                <p className="text-[10px] text-muted-foreground pl-4">keys: {c.valueKeys.join(", ")}</p>
                              )}
                              {!c.ok && (
                                <p className="text-[10px] text-red-700 pl-4">
                                  {c.field === "feed" && c.item !== "comment" ? `❌ item is "${c.item}" not "comment"` :
                                   !c.commentId ? "❌ commentId is null" :
                                   !c.text ? "❌ text/message is null" : "❌ unknown issue"}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {entry.messaging.length === 0 && entry.changes.length === 0 && (
                        <p className="text-xs text-amber-700 pl-2">⚠ Entry has no messaging[] or changes[] — empty event</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Raw JSON */}
                {expandedRaw === i && (
                  <div className="border-t border-border bg-slate-950 px-4 py-3 overflow-x-auto">
                    <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(payloads[i], null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Diagnostics panel (webhook tab) ─────────────── */
function DiagnosticsPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const d = await apiFetch("/api/admin/social/diagnostics");
      setData(d);
    } catch (e: any) {
      toast({ title: "Diagnostics failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  const Check = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      <span className={`text-xs ${ok ? "text-green-800" : "text-red-700"}`}>{label}</span>
    </div>
  );

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-lg px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-blue-800">Connection Diagnostics</p>
          <p className="text-xs text-blue-600 mt-0.5">Verifies FB Page, IG account, and webhook subscriptions live from Meta</p>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={loading} className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Run Diagnostics
        </Button>
      </div>

      {data && (
        <div className="space-y-2">
          {!data.connected ? (
            <p className="text-xs text-red-700 font-medium">{data.error}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <Check ok={data.checks.fbPageConnected}  label={`Facebook Page: ${data.checks.fbPageName}`} />
                <Check ok={data.checks.igConnected}      label={data.checks.igConnected ? `Instagram: @${data.checks.igUsername}` : "Instagram not connected"} />
                <Check ok={data.checks.subscribedToMsgs} label="Subscribed to messages" />
                <Check ok={data.checks.subscribedToFeed} label="Subscribed to feed (FB comments)" />
              </div>
              {data.checks.subscribedFields?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {data.checks.subscribedFields.map((f: string) => (
                    <span key={f} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">{f}</span>
                  ))}
                </div>
              )}
              {!data.checks.subscribedToFeed || !data.checks.subscribedToMsgs ? (
                <p className="text-xs text-amber-700 font-medium mt-1">→ Click "Subscribe Now" above to fix missing subscriptions</p>
              ) : (
                <p className="text-xs text-green-700 font-medium mt-1">✓ All critical subscriptions active</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SocialAIPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("connect");
  const [showManual, setShowManual] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const popupRef = useRef<Window | null>(null);

  /* ─── Inbox state ─────────────────────────── */
  const [selectedConvo, setSelectedConvo] = useState<{ platform: string; senderId: string; name: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  /* ─── Leads state ─────────────────────────── */
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  const [leadPhoneEdit, setLeadPhoneEdit] = useState("");
  const [leadNotesEdit, setLeadNotesEdit] = useState("");

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "connect",  label: "Connect",       icon: Link2 },
    { id: "inbox",    label: "Inbox",         icon: Inbox },
    { id: "leads",    label: "Leads",         icon: Users },
    { id: "settings", label: "AI Settings",   icon: Settings },
    { id: "webhook",  label: "Webhook Setup", icon: Globe },
    { id: "stats",    label: "Stats",         icon: BarChart2 },
    { id: "logs",     label: "Activity Logs", icon: MessageCircle },
    { id: "test",     label: "Test Reply",    icon: Send },
    { id: "debug",    label: "Debug",         icon: Zap },
  ];

  /* ─── Settings fetch/save ─────────────────── */
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/admin/social/settings"],
    queryFn:  () => apiFetch("/api/admin/social/settings").catch(() => null),
  });

  const [form, setForm] = useState({
    isEnabled:           false,
    igEnabled:           true,
    fbEnabled:           true,
    pageAccessToken:     "",
    igBusinessAccountId: "",
    fbPageId:            "",
    webhookVerifyToken:  "kdfnuts_social_token",
    aiModel:             "gpt-4o-mini",
    systemPrompt:        "You are an AI Customer Support & Sales Assistant for KDF NUTS, a premium nuts and dry fruits brand in Pakistan. Reply like a friendly, knowledgeable human — never robotic. Keep replies short and clear. Use the customer's name if available. Mix English and Urdu naturally (Roman Urdu is fine). Always try to convert the conversation into a sale. For product queries give name, price and benefits. For order intent, ask for name, address, phone. For comments, reply briefly and push them to DM. Never argue, never spam links.",
    commentReplyEnabled: true,
    dmReplyEnabled:      true,
    autoFollowUpDm:      true,
    replyDelaySec:       10,
    maxDailyReplies:     200,
  });

  useEffect(() => {
    if (settings) setForm({
      isEnabled:           settings.isEnabled ?? false,
      igEnabled:           settings.igEnabled ?? true,
      fbEnabled:           settings.fbEnabled ?? true,
      pageAccessToken:     settings.pageAccessToken ?? "",
      igBusinessAccountId: settings.igBusinessAccountId ?? "",
      fbPageId:            settings.fbPageId ?? "",
      webhookVerifyToken:  settings.webhookVerifyToken ?? "kdfnuts_social_token",
      aiModel:             settings.aiModel ?? "gpt-4o-mini",
      systemPrompt:        settings.systemPrompt ?? "",
      commentReplyEnabled: settings.commentReplyEnabled ?? true,
      dmReplyEnabled:      settings.dmReplyEnabled ?? true,
      autoFollowUpDm:      settings.autoFollowUpDm ?? true,
      replyDelaySec:       settings.replyDelaySec ?? 10,
      maxDailyReplies:     settings.maxDailyReplies ?? 200,
    });
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () => apiFetch("/api/admin/social/settings", { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/social/settings"] }); toast({ title: "Settings saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  /* ─── Inbox / Conversations ────────────────── */
  const { data: conversations = [], refetch: refetchConvos } = useQuery<any[]>({
    queryKey: ["/api/admin/social/conversations"],
    queryFn: () => apiFetch("/api/admin/social/conversations").catch(() => []),
    enabled: tab === "inbox",
    refetchInterval: tab === "inbox" ? 20000 : false,
  });

  const { data: thread = [], refetch: refetchThread } = useQuery<any[]>({
    queryKey: ["/api/admin/social/conversations", selectedConvo?.platform, selectedConvo?.senderId],
    queryFn: () => selectedConvo
      ? apiFetch(`/api/admin/social/conversations/${selectedConvo.platform}/${selectedConvo.senderId}`).catch(() => [])
      : Promise.resolve([]),
    enabled: !!selectedConvo && tab === "inbox",
    refetchInterval: selectedConvo && tab === "inbox" ? 10000 : false,
  });

  React.useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const sendReply = async () => {
    if (!selectedConvo || !replyText.trim()) return;
    setIsSendingReply(true);
    try {
      await apiFetch("/api/admin/social/reply", {
        method: "POST",
        body: JSON.stringify({ senderId: selectedConvo.senderId, platform: selectedConvo.platform, message: replyText.trim() }),
      });
      setReplyText("");
      refetchThread();
      refetchConvos();
      toast({ title: "Reply sent!" });
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" });
    } finally { setIsSendingReply(false); }
  };

  /* ─── Leads ─────────────────────────────────── */
  const { data: leads = [], refetch: refetchLeads } = useQuery<any[]>({
    queryKey: ["/api/admin/social/leads"],
    queryFn: () => apiFetch("/api/admin/social/leads").catch(() => []),
    enabled: tab === "leads",
  });

  const updateLead = async (id: number, data: object) => {
    try {
      await apiFetch(`/api/admin/social/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      refetchLeads();
      toast({ title: "Lead updated" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  /* ─── OAuth popup flow ──────────────────────── */
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { url } = await apiFetch("/api/admin/social/oauth/url");
      const popup = window.open(url, "fb_oauth_connect", "width=650,height=700,scrollbars=yes,resizable=yes");
      if (!popup) {
        toast({ title: "Popup blocked", description: "Please allow popups for this page and try again.", variant: "destructive" });
        setIsConnecting(false);
        return;
      }
      popupRef.current = popup;

      const onMessage = (e: MessageEvent) => {
        if (!e.data || typeof e.data !== "object") return;
        const { success, pageName, igUsername, error } = e.data;
        window.removeEventListener("message", onMessage);
        popupRef.current = null;
        setIsConnecting(false);
        if (success) {
          qc.invalidateQueries({ queryKey: ["/api/admin/social/settings"] });
          toast({
            title: "✅ Connected!",
            description: `Facebook Page "${pageName}"${igUsername ? ` & Instagram @${igUsername}` : ""} linked successfully.`,
          });
        } else {
          toast({ title: "Connection failed", description: error ?? "Unknown error", variant: "destructive" });
        }
      };

      window.addEventListener("message", onMessage);

      /* Detect popup closed without postMessage */
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          window.removeEventListener("message", onMessage);
          setIsConnecting(false);
        }
      }, 800);
    } catch (e: any) {
      toast({ title: "Could not start OAuth", description: e.message, variant: "destructive" });
      setIsConnecting(false);
    }
  };

  /* ─── Disconnect ────────────────────────────── */
  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect Facebook & Instagram? The AI will stop replying until you reconnect.")) return;
    setIsDisconnecting(true);
    try {
      await apiFetch("/api/admin/social/disconnect", { method: "POST" });
      qc.invalidateQueries({ queryKey: ["/api/admin/social/settings"] });
      toast({ title: "Disconnected" });
    } catch (e: any) {
      toast({ title: "Disconnect failed", description: e.message, variant: "destructive" });
    } finally {
      setIsDisconnecting(false);
    }
  };

  /* ─── Manual webhook subscribe ──────────────── */
  const handleWebhookSubscribe = async () => {
    setIsSubscribing(true);
    try {
      await apiFetch("/api/admin/social/webhook-subscribe", { method: "POST" });
      toast({ title: "✅ Webhook subscribed", description: "Page is now subscribed to messages, comments, and feed events." });
    } catch (e: any) {
      toast({ title: "Subscribe failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSubscribing(false);
    }
  };

  /* ─── Webhook / OAuth info (always fetched so Connect tab can show callback URL) ─── */
  const { data: webhookInfo } = useQuery({
    queryKey: ["/api/admin/social/webhook-info"],
    queryFn:  () => apiFetch("/api/admin/social/webhook-info").catch(() => null),
  });

  /* ─── Stats ────────────────────────────────── */
  const { data: stats } = useQuery({
    queryKey: ["/api/admin/social/stats"],
    queryFn:  () => apiFetch("/api/admin/social/stats").catch(() => null),
    enabled: tab === "stats",
    refetchInterval: tab === "stats" ? 30000 : false,
  });

  /* ─── Logs ─────────────────────────────────── */
  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/social/logs"],
    queryFn:  () => apiFetch("/api/admin/social/logs").catch(() => []),
    enabled: tab === "logs",
  });

  /* ─── Test reply ───────────────────────────── */
  const [testPlatform, setTestPlatform]     = useState<"instagram" | "facebook">("instagram");
  const [testType, setTestType]             = useState<"dm" | "comment">("dm");
  const [testMessage, setTestMessage]       = useState("Do you deliver to Lahore? Main nuts order karna chahta hun");
  const [testSenderName, setTestSenderName] = useState("Ahmed");
  const [testResult, setTestResult]         = useState<{ success: boolean; reply?: string; error?: string } | null>(null);
  const [isTesting, setIsTesting]           = useState(false);

  const handleTest = async () => {
    if (!testMessage.trim()) return;
    setIsTesting(true); setTestResult(null);
    try {
      const data = await apiFetch("/api/admin/social/test-reply", {
        method: "POST",
        body: JSON.stringify({ platform: testPlatform, type: testType, message: testMessage, senderName: testSenderName }),
      });
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setIsTesting(false);
    }
  };

  /* ─── Derived connection state ─────────────── */
  const isConnected   = !!(settings?.pageAccessToken && settings?.fbPageId);
  const connMethod    = settings?.connectionMethod as string | undefined;
  const fbPageName    = settings?.fbPageName as string | undefined;
  const igUsername    = settings?.igUsername as string | undefined;
  const connectedAt   = settings?.connectedAt ? new Date(settings.connectedAt as string) : null;
  const tokenExpires  = settings?.tokenExpiresAt ? new Date(settings.tokenExpiresAt as string) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-pink-500" />
          Social AI Auto-Reply
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered auto-reply for Instagram & Facebook DMs and comments — turns every interaction into a sale.
        </p>
      </div>

      {/* Status hero */}
      <div className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm">
        <div
          className="flex items-center gap-4 px-6 py-5"
          style={{ background: "linear-gradient(135deg, #405DE6 0%, #C13584 50%, #E1306C 100%)" }}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg">Instagram & Facebook AI Engine</h2>
            <p className="text-white/70 text-sm mt-0.5">
              {isConnected
                ? `Connected${fbPageName ? ` — ${fbPageName}` : ""}${igUsername ? ` · @${igUsername}` : ""}`
                : "Not connected — click Connect to get started"}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isConnected ? (
              <span className="flex items-center gap-1.5 bg-green-400/20 text-green-200 border border-green-400/30 px-3 py-1.5 rounded-full text-sm font-semibold">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                {form.isEnabled ? "Active" : "Connected"}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-red-400/20 text-red-200 border border-red-400/30 px-3 py-1.5 rounded-full text-sm font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Not Connected
              </span>
            )}
          </div>
        </div>

        {/* Platform badges */}
        <div className="px-6 py-3 bg-muted/20 border-b border-border flex items-center gap-4 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${isConnected && form.igEnabled && settings?.igBusinessAccountId ? "bg-pink-50 border-pink-200 text-pink-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
            📸 Instagram {isConnected && settings?.igBusinessAccountId ? (igUsername ? `@${igUsername}` : "Connected") : "Not linked"}
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${isConnected && form.fbEnabled ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
            📘 Facebook {isConnected ? (fbPageName || "Connected") : "Not linked"}
          </div>
          {isConnected && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs">AI Engine</span>
              <Switch
                checked={form.isEnabled}
                onCheckedChange={v => {
                  setForm(f => ({ ...f, isEnabled: v }));
                  apiFetch("/api/admin/social/settings", { method: "PUT", body: JSON.stringify({ ...form, isEnabled: v }) })
                    .then(() => qc.invalidateQueries({ queryKey: ["/api/admin/social/settings"] }))
                    .catch(() => {});
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === id ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          CONNECT TAB
          ══════════════════════════════════════════ */}
      {tab === "connect" && (
        <div className="space-y-5">

          {/* ── Step 0: Meta App Setup (always visible, collapsible after connected) ── */}
          <div className={`rounded-xl overflow-hidden border-2 ${isConnected ? "border-green-200 bg-green-50/50" : "border-amber-300 bg-amber-50"}`}>
            <div className="px-5 py-4 border-b border-inherit flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isConnected ? "bg-green-100" : "bg-amber-100"}`}>
                <span className="text-xl">{isConnected ? "✅" : "⚠️"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className={`font-semibold text-base ${isConnected ? "text-green-800" : "text-amber-900"}`}>
                  {isConnected ? "Step 0 Complete — Meta App Configured" : "Step 0 Required: Configure Your Meta App First"}
                </h2>
                <p className={`text-xs mt-0.5 ${isConnected ? "text-green-700" : "text-amber-800"}`}>
                  {isConnected
                    ? "Your OAuth callback URL is already whitelisted in Meta Developer Console."
                    : "You must whitelist the OAuth Callback URL in Meta Developer Console before clicking Connect — otherwise you'll see a 'URL Blocked' error."}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* The callback URL */}
              <div className="space-y-2">
                <p className={`text-xs font-bold uppercase tracking-wide ${isConnected ? "text-green-700" : "text-amber-800"}`}>
                  Your OAuth Callback URL (copy this ↓)
                </p>
                {webhookInfo?.oauthCallbackUrl ? (
                  <div className="flex items-center gap-2">
                    <code className={`flex-1 text-xs font-mono rounded-lg px-3 py-2.5 border truncate ${isConnected ? "bg-green-100 border-green-200 text-green-900" : "bg-white border-amber-300 text-amber-900"}`}>
                      {webhookInfo.oauthCallbackUrl}
                    </code>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { navigator.clipboard.writeText(webhookInfo.oauthCallbackUrl); toast({ title: "Callback URL copied!" }); }}
                      className={`shrink-0 gap-1.5 ${isConnected ? "border-green-300 text-green-700 hover:bg-green-100" : "border-amber-400 text-amber-800 hover:bg-amber-100"}`}
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 bg-white rounded-lg px-3 py-2 border border-amber-200">Loading URL…</p>
                )}
              </div>

              {/* Instructions */}
              {!isConnected && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">How to add it in Meta Developer Console:</p>
                  <div className="space-y-2">
                    {[
                      { step: "1", text: <>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline font-medium">developers.facebook.com/apps</a> → open your app</> },
                      { step: "2", text: <>In the left sidebar, click <strong>Facebook Login</strong> → <strong>Settings</strong></> },
                      { step: "3", text: <>Under <strong>"Valid OAuth Redirect URIs"</strong>, paste the URL above and click <strong>Save Changes</strong></> },
                      { step: "4", text: <>Make sure <strong>Client OAuth Login</strong> = ON and <strong>Web OAuth Login</strong> = ON</> },
                      { step: "5", text: <>Come back here and click <strong>Login with Facebook</strong> ✅</> },
                    ].map(({ step, text }) => (
                      <div key={step} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</div>
                        <p className="text-xs text-amber-800 leading-relaxed">{text}</p>
                      </div>
                    ))}
                  </div>

                  <a
                    href="https://developers.facebook.com/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open Meta Developer Console
                  </a>
                </div>
              )}

              {/* Production note */}
              <div className={`rounded-lg px-3 py-2 text-xs border ${isConnected ? "bg-green-100 border-green-200 text-green-800" : "bg-white border-amber-200 text-amber-700"}`}>
                <strong>Production note:</strong> When you deploy the app, add your <code>.replit.app</code> callback URL to the same list (both dev and production URLs can coexist). You can also set the <code>META_REDIRECT_URI</code> environment variable to fix the URL permanently.
              </div>
            </div>
          </div>

          {/* Connection card */}
          {isConnected ? (
            /* ── Already connected ── */
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">Connection Active</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Your Facebook Page and Instagram account are linked</p>
                </div>
                {connMethod && (
                  <Badge variant="outline" className="ml-auto text-xs capitalize">
                    {connMethod === "oauth" ? "🔐 OAuth" : "🔧 Manual"}
                  </Badge>
                )}
              </div>
              <div className="px-5 py-5 space-y-4">
                {/* API upgrade notice — prompt re-subscribe */}
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-900">Action required — click "Re-subscribe Webhooks" below</p>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      The Meta API was upgraded from v18.0 → v22.0 (v18.0 was deprecated Sep 2025). This fixes DM and comment replies.
                      You must also click <strong>Re-subscribe Webhooks</strong> to re-register your Instagram + Facebook event subscriptions.
                    </p>
                  </div>
                </div>

                {/* Connected accounts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <span className="text-2xl">📘</span>
                    <div className="min-w-0">
                      <p className="text-xs text-blue-600 font-medium">Facebook Page</p>
                      <p className="text-sm font-bold text-blue-900 truncate">{fbPageName || settings?.fbPageId || "—"}</p>
                      {settings?.fbPageId && <p className="text-[10px] text-blue-500 font-mono truncate">ID: {settings.fbPageId}</p>}
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 ml-auto" />
                  </div>
                  <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${settings?.igBusinessAccountId ? "bg-pink-50 border-pink-100" : "bg-gray-50 border-gray-100"}`}>
                    <span className="text-2xl">📸</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${settings?.igBusinessAccountId ? "text-pink-600" : "text-gray-500"}`}>Instagram Account</p>
                      {settings?.igBusinessAccountId ? (
                        <>
                          <p className="text-sm font-bold text-pink-900 truncate">{igUsername ? `@${igUsername}` : "Connected"}</p>
                          <p className="text-[10px] text-pink-500 font-mono truncate">ID: {settings.igBusinessAccountId}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">Not linked</p>
                      )}
                    </div>
                    {settings?.igBusinessAccountId
                      ? <CheckCircle2 className="w-4 h-4 text-pink-500 shrink-0 ml-auto" />
                      : <AlertTriangle className="w-4 h-4 text-gray-400 shrink-0 ml-auto" />}
                  </div>
                </div>

                {/* Token expiry */}
                {tokenExpires && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${tokenExpires > new Date() ? "bg-green-50 border border-green-100 text-green-700" : "bg-red-50 border border-red-100 text-red-700"}`}>
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    {tokenExpires > new Date()
                      ? `Access token valid until ${tokenExpires.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}`
                      : `⚠️ Access token expired on ${tokenExpires.toLocaleDateString("en-PK")} — please reconnect`}
                  </div>
                )}

                {connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Connected on {connectedAt.toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 pt-1">
                  <Button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    variant="outline"
                    className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    {isConnecting ? <><Loader2 className="w-4 h-4 animate-spin" />Connecting…</> : <><RefreshCw className="w-4 h-4" />Reconnect with Facebook</>}
                  </Button>
                  <Button
                    onClick={handleWebhookSubscribe}
                    disabled={isSubscribing}
                    variant="outline"
                    className="gap-2"
                  >
                    {isSubscribing ? <><Loader2 className="w-4 h-4 animate-spin" />Subscribing…</> : <><Zap className="w-4 h-4" />Re-subscribe Webhooks</>}
                  </Button>
                  <Button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    variant="outline"
                    className="gap-2 border-red-300 text-red-600 hover:bg-red-50 ml-auto"
                  >
                    {isDisconnecting ? <><Loader2 className="w-4 h-4 animate-spin" />Disconnecting…</> : <><LogOut className="w-4 h-4" />Disconnect</>}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Not connected ── */
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">Connect Facebook & Instagram</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">One click — no manual tokens needed</p>
                </div>
              </div>
              <div className="px-5 py-6 space-y-5">
                {/* How it works steps */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {[
                    { step: "1", icon: "🖱️", title: "Click Connect",    desc: "Opens a secure Facebook login popup" },
                    { step: "2", icon: "🔐", title: "Login to Facebook", desc: "Use your Facebook account credentials" },
                    { step: "3", icon: "📄", title: "Select your Page",  desc: "Choose your Facebook Business Page" },
                    { step: "4", icon: "✅", title: "Done!",             desc: "AI starts replying automatically" },
                  ].map(s => (
                    <div key={s.step} className="flex flex-col items-center text-center gap-2 p-3 bg-muted/30 rounded-xl border border-border">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{s.step}</div>
                      <div className="text-xl">{s.icon}</div>
                      <p className="text-xs font-semibold">{s.title}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Required permissions notice */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 space-y-2">
                  <p className="text-xs font-bold text-blue-800">Permissions requested during login:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement", "instagram_basic", "instagram_manage_messages", "instagram_manage_comments"].map(p => (
                      <code key={p} className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">{p}</code>
                    ))}
                  </div>
                </div>

                {/* Main CTA */}
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="w-full gap-3 text-base h-12"
                  style={{ background: "linear-gradient(135deg, #1877F2 0%, #0a5fd4 100%)" }}
                >
                  {isConnecting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Connecting… (check the popup)</>
                  ) : (
                    <><span className="text-xl">📘</span>Login with Facebook</>
                  )}
                </Button>

                <p className="text-[10px] text-muted-foreground text-center">
                  Uses Meta's official OAuth. We never store your Facebook login password — only a page access token.
                </p>
              </div>
            </div>
          )}

          {/* What happens after connect */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-base flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> What gets auto-configured</h2>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { icon: "📘", text: "Facebook Page linked → Messenger AI replies enabled" },
                { icon: "📸", text: "Instagram Business Account auto-detected + linked" },
                { icon: "💬", text: "DM auto-reply enabled for both platforms" },
                { icon: "💭", text: "Comment auto-reply enabled for both platforms" },
                { icon: "🔔", text: "Webhook auto-subscribed (messages, comments, feed)" },
                { icon: "🤖", text: "AI engine activated immediately" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-muted/30 rounded-lg px-3 py-2.5 border border-border">
                  <span className="text-base mt-0.5 shrink-0">{item.icon}</span>
                  <p className="text-muted-foreground leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Manual / Advanced fallback */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setShowManual(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-base text-muted-foreground">Manual Setup (Advanced)</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Enter token & IDs manually — for developers only</p>
                </div>
              </div>
              {showManual ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showManual && (
              <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                  <strong>Advanced only:</strong> Use this if OAuth login doesn't work for your account. Get your Page Access Token from{" "}
                  <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" className="underline">Meta Graph API Explorer</a>.
                </div>

                <div className="space-y-1.5">
                  <Label>Page Access Token</Label>
                  <Input
                    type="password"
                    value={form.pageAccessToken}
                    onChange={e => setForm(f => ({ ...f, pageAccessToken: e.target.value }))}
                    placeholder="EAABsbC…"
                    className="font-mono text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Instagram Business Account ID</Label>
                    <Input
                      value={form.igBusinessAccountId}
                      onChange={e => setForm(f => ({ ...f, igBusinessAccountId: e.target.value }))}
                      placeholder="17841400123456789"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Facebook Page ID</Label>
                    <Input
                      value={form.fbPageId}
                      onChange={e => setForm(f => ({ ...f, fbPageId: e.target.value }))}
                      placeholder="123456789012345"
                      className="font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Webhook Verify Token</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.webhookVerifyToken}
                      onChange={e => setForm(f => ({ ...f, webhookVerifyToken: e.target.value }))}
                      placeholder="kdfnuts_social_token"
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline" size="sm"
                      onClick={() => { navigator.clipboard.writeText(form.webhookVerifyToken); toast({ title: "Copied!" }); }}
                      className="shrink-0 gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={() => saveSettings.mutate()}
                  disabled={saveSettings.isPending}
                  variant="outline"
                  className="gap-1.5"
                >
                  {saveSettings.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Manual Credentials"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          AI SETTINGS TAB
          ══════════════════════════════════════════ */}
      {tab === "settings" && (
        <div className="space-y-5">

          {!isConnected && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-amber-800">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
              <div>
                <strong>Not connected</strong> — go to the <button onClick={() => setTab("connect")} className="underline font-medium">Connect tab</button> to link your Facebook & Instagram account first.
              </div>
            </div>
          )}

          {/* Platform toggles */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-base">Platform Settings</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Enable or disable AI replies per platform and type</p>
            </div>
            <div className="divide-y divide-border">
              {[
                { key: "igEnabled",           label: "Instagram",          emoji: "📸", desc: "Enable AI for Instagram DMs and post comments" },
                { key: "fbEnabled",           label: "Facebook",           emoji: "📘", desc: "Enable AI for Facebook Messenger and post comments" },
                { key: "dmReplyEnabled",      label: "DM Auto-Reply",      emoji: "💬", desc: "Automatically reply to direct messages" },
                { key: "commentReplyEnabled", label: "Comment Auto-Reply", emoji: "💭", desc: "Automatically reply to post comments" },
                { key: "autoFollowUpDm",      label: "Auto Follow-up DM",  emoji: "📤", desc: "After replying to a comment, also send a private follow-up DM" },
              ].map(({ key, label, emoji, desc }) => (
                <div key={key} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{emoji}</span>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={(form as any)[key] ?? false}
                    onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* AI Config */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-base">AI Configuration</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Control how the AI responds to social media messages</p>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>AI Model</Label>
                  <select
                    value={form.aiModel}
                    onChange={e => setForm(f => ({ ...f, aiModel: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                  >
                    {AI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Reply Delay (sec)</Label>
                    <Input
                      type="number" min={0} max={300}
                      value={form.replyDelaySec}
                      onChange={e => setForm(f => ({ ...f, replyDelaySec: Number(e.target.value) }))}
                    />
                    <p className="text-xs text-muted-foreground">0 = instant</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Daily Replies</Label>
                    <Input
                      type="number" min={1} max={5000}
                      value={form.maxDailyReplies}
                      onChange={e => setForm(f => ({ ...f, maxDailyReplies: Number(e.target.value) }))}
                    />
                    <p className="text-xs text-muted-foreground">Daily cap</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>AI System Prompt</Label>
                <Textarea
                  value={form.systemPrompt}
                  onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                  rows={6}
                  className="text-sm resize-y font-mono"
                  placeholder="You are an AI assistant for KDF NUTS…"
                />
                <p className="text-xs text-muted-foreground">
                  Sets the AI's personality and instructions. Platform context (Instagram/Facebook, DM/comment) is automatically appended.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => saveSettings.mutate()}
            disabled={saveSettings.isPending}
            style={{ backgroundColor: "#C13584" }}
            className="text-white gap-1.5"
          >
            {saveSettings.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save AI Settings"}
          </Button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          WEBHOOK TAB
          ══════════════════════════════════════════ */}
      {tab === "webhook" && (
        <div className="space-y-5">

          {/* Real events counter */}
          <div className={`rounded-xl border-2 px-5 py-4 flex items-center gap-4 ${(webhookInfo?.realEventCount ?? 0) > 0 ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl ${(webhookInfo?.realEventCount ?? 0) > 0 ? "bg-green-100" : "bg-amber-100"}`}>
              {(webhookInfo?.realEventCount ?? 0) > 0 ? "✅" : "⚠️"}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-base ${(webhookInfo?.realEventCount ?? 0) > 0 ? "text-green-800" : "text-amber-900"}`}>
                {(webhookInfo?.realEventCount ?? 0) > 0
                  ? `${webhookInfo?.realEventCount} real events received from Meta`
                  : "No real Meta events received yet"}
              </p>
              <p className={`text-xs mt-0.5 ${(webhookInfo?.realEventCount ?? 0) > 0 ? "text-green-700" : "text-amber-800"}`}>
                {(webhookInfo?.realEventCount ?? 0) > 0
                  ? "Real DMs and comments are being captured and processed by the AI ✓"
                  : "Follow the steps below to register your webhook URL in Meta Developer Dashboard"}
              </p>
            </div>
          </div>

          {/* STEP 1: Webhook URL */}
          <div className="bg-card border-2 border-blue-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-blue-600 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white text-blue-600 text-sm font-bold flex items-center justify-center shrink-0">1</div>
              <h2 className="font-bold text-white text-sm">Register Webhook URL in Meta Developer Dashboard</h2>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                This is the URL Meta will send all events to. Register it <strong>once</strong> — it handles Instagram DMs, IG comments, Facebook Messenger, and FB post comments.
              </p>

              {/* Primary unified URL */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Your Webhook URL (copy this)</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-medium">PRIMARY</span>
                </div>
                {webhookInfo?.metaWebhookUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-slate-950 text-green-400 rounded-lg px-4 py-3 truncate border border-slate-800">
                      {webhookInfo.metaWebhookUrl}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(webhookInfo.metaWebhookUrl!); toast({ title: "Webhook URL copied!" }); }} className="shrink-0 gap-1.5">
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">Loading URL…</div>
                )}
              </div>

              {/* Verify token */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Verify Token (copy this too)</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-slate-950 text-green-400 rounded-lg px-4 py-3 border border-slate-800">
                    {webhookInfo?.verifyToken ?? "kdfnuts_social_token"}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(webhookInfo?.verifyToken ?? "kdfnuts_social_token"); toast({ title: "Verify token copied!" }); }} className="shrink-0 gap-1.5">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </Button>
                </div>
              </div>

              {/* Steps */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-4 space-y-3">
                <p className="text-xs font-bold text-blue-900">Exact steps in Meta Developer Dashboard:</p>
                {[
                  { n:"1", text: <>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline font-medium text-blue-700">developers.facebook.com/apps</a> → open your app → <strong>Webhooks</strong> in the left sidebar</> },
                  { n:"2", text: <>Click <strong>"Add Callback URL"</strong>. Paste the Webhook URL above into <strong>"Callback URL"</strong> field</> },
                  { n:"3", text: <>Paste the Verify Token above into the <strong>"Verify token"</strong> field → click <strong>"Verify and Save"</strong></> },
                  { n:"4", text: <>Under <strong>Facebook Page</strong> object, click <strong>"Add Subscriptions"</strong> → tick: <code className="bg-blue-100 px-1 rounded">messages</code> <code className="bg-blue-100 px-1 rounded">messaging_postbacks</code> <code className="bg-blue-100 px-1 rounded">feed</code></> },
                  { n:"5", text: <>Under <strong>Instagram</strong> object, click <strong>"Add Subscriptions"</strong> → tick: <code className="bg-blue-100 px-1 rounded">messages</code> <code className="bg-blue-100 px-1 rounded">comments</code> <code className="bg-blue-100 px-1 rounded">mentions</code></> },
                ].map(({ n, text }) => (
                  <div key={n} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
                    <p className="text-xs text-blue-800 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors">
                <ExternalLink className="w-4 h-4" /> Open Meta Developer Console
              </a>
            </div>
          </div>

          {/* STEP 2: Subscribe webhooks */}
          <div className="bg-card border-2 border-green-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-green-600 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white text-green-600 text-sm font-bold flex items-center justify-center shrink-0">2</div>
              <h2 className="font-bold text-white text-sm">Subscribe Your Page & Instagram Account to Webhook Events</h2>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Click the button below — it calls Meta's API to subscribe your Facebook Page and Instagram account to receive webhook events. Do this after Step 1.
              </p>
              {isConnected ? (
                <div className="space-y-3">
                  <Button
                    onClick={handleWebhookSubscribe}
                    disabled={isSubscribing}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSubscribing ? <><Loader2 className="w-4 h-4 animate-spin" />Subscribing…</> : <><Zap className="w-4 h-4" />Subscribe to Webhook Events Now</>}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Subscribes: FB Page → messages, messaging_postbacks, feed, messaging_referrals &nbsp;|&nbsp; Instagram → messages, comments, mentions
                  </p>
                  <DiagnosticsPanel />
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                  ⚠️ Connect your Facebook & Instagram account first (Connect tab) before subscribing.
                </div>
              )}
            </div>
          </div>

          {/* STEP 3: App Live Mode */}
          <div className="bg-card border-2 border-purple-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-purple-600 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white text-purple-600 text-sm font-bold flex items-center justify-center shrink-0">3</div>
              <h2 className="font-bold text-white text-sm">Set App to Live Mode (Critical)</h2>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm font-bold text-red-800">⚠️ If your app is in Development mode, ONLY app admins and approved testers can send messages that reach the webhook.</p>
                <p className="text-xs text-red-700 mt-1">Real customers' messages will be silently blocked by Meta until you switch to Live mode.</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-4 space-y-3">
                <p className="text-xs font-bold text-purple-900">How to enable Live Mode:</p>
                {[
                  { n:"1", text: <>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline font-medium">developers.facebook.com/apps</a> → open your app</> },
                  { n:"2", text: <>At the top, find the <strong>Development / Live toggle</strong> — switch it to <strong>Live</strong></> },
                  { n:"3", text: <>If it asks for App Review, submit the required permissions: <code className="bg-purple-100 px-1 rounded text-[10px]">pages_messaging</code>, <code className="bg-purple-100 px-1 rounded text-[10px]">instagram_manage_messages</code>, <code className="bg-purple-100 px-1 rounded text-[10px]">instagram_manage_comments</code></> },
                  { n:"4", text: <>Alternatively, add real customer accounts as <strong>Testers</strong> in App Roles → Roles → Add Testers (quicker, no review needed)</> },
                ].map(({ n, text }) => (
                  <div key={n} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
                    <p className="text-xs text-purple-800 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* STEP 4: Test */}
          <div className="bg-card border-2 border-amber-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-amber-500 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white text-amber-600 text-sm font-bold flex items-center justify-center shrink-0">4</div>
              <h2 className="font-bold text-white text-sm">Test Real Connection</h2>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-muted-foreground">After completing Steps 1-3, send a real test message and verify it appears in Activity Logs:</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: "💬", title: "Test Instagram DM", desc: "From a DIFFERENT Instagram account, send a DM to @khandryfruitsofficial. It should appear in Activity Logs within seconds." },
                  { icon: "💭", title: "Test Instagram Comment", desc: "Comment on any post on your Instagram page from a different account. The AI will reply to the comment automatically." },
                  { icon: "📘", title: "Test Facebook Messenger", desc: "Send a message to Khan Dry Fruits Facebook Page from a different Facebook account." },
                ].map(t => (
                  <div key={t.title} className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
                    <div className="text-2xl">{t.icon}</div>
                    <p className="text-xs font-bold text-amber-900">{t.title}</p>
                    <p className="text-xs text-amber-800 leading-relaxed">{t.desc}</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <p className="text-xs font-bold text-slate-700">What to check after testing:</p>
                <div className="mt-2 space-y-1">
                  {[
                    "Activity Logs tab → status should be \"sent\" (not \"simulated\")",
                    "Inbox tab → sender should appear as a new conversation",
                    "The AI reply should appear on Instagram/Facebook within seconds",
                  ].map(c => (
                    <div key={c} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-700">{c}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTab("logs")} className="gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" /> Go to Activity Logs
              </Button>
            </div>
          </div>

          {/* Required permissions reference */}
          <div className="bg-card border border-border rounded-xl px-5 py-4 space-y-3">
            <p className="text-sm font-semibold">Required Meta App Permissions</p>
            <div className="flex flex-wrap gap-1.5">
              {["pages_messaging", "pages_manage_metadata", "pages_read_engagement", "instagram_basic", "instagram_manage_messages", "instagram_manage_comments"].map(p => (
                <code key={p} className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">{p}</code>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">These are requested during OAuth login. For Live mode, you must submit for App Review for the messaging and comments permissions.</p>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════
          STATS TAB
          ══════════════════════════════════════════ */}
      {tab === "stats" && (
        <div className="space-y-5">
          {!stats ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Replies Today",       value: stats.today_sent   ?? 0, color: "text-pink-600",   bg: "bg-pink-50"   },
                  { label: "Grand Total",          value: stats.grand_total  ?? 0, color: "text-purple-600", bg: "bg-purple-50" },
                  { label: "Instagram",            value: stats.total_ig     ?? 0, color: "text-orange-600", bg: "bg-orange-50" },
                  { label: "Facebook",             value: stats.total_fb     ?? 0, color: "text-blue-600",   bg: "bg-blue-50"   },
                  { label: "DM Replies",           value: stats.total_dm     ?? 0, color: "text-green-600",  bg: "bg-green-50"  },
                  { label: "Comment Replies",      value: stats.total_comment ?? 0, color: "text-amber-600", bg: "bg-amber-50"  },
                  { label: "Failed Today",         value: stats.today_failed ?? 0, color: "text-red-600",    bg: "bg-red-50"    },
                  { label: "Total Processed Today",value: stats.today_total  ?? 0, color: "text-teal-600",   bg: "bg-teal-50"   },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl border border-border p-4 ${s.bg}`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">Stats refresh every 30 seconds</p>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          LOGS TAB
          ══════════════════════════════════════════ */}
      {tab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Recent Activity (last 100)</h2>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (logs as any[]).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No activity logged yet.</p>
              <p className="text-xs mt-1">Logs appear when the AI processes DMs or comments.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(logs as any[]).map((log: any) => (
                <div key={log.id} className="bg-card border border-border rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg">{PLATFORM_ICONS[log.platform] ?? "📱"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold capitalize">{log.platform}</span>
                        <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[log.type] ?? log.type}</Badge>
                        {log.senderName && <span className="text-xs text-muted-foreground">from {log.senderName}</span>}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto ${
                          log.status === "sent"       ? "bg-green-100 text-green-700" :
                          log.status === "failed"     ? "bg-red-100 text-red-700" :
                          log.status === "simulated"  ? "bg-purple-100 text-purple-700" :
                          log.status === "skipped"    ? "bg-amber-100 text-amber-700" :
                                                        "bg-gray-100 text-gray-600"
                        }`}>{log.status === "simulated" ? "🧪 simulated" : log.status}</span>
                      </div>
                      {log.incomingText && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          <span className="font-medium">Incoming:</span> {log.incomingText.slice(0, 100)}
                        </p>
                      )}
                      {log.aiReply && (
                        <p className="text-xs text-foreground mt-0.5 truncate">
                          <span className="font-medium text-pink-600">AI Reply:</span> {log.aiReply.slice(0, 100)}
                        </p>
                      )}
                      {log.error && <p className="text-xs text-red-500 mt-0.5">{log.error}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(log.createdAt).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TEST REPLY TAB
          ══════════════════════════════════════════ */}
      {tab === "test" && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center">
                <Send className="w-5 h-5 text-pink-600" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Test AI Reply</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Preview what the AI would reply for any message on either platform</p>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Platform</Label>
                  <div className="flex gap-2">
                    {(["instagram", "facebook"] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setTestPlatform(p)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${testPlatform === p ? "border-pink-400 bg-pink-50 text-pink-700" : "border-border bg-card text-muted-foreground"}`}
                      >
                        {p === "instagram" ? "📸 Instagram" : "📘 Facebook"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <div className="flex gap-2">
                    {(["dm", "comment"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTestType(t)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${testType === t ? "border-purple-400 bg-purple-50 text-purple-700" : "border-border bg-card text-muted-foreground"}`}
                      >
                        {t === "dm" ? "💬 DM" : "💭 Comment"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Sender Name (optional)</Label>
                <Input value={testSenderName} onChange={e => setTestSenderName(e.target.value)} placeholder="Ahmed" />
              </div>

              <div className="space-y-1.5">
                <Label>Test Message</Label>
                <Textarea
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. Do you deliver to Lahore? I want to order mixed nuts"
                  className="text-sm resize-y"
                />
              </div>

              <Button
                onClick={handleTest}
                disabled={isTesting || !testMessage.trim()}
                style={{ background: "linear-gradient(135deg, #405DE6 0%, #C13584 100%)" }}
                className="text-white gap-1.5"
              >
                {isTesting ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate AI Reply</>}
              </Button>

              {testResult && (
                <div className={`rounded-xl border p-4 ${testResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  {testResult.success ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">AI Reply Preview</p>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap border-l-2 border-green-400 pl-3">
                        {testResult.reply}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        This reply would be posted as a {testType === "comment" ? "public comment" : "private DM"} on {testPlatform}.
                        {testType === "comment" && form.autoFollowUpDm && " A follow-up DM would also be sent."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-red-700">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Test failed</p>
                        <p className="text-xs mt-0.5">{testResult.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-base flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> How Social AI Works</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { icon: "🔐", title: "OAuth Connect",             desc: "Click 'Login with Facebook' — our system auto-fetches your Page token and IG account. No manual copy-paste." },
                { icon: "📥", title: "Meta sends webhook",        desc: "When someone DMs or comments on your post, Meta sends a webhook to our server." },
                { icon: "🤖", title: "AI generates reply",        desc: "GPT reads your system prompt + the message + live product catalog, then generates a contextual human-like reply." },
                { icon: "📤", title: "Reply posted",              desc: "The reply is posted back to Instagram or Facebook via the Graph API." },
                { icon: "📩", title: "Follow-up DM (comments)",  desc: "Customers who commented also get a private DM to continue the conversation." },
                { icon: "📦", title: "Product AI",               desc: "When customers ask about price or products, AI fetches real product data and shares name, price and order link." },
                { icon: "👤", title: "Lead capture",              desc: "Every DM and comment automatically creates a lead record. Check the Leads tab to follow up." },
                { icon: "📊", title: "Logged & tracked",          desc: "Every interaction is logged in the Activity Logs tab for review and analytics." },
              ].map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center shrink-0 text-lg">{step.icon}</div>
                  <div>
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          DEBUG TAB
          ══════════════════════════════════════════ */}
      {tab === "debug" && <WebhookDebugTab />}

      {/* ══════════ INBOX TAB ══════════ */}
      {tab === "inbox" && (
        <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
          {/* Left: conversation list */}
          <div className="w-72 shrink-0 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2"><Inbox className="w-4 h-4 text-pink-500" /> Conversations</h2>
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => refetchConvos()}><RefreshCw className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                  <Inbox className="w-8 h-8 text-muted-foreground mb-2 opacity-30" />
                  <p className="text-xs text-muted-foreground">No conversations yet.<br />Messages will appear here when customers DM or comment.</p>
                </div>
              ) : conversations.map((c: any) => {
                const isSelected = selectedConvo?.senderId === c.sender_id && selectedConvo?.platform === c.platform;
                const platformIcon = c.platform === "instagram" ? "📸" : "📘";
                const name = c.sender_name || `${c.platform === "instagram" ? "IG" : "FB"} User`;
                const preview = c.incoming_text?.slice(0, 60) ?? "";
                const timeAgo = c.created_at ? new Date(c.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric" }) : "";
                return (
                  <button key={`${c.platform}:${c.sender_id}`}
                    onClick={() => { setSelectedConvo({ platform: c.platform, senderId: c.sender_id, name }); setReplyText(""); }}
                    className={`w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors ${isSelected ? "bg-pink-50 border-l-2 border-pink-400" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{platformIcon}</span>
                      <span className="text-xs font-semibold truncate flex-1">{name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate pl-6">{preview}…</p>
                    <div className="flex items-center gap-1 mt-1 pl-6">
                      <Badge variant="outline" className="text-[10px] h-4 px-1">{c.messageCount ?? 1} msgs</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: thread + reply */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
            {!selectedConvo ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageCircle className="w-12 h-12 text-muted-foreground opacity-20 mb-3" />
                <p className="text-sm text-muted-foreground">Select a conversation to view the thread and reply manually.</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{selectedConvo.platform === "instagram" ? "📸" : "📘"}</span>
                    <div>
                      <p className="text-sm font-semibold">{selectedConvo.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{selectedConvo.platform} · {selectedConvo.senderId.slice(0, 12)}…</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => refetchThread()}><RefreshCw className="w-3.5 h-3.5" /></Button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {thread.map((msg: any) => (
                    <div key={msg.id} className="space-y-1.5">
                      {/* Customer message */}
                      {msg.incoming_text && msg.incoming_text !== "[Manual reply sent by admin]" && (
                        <div className="flex justify-start">
                          <div className="max-w-[75%] bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                            <p className="text-xs text-muted-foreground font-medium mb-0.5">{selectedConvo.name}</p>
                            <p className="text-sm whitespace-pre-wrap">{msg.incoming_text}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{msg.type === "comment" ? "💬 Comment" : "📩 DM"} · {new Date(msg.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                      )}
                      {/* AI / admin reply */}
                      {msg.ai_reply && (
                        <div className="flex justify-end">
                          <div className="max-w-[75%] rounded-2xl rounded-tr-sm px-3 py-2 text-white" style={{ background: "linear-gradient(135deg,#405DE6,#C13584)" }}>
                            <p className="text-xs font-medium mb-0.5 opacity-80">KDF NUTS {msg.incoming_text === "[Manual reply sent by admin]" ? "(Manual)" : "(AI)"}</p>
                            <p className="text-sm whitespace-pre-wrap">{msg.ai_reply}</p>
                            <p className="text-[10px] opacity-70 mt-1">{new Date(msg.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })} · {msg.status}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>

                {/* Manual reply input */}
                <div className="px-4 py-3 border-t border-border">
                  <div className="flex gap-2">
                    <Textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="Type a manual reply…"
                      className="min-h-[60px] max-h-[120px] text-sm resize-none"
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
                    />
                    <Button
                      onClick={sendReply}
                      disabled={isSendingReply || !replyText.trim()}
                      className="shrink-0 self-end"
                      style={{ background: "linear-gradient(135deg,#405DE6,#C13584)" }}
                    >
                      {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter to send · Replies go directly to their {selectedConvo.platform} inbox</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════ LEADS TAB ══════════ */}
      {tab === "leads" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2"><Users className="w-4 h-4 text-pink-500" /> Captured Leads</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Automatically collected from DMs and comments. Add phone numbers to enable order notifications.</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{leads.length} leads</Badge>
                <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => refetchLeads()}><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Users className="w-10 h-10 text-muted-foreground opacity-20 mb-3" />
                <p className="text-sm font-medium">No leads yet</p>
                <p className="text-xs text-muted-foreground mt-1">When customers DM or comment on your posts, they'll automatically appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-32">Platform</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-36">Phone</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Interest</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-20">Msgs</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24">Last Seen</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24">Converted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {leads.map((lead: any) => {
                      const isEditing = editingLeadId === lead.id;
                      return (
                        <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span>{lead.platform === "instagram" ? "📸" : "📘"}</span>
                              <span className="text-xs capitalize text-muted-foreground">{lead.platform}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-sm truncate max-w-[140px]">{lead.sender_name || "—"}</p>
                            <p className="text-[10px] text-muted-foreground">{lead.sender_id?.slice(0, 10)}…</p>
                          </td>
                          <td className="px-4 py-3">
                            {isEditing ? (
                              <Input value={leadPhoneEdit} onChange={e => setLeadPhoneEdit(e.target.value)} className="h-7 text-xs w-32" placeholder="03001234567" />
                            ) : (
                              <button onClick={() => { setEditingLeadId(lead.id); setLeadPhoneEdit(lead.phone ?? ""); setLeadNotesEdit(lead.notes ?? ""); }}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                <Phone className="w-3 h-3" />
                                {lead.phone || <span className="text-muted-foreground italic">Add phone</span>}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{lead.interest || "—"}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">{lead.message_count ?? 1}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{new Date(lead.last_seen_at).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Switch checked={!!lead.is_converted} onCheckedChange={v => updateLead(lead.id, { isConverted: v })} className="scale-75" />
                              {isEditing && (
                                <Button size="sm" variant="default" className="h-6 text-xs px-2"
                                  onClick={() => { updateLead(lead.id, { phone: leadPhoneEdit, notes: leadNotesEdit }); setEditingLeadId(null); }}>
                                  Save
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
