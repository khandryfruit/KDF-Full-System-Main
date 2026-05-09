import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

declare global { interface Window { FB: any; fbAsyncInit?: () => void; } }
import {
  MessageCircle, Loader2, Plus, Trash2, Eye, EyeOff,
  CheckCircle2, XCircle, Send, RefreshCw, FileText,
  Phone, Settings, AlertTriangle, Clock, RotateCcw, Ticket,
  Copy, Wifi, WifiOff, ExternalLink, ShieldCheck, Bot,
  ChevronRight, User, Sparkles, Info, ShoppingBag, Zap, RotateCw,
  Megaphone, Bug, Play, Users, Filter, TimerIcon, TrendingUp,
  CheckSquare, Globe, QrCode, Download, MessageSquare, Tag,
  ArrowUp, ArrowDown, Edit2, GitBranch, CalendarClock, Search,
} from "lucide-react";
import { WhatsAppTemplatesTab } from "./WhatsAppTemplatesTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });
async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}


type Tab = "settings" | "recovery" | "chatbot" | "conversations" | "templates" | "logs" | "automations" | "campaigns" | "debug" | "qr" | "analytics" | "rules" | "flows";

interface WaMenuItem {
  id: string;
  emoji: string;
  label: string;
  description: string;
  sectionTitle?: string;
  replyMessage?: string;
  enabled?: boolean;
  isDefault?: boolean;
}

const AI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast, Recommended)" },
  { value: "gpt-4o", label: "GPT-4o (Most Capable)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo (Powerful)" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Fastest, Cheapest)" },
];

function TestAIReply() {
  const [testInput, setTestInput] = useState("");
  const [result, setResult] = useState<{ success: boolean; reply?: string; error?: string; model?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    if (!testInput.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/whatsapp/test-ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` },
        body: JSON.stringify({ message: testInput }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50">
          <Sparkles className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="font-semibold text-base">Test AI Reply</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Send a test message and see how the AI responds</p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleTest()}
            placeholder='e.g. "What are your best sellers?" or "Do you deliver to Karachi?"'
            className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <Button onClick={handleTest} disabled={loading || !testInput.trim()} variant="outline" className="gap-1.5 shrink-0">
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Testing…</> : <><Sparkles className="w-3.5 h-3.5" />Test</>}
          </Button>
        </div>
        {result && (
          <div className={`rounded-xl border p-4 text-sm ${result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            {result.success ? (
              <>
                {result.model && <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">AI Response · {result.model}</p>}
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">{result.reply}</p>
              </>
            ) : (
              <div className="flex items-start gap-2 text-red-700">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{result.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Meta App Health Check ───────────────────────────── */
type DiagCheck = {
  id: string; label: string;
  status: "pass" | "fail" | "warn" | "unknown";
  detail: string; fixUrl?: string; fixLabel?: string;
};
type DiagResult = {
  success: boolean; error?: string;
  appId?: string; appName?: string; appStatus?: string;
  mainIssue?: string;
  summary?: { total: number; pass: number; fail: number; warn: number; unknown: number };
  checks: DiagCheck[];
};

function MetaAppHealthCheck() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<DiagResult | null>(null);

  const runDiagnostic = async () => {
    setRunning(true);
    setOpen(true);
    try {
      const data = await apiFetch("/api/admin/whatsapp/meta-app-diagnostic");
      setResult(data);
    } catch (e: any) {
      setResult({ success: false, error: e.message, checks: [] });
      toast({ title: "Diagnostic failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (s: DiagCheck["status"]) => {
    if (s === "pass") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (s === "fail") return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    if (s === "warn") return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    return <Info className="w-4 h-4 text-slate-400 shrink-0" />;
  };
  const statusBg = (s: DiagCheck["status"]) =>
    s === "pass" ? "border-emerald-200 bg-emerald-50/50" :
    s === "fail" ? "border-red-200 bg-red-50/50" :
    s === "warn" ? "border-amber-200 bg-amber-50/50" :
    "border-border bg-muted/20";

  const failCount  = result?.summary?.fail    ?? 0;
  const warnCount  = result?.summary?.warn    ?? 0;
  const passCount  = result?.summary?.pass    ?? 0;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <Bug className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Meta App Health Check</p>
            <p className="text-xs text-muted-foreground mt-0.5">Diagnoses "Facebook Login unavailable" errors — checks app mode, missing fields, permissions, and OAuth config</p>
          </div>
        </div>
        <button
          onClick={runDiagnostic}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors shrink-0"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {running ? "Running…" : result ? "Re-run" : "Run Diagnostic"}
        </button>
      </div>

      {/* Main issue banner */}
      {result && open && (
        <div className="border-b border-border">
          {!result.success ? (
            <div className="px-5 py-3 bg-red-50 flex items-start gap-2.5">
              <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">Diagnostic Error</p>
                <p className="text-xs text-red-700 mt-0.5">{result.error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* App identity row */}
              <div className="px-5 py-3 bg-slate-50 flex items-center gap-4 flex-wrap text-xs">
                <span className="text-muted-foreground">App: <strong className="text-foreground">{result.appName}</strong></span>
                <span className={`font-bold px-2 py-0.5 rounded-full ${result.appStatus === "LIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {result.appStatus ?? "UNKNOWN"}
                </span>
                <span className="text-muted-foreground font-mono">ID: {result.appId}</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-emerald-700 font-semibold">{passCount} passed</span>
                  {failCount > 0 && <span className="text-red-700 font-semibold">{failCount} failed</span>}
                  {warnCount > 0 && <span className="text-amber-700 font-semibold">{warnCount} warnings</span>}
                </div>
              </div>
              {/* Main issue */}
              {result.mainIssue && (
                <div className={`px-5 py-3 flex items-start gap-2.5 ${failCount > 0 ? "bg-red-50 border-b border-red-100" : "bg-emerald-50 border-b border-emerald-100"}`}>
                  {failCount > 0
                    ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    : <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />}
                  <p className={`text-sm font-medium ${failCount > 0 ? "text-red-800" : "text-emerald-800"}`}>{result.mainIssue}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Checklist */}
      {result?.checks && result.checks.length > 0 && open && (
        <div className="px-5 py-4 space-y-2">
          {result.checks.map(check => (
            <div key={check.id} className={`rounded-xl border px-4 py-3 ${statusBg(check.status)}`}>
              <div className="flex items-start gap-2.5">
                {statusIcon(check.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug">{check.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">{check.detail}</p>
                  {check.fixUrl && check.status !== "pass" && (
                    <a
                      href={check.fixUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {check.fixLabel ?? "Fix this"} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collapsed state hint */}
      {!running && !result && (
        <div className="px-5 py-4 text-xs text-muted-foreground">
          Click "Run Diagnostic" to automatically check: App Mode (Live/Dev), Privacy Policy URL, App Icon, Data Deletion URL, App Domains, Business Verification, Token validity, Permission scopes, and OAuth redirect configuration — with direct links to fix each issue.
        </div>
      )}
    </div>
  );
}

/* ─── System User Permanent Token Guide ───────────────── */
const SYSTEM_USER_STEPS = [
  {
    n: 1, icon: "🏢", title: "Open Meta Business Manager",
    desc: "Go to business.facebook.com → sign in with the account that owns your WhatsApp Business Account (WABA). You should see 'KHAN DRY FRUITS' or 'KDF MART' in the top-left portfolio selector.",
    link: { label: "Open Meta Business Manager →", href: "https://business.facebook.com/settings/system-users" },
  },
  {
    n: 2, icon: "👤", title: "Create a System User",
    desc: "In Business Settings → Users → System Users → click 'Add'. Name it (e.g. 'KDF API User'), set Role to 'Admin'. System Users don't expire like regular user tokens.",
    link: { label: "System Users docs →", href: "https://developers.facebook.com/docs/marketing-api/system-users" },
  },
  {
    n: 3, icon: "🔗", title: "Assign the Meta App to the System User",
    desc: "On the System User you just created → click 'Add Assets' → select 'Apps' → find your Meta App (the one with your META_APP_ID) → assign it with 'Full Control' permission.",
  },
  {
    n: 4, icon: "📱", title: "Assign the WABA to the System User",
    desc: "Still on the System User → click 'Add Assets' → select 'WhatsApp Accounts' → find 'KDF MART' or your WABA → assign with 'Full Control'. This allows the token to send messages.",
  },
  {
    n: 5, icon: "🔑", title: "Generate a Permanent Access Token",
    desc: "Click 'Generate New Token' on the System User. Select your App. Under Permissions, enable: whatsapp_business_messaging, whatsapp_business_management, business_management. Set Token Expiry to 'Never'. Copy the token — it will only be shown once.",
  },
  {
    n: 6, icon: "🆔", title: "Get Phone Number ID and WABA ID",
    desc: "Go to developers.facebook.com → your App → WhatsApp → Getting Started. You'll see 'Phone Number ID' (a 15+ digit number) and 'WhatsApp Business Account ID' (WABA ID) listed there. Copy both.",
    link: { label: "Open Meta Developer Portal →", href: "https://developers.facebook.com/apps" },
  },
  {
    n: 7, icon: "🔗", title: "Configure Webhook in Meta",
    desc: "In your App → WhatsApp → Configuration → Webhooks: paste the Webhook URL and Verify Token from the panel above. Subscribe to: messages, message_deliveries, message_reads, messaging_postbacks.",
  },
];
function MetaSetupGuide() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50">
          <span className="text-lg">🔑</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">How to Generate a System User Permanent Access Token</p>
          <p className="text-xs text-muted-foreground mt-0.5">Step-by-step for existing WABA owners — no new account needed, token never expires</p>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Why not Embedded Signup explanation */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 leading-relaxed space-y-1.5">
            <p className="font-semibold text-sm text-amber-800">⚠️ Why Embedded Signup doesn't work for your setup</p>
            <p>Meta's Embedded Signup is designed for <strong>SaaS providers</strong> to onboard <em>other people's</em> WhatsApp accounts. When your Meta App lives inside the <strong>KDF MART</strong> business portfolio (which is owned by <strong>KHAN DRY FRUITS</strong>), Meta intentionally greys out KHAN DRY FRUITS in the popup because you <em>cannot use your own app to onboard yourself</em> — it's a hard Meta policy restriction, not a configuration bug.</p>
            <p>The correct official method for app-owners connecting their <strong>own</strong> WABA is the <strong>System User Permanent Token</strong> approach below. This is what Meta recommends.</p>
          </div>
          <div className="space-y-3">
            {SYSTEM_USER_STEPS.map(step => (
              <div key={step.n} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">{step.n}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{step.icon} {step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
                  {"link" in step && step.link && (
                    <a href={(step as any).link.href} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#25D366] hover:underline mt-1 inline-flex items-center gap-1">
                      {(step as any).link.label} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-800 leading-relaxed">
            <strong>After generating the token:</strong> Paste it into the Access Token field above and click <strong>"Auto-Resolve IDs"</strong> — the system will automatically fetch your Phone Number ID and WABA ID so you don't need to look them up manually.
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── WhatsApp QR Tab — standalone component ─────────── */
function WhatsAppQRTab() {
  const { toast } = useToast();
  const [qrVersion, setQrVersion] = useState(1);
  const [qrKey, setQrKey] = useState(Date.now());
  const [msgDraft, setMsgDraft] = useState("");
  const [msgSaved, setMsgSaved] = useState(false);
  const [showQrError, setShowQrError] = useState(false);

  const { data: qrSettings, refetch: refetchQr } = useQuery<{
    phone: string | null; qrMessage: string | null;
    qrScanCount: number; qrVersion: number; qrLastScanned: string | null;
  }>({
    queryKey: ["wa-qr-settings"],
    queryFn: () => apiFetch("/api/admin/whatsapp/qr-settings"),
    staleTime: 30_000,
  });

  React.useEffect(() => {
    if (qrSettings) {
      setMsgDraft(qrSettings.qrMessage ?? "Hello! I want to place an order 🥜");
      setQrVersion(qrSettings.qrVersion ?? 1);
    }
  }, [qrSettings]);

  const saveMsg = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/qr-settings", {
      method: "PUT",
      body: JSON.stringify({ qrMessage: msgDraft }),
    }),
    onSuccess: () => {
      setMsgSaved(true);
      setTimeout(() => setMsgSaved(false), 2500);
      setQrKey(Date.now());
      refetchQr();
      toast({ title: "Message saved", description: "QR code updated with new pre-filled message." });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const regenerate = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/qr-settings/regenerate", { method: "POST" }),
    onSuccess: (d: any) => {
      setQrVersion(d.qrVersion);
      setQrKey(Date.now());
      setShowQrError(false);
      refetchQr();
      toast({ title: "QR regenerated", description: `New version: v${d.qrVersion}` });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // Validate + format phone
  const rawPhone = qrSettings?.phone ?? "";
  let intlPhone = rawPhone.replace(/[^0-9]/g, "");
  if (intlPhone.startsWith("0")) intlPhone = "92" + intlPhone.slice(1);
  const isValidPhone = intlPhone.length >= 10;
  const waLink = isValidPhone
    ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msgDraft || qrSettings?.qrMessage || "")}`
    : null;

  const qrImgUrl = `/api/whatsapp/qr?v=${qrVersion}&t=${qrKey}`;
  const scanCount = qrSettings?.qrScanCount ?? 0;
  const lastScanned = qrSettings?.qrLastScanned
    ? new Date(qrSettings.qrLastScanned).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })
    : "Never";

  const copyWaLink = () => {
    if (!waLink) return;
    navigator.clipboard.writeText(waLink);
    toast({ title: "Copied!", description: "WhatsApp link copied to clipboard." });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
      {/* Left: QR Code display */}
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-5">
        <div className="flex items-center gap-3 self-start w-full">
          <div className="w-9 h-9 rounded-xl bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
            <QrCode className="w-4.5 h-4.5 text-[#25D366]" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">WhatsApp QR Code</h2>
            <p className="text-xs text-muted-foreground">Scan to open WhatsApp with a pre-filled message</p>
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">v{qrVersion}</span>
        </div>

        {/* QR image */}
        <div className="p-3 bg-white rounded-2xl shadow-md border border-border inline-block relative">
          {!isValidPhone ? (
            <div className="w-52 h-52 flex flex-col items-center justify-center gap-3 bg-muted rounded-xl text-center p-4">
              <QrCode className="w-10 h-10 text-muted-foreground opacity-40" />
              <p className="text-xs text-muted-foreground">Set a WhatsApp phone number in API Settings first.</p>
            </div>
          ) : showQrError ? (
            <div className="w-52 h-52 flex flex-col items-center justify-center gap-3 bg-red-50 rounded-xl text-center p-4">
              <AlertTriangle className="w-8 h-8 text-red-400" />
              <p className="text-xs text-red-500">QR generation failed.<br />Check server logs.</p>
            </div>
          ) : (
            <img
              key={qrKey}
              src={qrImgUrl}
              alt="WhatsApp QR Code"
              className="w-52 h-52 rounded-lg"
              onError={() => setShowQrError(true)}
              onLoad={() => setShowQrError(false)}
            />
          )}
        </div>

        {isValidPhone && (
          <div className="text-center">
            <p className="text-xs font-medium text-foreground">Scan to Chat on WhatsApp</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">+{intlPhone}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 justify-center">
          <a
            href={qrImgUrl}
            download="whatsapp-qr.png"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download PNG
          </a>
          <button
            onClick={copyWaLink}
            disabled={!waLink}
            className="flex items-center gap-1.5 px-3 py-2 border border-border hover:bg-accent text-xs font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" /> Copy WA Link
          </button>
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 border border-border hover:bg-accent text-xs font-semibold rounded-xl transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> Test Link
            </a>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="flex items-center gap-1.5 text-xs rounded-xl"
          >
            {regenerate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Regenerate QR
          </Button>
        </div>

        {/* Scan analytics */}
        <div className="w-full grid grid-cols-2 gap-3 pt-1 border-t border-border">
          <div className="bg-muted/40 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-foreground">{scanCount.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium uppercase tracking-wide">Total Scans</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3 text-center">
            <p className="text-xs font-semibold text-foreground leading-snug">{lastScanned}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium uppercase tracking-wide">Last Scanned</p>
          </div>
        </div>
      </div>

      {/* Right: Configuration */}
      <div className="space-y-5">
        {/* Pre-filled message editor */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-0.5">Pre-filled Message</h3>
            <p className="text-xs text-muted-foreground">This message auto-fills in WhatsApp when a customer scans the QR. They can edit it before sending.</p>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Message Text</Label>
            <Textarea
              value={msgDraft}
              onChange={e => setMsgDraft(e.target.value)}
              placeholder="Hello! I want to place an order 🥜"
              rows={3}
              className="text-sm resize-none rounded-xl"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              URL-encoded automatically. Emoji are supported.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => saveMsg.mutate()}
              disabled={saveMsg.isPending || !msgDraft.trim()}
              style={{ backgroundColor: "#5FA800" }}
              className="text-white text-xs rounded-xl gap-1.5 flex-1"
            >
              {saveMsg.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : msgSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {msgSaved ? "Saved!" : "Save & Apply"}
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => setMsgDraft(qrSettings?.qrMessage ?? "")}
              className="text-xs rounded-xl"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Phone validation */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-sm">Phone Number</h3>
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${isValidPhone ? "border-green-200 bg-green-50/60" : "border-red-200 bg-red-50/60"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isValidPhone ? "bg-green-100" : "bg-red-100"}`}>
              {isValidPhone ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
            </div>
            <div className="min-w-0">
              {isValidPhone ? (
                <>
                  <p className="text-xs font-semibold text-green-800">Valid number</p>
                  <p className="text-[11px] text-green-700 font-mono">+{intlPhone}</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-red-700">No phone number set</p>
                  <p className="text-[11px] text-red-600">Go to API Settings tab to configure.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Usage tips */}
        <div className="bg-muted/40 border border-border rounded-2xl p-5 space-y-2.5">
          <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Where to use this QR</h3>
          {[
            ["📦", "Product packaging & stickers"],
            ["🧾", "Printed receipts & invoices"],
            ["📇", "Business cards & flyers"],
            ["📧", "Order confirmation emails"],
            ["🖥️", "Website footer & contact page"],
            ["📱", "Social media stories & bios"],
          ].map(([icon, tip]) => (
            <div key={tip} className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="text-base leading-none">{icon}</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Smart Test Message Component
   ═══════════════════════════════════════════════════════════ */
type MetaTemplate = {
  name: string; status: string; language: string; category: string;
  components: Array<{ type: string; text?: string; format?: string; buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }> }>;
};

function _extractVarCount(text: string): number {
  const m = text.match(/\{\{(\d+)\}\}/g);
  return m ? Math.max(...m.map(x => parseInt(x.replace(/\D/g, ""), 10))) : 0;
}
function _getComp(tpl: MetaTemplate, type: string) { return tpl.components.find(c => c.type === type) ?? null; }
function _applyVars(text: string, vars: string[]): string {
  let s = text;
  for (let i = 0; i < vars.length; i++) s = s.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), vars[i] || `{{${i + 1}}}`);
  return s;
}
function _translateError(err: string): { title: string; detail: string } {
  if (err.includes("#132000")) return { title: "Variable count mismatch", detail: `The number of variables filled doesn't match what this template expects. Count the {{1}}, {{2}}… placeholders in the template body and fill every one of them.` };
  if (err.includes("#132001") || err.includes("not exist") || err.includes("not found")) return { title: "Template not found", detail: "No approved template with that exact name exists. Check the name in Meta Business Manager → Message Templates." };
  if (err.includes("#131031")) return { title: "Template not approved", detail: "This template hasn't been approved by Meta yet. Check its status in Meta Business Manager." };
  if (err.includes("#131049") || err.includes("language")) return { title: "Language code mismatch", detail: "The language code doesn't match the template's language. Try en_US or check the exact code in Meta." };
  if (err.includes("#100") || err.includes("phone") || err.includes("recipient")) return { title: "Invalid phone number", detail: "Use international format with country code, e.g. +923001234567. The number must be registered on WhatsApp." };
  if (err.includes("not configured") || err.includes("inactive")) return { title: "WhatsApp not connected", detail: "Go to API Settings and make sure your Access Token and Phone Number ID are saved and the integration is Active." };
  return { title: "Send failed", detail: err };
}

function SmartTestMessage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = React.useState<"template" | "freeform">("template");
  const [phone, setPhone] = React.useState("");
  const [message, setMessage] = React.useState("Hello from KDF NUTS! 🥜 This is a test message.");
  const [search, setSearch] = React.useState("");
  const [selectedTpl, setSelectedTpl] = React.useState<MetaTemplate | null>(null);
  const [vars, setVars] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<{ success: boolean; error?: string; messageId?: string; translatedError?: { title: string; detail: string } } | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [recentNames, setRecentNames] = React.useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("kdf_recent_tpls") ?? "[]"); } catch { return []; }
  });

  const { data: tplData, isFetching, refetch } = useQuery<{ templates: MetaTemplate[]; error?: string; cached?: boolean }>({
    queryKey: ["/api/admin/whatsapp/meta-templates"],
    queryFn: () => apiFetch("/api/admin/whatsapp/meta-templates"),
    staleTime: 5 * 60_000, retry: false,
  });

  const allTpls   = tplData?.templates ?? [];
  const approved  = allTpls.filter(t => t.status === "APPROVED");
  const filtered  = search.trim() ? approved.filter(t => t.name.toLowerCase().includes(search.toLowerCase())) : approved;

  const handleSelectTpl = (tpl: MetaTemplate) => {
    setSelectedTpl(tpl);
    const body = _getComp(tpl, "BODY")?.text ?? "";
    setVars(Array(_extractVarCount(body)).fill(""));
    setResult(null);
    const updated = [tpl.name, ...recentNames.filter(n => n !== tpl.name)].slice(0, 5);
    setRecentNames(updated);
    localStorage.setItem("kdf_recent_tpls", JSON.stringify(updated));
  };

  const handleSend = async () => {
    if (!phone.trim()) { toast({ title: "Phone number required", variant: "destructive" }); return; }
    if (mode === "template" && !selectedTpl) { toast({ title: "Select a template first", variant: "destructive" }); return; }
    if (mode === "template" && vars.length > 0) {
      const emptyIdx = vars.findIndex(v => !v.trim());
      if (emptyIdx !== -1) {
        toast({ title: `Fill in {{${emptyIdx + 1}}}`, description: `All ${vars.length} variable${vars.length > 1 ? "s" : ""} must be filled before sending.`, variant: "destructive" });
        return;
      }
    }
    setIsSending(true); setResult(null);
    try {
      const payload = mode === "template" && selectedTpl
        ? { phone, useTemplate: true, templateName: selectedTpl.name, languageCode: selectedTpl.language, templateParams: vars }
        : { phone, message };
      const r = await apiFetch("/api/admin/whatsapp/test", { method: "POST", body: JSON.stringify(payload) });
      setResult(r.success ? r : { ...r, translatedError: _translateError(r.error ?? "") });
    } catch (e: any) {
      setResult({ success: false, error: e.message, translatedError: _translateError(e.message) });
    } finally { setIsSending(false); }
  };

  const handleForceSync = async () => {
    qc.removeQueries({ queryKey: ["/api/admin/whatsapp/meta-templates"] });
    await refetch();
    toast({ title: "Templates synced from Meta" });
  };

  const headerComp  = selectedTpl ? _getComp(selectedTpl, "HEADER")  : null;
  const footerText  = selectedTpl ? (_getComp(selectedTpl, "FOOTER")?.text ?? "") : "";
  const buttons     = selectedTpl ? (_getComp(selectedTpl, "BUTTONS")?.buttons ?? []) : [];
  const bodyText    = selectedTpl ? (_getComp(selectedTpl, "BODY")?.text ?? "") : "";
  const previewBody = _applyVars(bodyText, vars);
  const previewHdr  = headerComp?.text ? _applyVars(headerComp.text, vars) : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Send className="w-4 h-4 text-[#25D366]" /> Test Message
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Select an approved template, fill variables, and send a live test to any number</p>
        </div>
        <button
          onClick={handleForceSync}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-muted transition-colors shrink-0"
        >
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync Templates
        </button>
      </div>

      <div className="px-5 py-5">
        {/* ── Mode toggle ── */}
        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border mb-5 w-fit">
          <button onClick={() => setMode("template")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "template" ? "bg-[#25D366] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            Approved Template
          </button>
          <button onClick={() => setMode("freeform")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "freeform" ? "bg-white shadow-sm text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
            Free-form Text
          </button>
        </div>

        {/* ── Main layout: form + preview ── */}
        <div className="flex gap-6 items-start">

          {/* ─── Left: Form ─── */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Result card */}
            {result && (
              <div className={`rounded-xl border px-4 py-3.5 ${result.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                {result.success ? (
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Message sent successfully!</p>
                      <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">Meta accepted the message. Delivery status will appear in the Logs tab once Meta sends a webhook callback.</p>
                      {result.messageId && <p className="text-[10px] font-mono text-emerald-600 mt-2 bg-emerald-100 px-2 py-1 rounded">{result.messageId}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-red-800">{result.translatedError?.title ?? "Send failed"}</p>
                      <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{result.translatedError?.detail ?? result.error}</p>
                      {result.translatedError && result.error && (
                        <p className="text-[10px] font-mono text-red-400 mt-2 bg-red-100 px-2 py-1 rounded">{result.error}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Phone input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Recipient Phone Number</label>
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+923001234567"
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366] transition-colors"
              />
              <p className="text-[10px] text-muted-foreground">Include country code, e.g. +923001234567</p>
            </div>

            {mode === "freeform" ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span><strong>Free-form messages</strong> are blocked by Meta if the recipient hasn't messaged you in the last 24 hours. Use Approved Template mode to send proactively.</span>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Message</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366] resize-none transition-colors"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {/* Search bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Select Template</label>
                    <div className="flex items-center gap-2">
                      {tplData?.error && (
                        <span className="text-[10px] text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {tplData.error === "no_token" ? "Add Access Token first" : tplData.error === "no_waba_id" ? "Add Business Account ID first" : tplData.error}
                        </span>
                      )}
                      {tplData?.cached && <span className="text-[10px] text-muted-foreground">cached · </span>}
                      <span className="text-[10px] text-muted-foreground">{approved.length} approved</span>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search templates…"
                      className="w-full h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366] transition-colors"
                    />
                  </div>
                </div>

                {/* Template list */}
                {isFetching ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-[#25D366]" /> Fetching templates from Meta…
                  </div>
                ) : filtered.length > 0 ? (
                  <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-52 overflow-y-auto">
                    {filtered.map(tpl => {
                      const body = _getComp(tpl, "BODY")?.text ?? "";
                      const varCount = _extractVarCount(body);
                      const isSelected = selectedTpl?.name === tpl.name && selectedTpl?.language === tpl.language;
                      return (
                        <button key={`${tpl.name}-${tpl.language}`} onClick={() => handleSelectTpl(tpl)}
                          className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${isSelected ? "bg-[#25D366]/10 border-l-2 border-l-[#25D366]" : "hover:bg-muted/40"}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{tpl.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground">{tpl.language}</span>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] text-muted-foreground capitalize">{tpl.category?.toLowerCase()}</span>
                              {varCount > 0 && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-medium">{varCount} var{varCount > 1 ? "s" : ""}</span>
                              )}
                              {recentNames.includes(tpl.name) && (
                                <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">recent</span>
                              )}
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-[#25D366] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : approved.length === 0 && !isFetching ? (
                  <div className="border border-dashed border-border rounded-xl px-4 py-6 text-center text-xs text-muted-foreground">
                    <p className="font-medium">No approved templates found</p>
                    <p className="mt-1 leading-relaxed">Click <strong>Sync Templates</strong> above to fetch from Meta, or make sure your Business Account ID is configured in API Settings.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No templates match "{search}"</p>
                )}

                {/* Selected template detail + variable inputs */}
                {selectedTpl && (
                  <div className="border border-[#25D366]/30 bg-[#25D366]/5 rounded-xl px-4 py-3.5 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold">{selectedTpl.name}</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">APPROVED</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{selectedTpl.language}</span>
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full capitalize">{selectedTpl.category?.toLowerCase()}</span>
                    </div>
                    {vars.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-foreground">
                          {vars.length} variable{vars.length > 1 ? "s" : ""} auto-detected — fill them in:
                        </p>
                        {vars.map((val, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[10px] font-mono bg-[#25D366]/10 border border-[#25D366]/30 text-[#1a9e50] rounded-lg px-2 py-1.5 min-w-[42px] text-center font-bold shrink-0">
                              {`{{${i + 1}}}`}
                            </span>
                            <input type="text" value={val}
                              onChange={e => { const n = [...vars]; n[i] = e.target.value; setVars(n); }}
                              placeholder={`Value for {{${i + 1}}} (required)`}
                              className={`flex-1 h-8 rounded-lg border bg-background px-3 text-xs focus:outline-none focus:ring-2 transition-colors ${
                                val.trim() === ""
                                  ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                                  : "border-border focus:ring-[#25D366]/40 focus:border-[#25D366]"
                              }`}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">No variables — this template has a fixed body (no placeholders).</p>
                    )}
                    {/* Body preview text */}
                    {bodyText && (
                      <div className="bg-white/70 border border-border rounded-lg px-3 py-2 text-[11px] text-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                        {bodyText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Send button */}
            <button onClick={handleSend}
              disabled={isSending || !phone.trim() || (mode === "template" && !selectedTpl)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#20b859] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSending ? "Sending…" : "Send Test"}
            </button>
          </div>

          {/* ─── Right: WhatsApp live preview ─── */}
          {mode === "template" && selectedTpl && (
            <div className="w-64 shrink-0 hidden md:block">
              <p className="text-[10px] text-muted-foreground font-medium mb-2 flex items-center gap-1">
                <Eye className="w-3 h-3" /> Live Preview
              </p>
              <div className="bg-[#ECE5DD] rounded-2xl overflow-hidden border border-border shadow-lg">
                {/* WA header */}
                <div className="bg-[#075E54] px-3 py-2.5 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center text-white text-[9px] font-bold shrink-0">KDF</div>
                  <div>
                    <p className="text-white text-[11px] font-semibold">KDF NUTS</p>
                    <p className="text-[9px] text-[#9FCEA3]">WhatsApp Business</p>
                  </div>
                </div>
                {/* Chat bubble */}
                <div className="px-2.5 py-3">
                  <div className="bg-white rounded-xl rounded-tl-none shadow-sm overflow-hidden max-w-[96%]">
                    {/* Header */}
                    {headerComp && (
                      <div className="px-3 pt-3 pb-1">
                        {headerComp.format === "IMAGE" ? (
                          <div className="h-24 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-[10px]">[ Image ]</div>
                        ) : headerComp.format === "VIDEO" ? (
                          <div className="h-20 bg-gray-800 rounded-lg flex items-center justify-center text-gray-300 text-[10px]">▶ Video</div>
                        ) : headerComp.format === "DOCUMENT" ? (
                          <div className="h-10 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center text-blue-500 text-[10px] gap-1"><FileText className="w-3 h-3" /> Document</div>
                        ) : (
                          <p className="text-[11px] font-bold text-foreground leading-snug">{previewHdr ?? headerComp.text}</p>
                        )}
                      </div>
                    )}
                    {/* Body */}
                    {previewBody && (
                      <div className="px-3 py-2">
                        <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-line">{previewBody}</p>
                      </div>
                    )}
                    {/* Footer */}
                    {footerText && (
                      <div className="px-3 pb-1.5">
                        <p className="text-[9px] text-gray-400 leading-snug">{footerText}</p>
                      </div>
                    )}
                    {/* Timestamp */}
                    <div className="px-3 pb-2 text-right">
                      <span className="text-[9px] text-gray-400">9:19 AM ✓✓</span>
                    </div>
                    {/* Buttons */}
                    {buttons.length > 0 && (
                      <div className="border-t border-gray-100 divide-y divide-gray-100">
                        {buttons.map((btn, i) => (
                          <div key={i} className="px-3 py-2 text-center text-[11px] font-semibold text-[#00a5f4]">{btn.text}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("settings");
  const [connMethod, setConnMethod] = useState<"meta" | "manual">("manual");
  const [showToken, setShowToken] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("Hello from KDF NUTS! 🥜 This is a test message.");
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; messageId?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testUseTemplate, setTestUseTemplate] = useState(false);
  const [testTemplateName, setTestTemplateName] = useState("");
  const [testLangCode, setTestLangCode] = useState("en_US");
  const [testTemplateParams, setTestTemplateParams] = useState<string[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<any[]>([]);

  // Helper: count {{N}} params in a Meta template's body component
  function detectTemplateParamCount(tplName: string): number {
    const tpl = metaTemplates.find(t => t.name === tplName);
    if (!tpl?.components) return 0;
    const body = tpl.components.find((c: any) => c.type === "BODY");
    if (!body?.text) return 0;
    const matches = body.text.match(/\{\{(\d+)\}\}/g);
    return matches ? Math.max(...matches.map((m: string) => parseInt(m.replace(/\D/g, ""), 10))) : 0;
  }

  function selectMetaTemplate(name: string, lang?: string) {
    setTestTemplateName(name);
    if (lang) setTestLangCode(lang);
    const count = detectTemplateParamCount(name);
    setTestTemplateParams(Array(count).fill(""));
  }
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  const [metaSyncError, setMetaSyncError] = useState<string | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [isLoadingWebhookLogs, setIsLoadingWebhookLogs] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message?: string; error?: string; webhookUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [replyMsg, setReplyMsg] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ── Multi-agent & Conversations CRM state ── */
  const [convSearch, setConvSearch]           = useState("");
  const [convFilter, setConvFilter]           = useState<"all"|"open"|"resolved"|"spam">("all");
  const [convDetail, setConvDetail]           = useState<any>(null);
  const [convNotes, setConvNotes]             = useState<any[]>([]);
  const [showNoteInput, setShowNoteInput]     = useState(false);
  const [noteText, setNoteText]               = useState("");
  const [agentName]                           = useState(() => localStorage.getItem("kdf_agent_name") ?? "Admin");
  const [botModeChanging, setBotModeChanging] = useState(false);
  const [showRightPanel, setShowRightPanel]   = useState(true);
  const sseRef = useRef<EventSource | null>(null);

  /* ── Settings ── */
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/admin/whatsapp/settings"],
    queryFn: () => apiFetch("/api/admin/whatsapp/settings"),
  });
  const { data: webhookInfo, refetch: refetchWebhookInfo } = useQuery({
    queryKey: ["/api/admin/whatsapp/webhook-info"],
    queryFn: () => apiFetch("/api/admin/whatsapp/webhook-info"),
    refetchOnWindowFocus: false,
  });
  const [form, setForm] = useState({
    accessToken: "", phoneNumberId: "", businessAccountId: "",
    webhookVerifyToken: "kdfnuts_webhook_token", isActive: false,
    chatButtonEnabled: false, chatButtonPhone: "", chatButtonMessage: "Hi! I'd like to know more about your products.",
    abandonedRecoveryEnabled: false, abandonedRecoveryDelayMinutes: 45, abandonedRecoveryCouponCode: "",
    appSecret: "", apiVersion: "v18.0", businessPortfolioId: "",
  });
  useEffect(() => {
    if (settings) setForm({
      accessToken: settings.accessToken ?? "",
      phoneNumberId: settings.phoneNumberId ?? "",
      businessAccountId: settings.businessAccountId ?? "",
      webhookVerifyToken: settings.webhookVerifyToken ?? "kdfnuts_webhook_token",
      isActive: settings.isActive ?? false,
      chatButtonEnabled: settings.chatButtonEnabled ?? false,
      chatButtonPhone: settings.chatButtonPhone ?? "",
      chatButtonMessage: settings.chatButtonMessage ?? "Hi! I'd like to know more about your products.",
      abandonedRecoveryEnabled: settings.abandonedRecoveryEnabled ?? false,
      abandonedRecoveryDelayMinutes: settings.abandonedRecoveryDelayMinutes ?? 45,
      abandonedRecoveryCouponCode: settings.abandonedRecoveryCouponCode ?? "",
      appSecret: settings.appSecret ?? "",
      apiVersion: settings.apiVersion ?? "v18.0",
      businessPortfolioId: settings.businessPortfolioId ?? "",
    });
  }, [settings]);
  const saveSettings = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/settings", { method: "PUT", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/settings"] }); toast({ title: "Settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const handleTest = async () => {
    setIsTesting(true); setTestResult(null);
    try {
      const payload = testUseTemplate
        ? { phone: testPhone, useTemplate: true, templateName: testTemplateName, languageCode: testLangCode, templateParams: testTemplateParams }
        : { phone: testPhone, message: testMsg };
      const r = await apiFetch("/api/admin/whatsapp/test", { method: "POST", body: JSON.stringify(payload) });
      setTestResult(r);
    } catch (e: any) { setTestResult({ success: false, error: e.message }); }
    finally { setIsTesting(false); }
  };
  const handleSyncMetaTemplates = async () => {
    setIsSyncingMeta(true); setMetaSyncError(null);
    try {
      const r = await apiFetch("/api/admin/whatsapp/sync-meta-templates", { method: "POST" });
      if (r.error) setMetaSyncError(r.error);
      else setMetaTemplates(r.templates ?? []);
    } catch (e: any) { setMetaSyncError(e.message); }
    finally { setIsSyncingMeta(false); }
  };
  const handleLoadWebhookLogs = async () => {
    setIsLoadingWebhookLogs(true);
    try {
      const r = await apiFetch("/api/admin/whatsapp/webhook-logs");
      setWebhookLogs(Array.isArray(r) ? r : []);
    } catch { setWebhookLogs([]); }
    finally { setIsLoadingWebhookLogs(false); }
  };
  const handleTestWebhook = async () => {
    setIsTestingWebhook(true); setWebhookTestResult(null);
    try {
      const r = await apiFetch("/api/admin/whatsapp/test-webhook", { method: "POST", body: "{}" });
      setWebhookTestResult(r);
    } catch (e: any) { setWebhookTestResult({ success: false, error: e.message }); }
    finally { setIsTestingWebhook(false); }
  };
  const copyWebhookUrl = () => {
    const url = webhookInfo?.webhookUrl || webhookTestResult?.webhookUrl;
    if (url) { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  /* ── Chatbot Settings ── */
  const { data: chatbotSettings } = useQuery({
    queryKey: ["/api/admin/whatsapp/chatbot-settings"],
    queryFn: () => apiFetch("/api/admin/whatsapp/chatbot-settings").catch(() => null),
    enabled: tab === "chatbot",
  });
  const DEFAULT_MENU_ITEMS: WaMenuItem[] = [
    { id: "shop_products", emoji: "🛒", label: "Shop Products", description: "Browse our premium nuts & dry fruits", sectionTitle: "KDF NUTS Menu", isDefault: true },
    { id: "hot_deals", emoji: "🔥", label: "Hot Deals", description: "Today's special offers and discounts", isDefault: true },
    { id: "get_discount", emoji: "🎁", label: "Get Discount", description: "Claim your exclusive discount code", isDefault: true },
    { id: "track_order", emoji: "📦", label: "Track Order", description: "Check your order status and tracking", isDefault: true },
    { id: "talk_support", emoji: "💬", label: "Talk to Support", description: "Chat with our customer support team", isDefault: true },
    { id: "visit_website", emoji: "🌐", label: "Visit Website", description: "Browse our full product catalog online", isDefault: true },
  ];

  const [chatbotForm, setChatbotForm] = useState({
    isEnabled: false,
    orderingEnabled: false,
    orderContextEnabled: true,
    aiModel: "gpt-4o-mini",
    systemPrompt: "You are a helpful customer support assistant for KDF NUTS, a premium dry fruits and nuts store in Pakistan. Be friendly, concise, and helpful in both English and Urdu. Answer questions about products, orders, shipping, and returns. If order context is provided at the top of this conversation, use it to give accurate, personalised answers about the customer's orders. If you don't know something specific, offer to connect them with the team.",
    fallbackMessage: "Thank you for your message! Our team will get back to you shortly. 🙏",
    replyDelaySec: 30,
    maxDailyReplies: 100,
    menuEnabled: false,
    menuGreetingKeywords: "hi,hello,hey,salam,salaam,asslam,start,menu,help,shop,helo,hii",
    menuItems: null as WaMenuItem[] | null,
    greetingMessage: "",
    catalogEnabled: false,
    catalogMaxProducts: 3,
    websiteUrl: "https://kdfnuts.com",
    discountCode: "WELCOME10",
    discountMessage: "Here's your exclusive discount code! 🎁\n\n*Code:* WELCOME10\n*Save:* 10% on your next order\n\nShop now and use the code at checkout 🛒",
    hotDealsMessage: "🔥 *Today's Hot Deals at KDF NUTS* 🥜\n\nCheck our latest offers on premium nuts and dry fruits!\n\nVisit our website to see all deals 👇",
  });
  useEffect(() => {
    if (chatbotSettings) setChatbotForm({
      isEnabled: chatbotSettings.isEnabled ?? false,
      orderingEnabled: chatbotSettings.orderingEnabled ?? false,
      orderContextEnabled: chatbotSettings.orderContextEnabled ?? true,
      aiModel: chatbotSettings.aiModel ?? "gpt-4o-mini",
      systemPrompt: chatbotSettings.systemPrompt ?? "",
      fallbackMessage: chatbotSettings.fallbackMessage ?? "",
      replyDelaySec: chatbotSettings.replyDelaySec ?? 30,
      maxDailyReplies: chatbotSettings.maxDailyReplies ?? 100,
      menuEnabled: chatbotSettings.menuEnabled ?? false,
      menuGreetingKeywords: chatbotSettings.menuGreetingKeywords ?? "hi,hello,hey,salam,salaam,asslam,start,menu,help,shop,helo,hii",
      menuItems: chatbotSettings.menuItems ?? null,
      greetingMessage: chatbotSettings.greetingMessage ?? "",
      catalogEnabled: chatbotSettings.catalogEnabled ?? false,
      catalogMaxProducts: chatbotSettings.catalogMaxProducts ?? 3,
      websiteUrl: chatbotSettings.websiteUrl ?? "https://kdfnuts.com",
      discountCode: chatbotSettings.discountCode ?? "WELCOME10",
      discountMessage: chatbotSettings.discountMessage ?? "",
      hotDealsMessage: chatbotSettings.hotDealsMessage ?? "",
    });
  }, [chatbotSettings]);

  const { data: chatbotStats } = useQuery({
    queryKey: ["/api/admin/whatsapp/chatbot-stats"],
    queryFn: () => apiFetch("/api/admin/whatsapp/chatbot-stats").catch(() => null),
    enabled: tab === "chatbot",
    refetchInterval: tab === "chatbot" ? 30000 : false,
  });
  const saveChatbot = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/chatbot-settings", { method: "PUT", body: JSON.stringify(chatbotForm) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/chatbot-settings"] }); toast({ title: "Chatbot settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  /* ── Conversations ── */
  const [showTemplatePickerConv, setShowTemplatePickerConv] = useState(false);
  const { data: conversations = [], isLoading: convsLoading, refetch: refetchConvs } = useQuery<any[]>({
    queryKey: ["/api/admin/whatsapp/conversations", convFilter, convSearch],
    queryFn: () => {
      const p = new URLSearchParams();
      if (convFilter !== "all") p.set("status", convFilter);
      if (convSearch.trim()) p.set("search", convSearch.trim());
      return apiFetch(`/api/admin/whatsapp/conversations?${p}`);
    },
    enabled: tab === "conversations",
    refetchInterval: tab === "conversations" ? 20000 : false,
  });
  const { data: approvedTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/whatsapp/templates/approved"],
    queryFn: () => apiFetch("/api/admin/whatsapp/templates/approved").catch(() => []),
    enabled: tab === "conversations",
  });
  const { data: chatMessages = [], isLoading: msgsLoading, refetch: refetchMsgs } = useQuery<any[]>({
    queryKey: ["/api/admin/whatsapp/conversations", selectedPhone],
    queryFn: () => apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone!)}`),
    enabled: !!selectedPhone,
    refetchInterval: selectedPhone ? 8000 : false,
  });

  /* ── Load conversation detail & notes on selection ── */
  useEffect(() => {
    if (!selectedPhone) return;
    apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/detail`)
      .then((d: any) => { setConvDetail(d?.conversation ?? null); setConvNotes(d?.notes ?? []); })
      .catch(() => {});
  }, [selectedPhone]);

  /* ── SSE — real-time incoming messages ── */
  useEffect(() => {
    if (tab !== "conversations") return;
    const token = localStorage.getItem("kdf_admin_token") ?? "";
    const es = new EventSource(`/api/admin/sse?token=${encodeURIComponent(token)}`);
    sseRef.current = es;
    es.addEventListener("wa_message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        refetchConvs();
        if (selectedPhone && data.phone === selectedPhone) refetchMsgs();
      } catch {}
    });
    return () => { es.close(); sseRef.current = null; };
  }, [tab, selectedPhone]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── Toggle bot mode ── */
  const toggleBotMode = async (mode: "auto"|"human"|"off") => {
    if (!selectedPhone) return;
    setBotModeChanging(true);
    try {
      await apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/bot-mode`, {
        method: "PATCH", body: JSON.stringify({ mode }),
      });
      setConvDetail((d: any) => d ? { ...d, bot_mode: mode } : d);
      toast({ title: `Bot mode → ${mode}` });
    } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
    finally { setBotModeChanging(false); }
  };

  /* ── Toggle resolved/open ── */
  const toggleConvStatus = async (status: "open"|"resolved") => {
    if (!selectedPhone) return;
    try {
      await apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/status`, {
        method: "PATCH", body: JSON.stringify({ status }),
      });
      setConvDetail((d: any) => d ? { ...d, status } : d);
      refetchConvs();
      toast({ title: `Marked as ${status}` });
    } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
  };

  /* ── Star conversation ── */
  const toggleStar = async () => {
    if (!selectedPhone) return;
    await apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/star`, { method: "PATCH" });
    setConvDetail((d: any) => d ? { ...d, is_starred: !d.is_starred } : d);
    refetchConvs();
  };

  /* ── Add internal note ── */
  const addNote = async () => {
    if (!noteText.trim() || !selectedPhone) return;
    try {
      await apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/note`, {
        method: "POST", body: JSON.stringify({ note: noteText, agentName }),
      });
      setNoteText(""); setShowNoteInput(false);
      const d = await apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/detail`);
      setConvNotes((d as any)?.notes ?? []);
      toast({ title: "Note saved" });
    } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
  };

  const sendReply = async () => {
    if (!replyMsg.trim() || !selectedPhone) return;
    setIsSendingReply(true);
    try {
      await apiFetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(selectedPhone)}/reply`, {
        method: "POST", body: JSON.stringify({ message: replyMsg, agentName }),
      });
      setReplyMsg("");
      refetchMsgs();
      toast({ title: "Reply sent" });
    } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
    finally { setIsSendingReply(false); }
  };

  /* ── Templates — handled by WhatsAppTemplatesTab component ── */

  /* ── Logs ── */
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["/api/admin/whatsapp/logs"],
    queryFn: () => apiFetch("/api/admin/whatsapp/logs"),
    enabled: tab === "logs",
  });

  /* ── Notification Toggles ── */
  const [notifySettings, setNotifySettings] = useState<Record<string, boolean>>({
    notifyOrderConfirmation: true, notifyOrderProcessing: true, notifyOrderShipped: true,
    notifyOrderOutForDelivery: true, notifyOrderDelivered: true, notifyOrderCancelled: true,
    notifyRestock: true, notifyBiddingWinner: true,
  });
  const { data: notifyData } = useQuery({
    queryKey: ["/api/admin/whatsapp/notification-settings"],
    queryFn: () => apiFetch("/api/admin/whatsapp/notification-settings"),
    enabled: tab === "automations",
  });
  useEffect(() => { if (notifyData && Object.keys(notifyData).length) setNotifySettings(notifyData); }, [notifyData]);
  const saveNotifySettings = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/notification-settings", { method: "PUT", body: JSON.stringify(notifySettings) }),
    onSuccess: () => toast({ title: "Automation settings saved!" }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const seedOrderTemplate = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/templates/seed-order-confirmation", { method: "POST" }),
    onSuccess: (d: any) => toast({ title: d.alreadyExists ? "Template already exists" : "Template created!", description: d.message }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Event Template Status ── */
  const { data: eventTemplates = {}, refetch: refetchEventTemplates } = useQuery<Record<string, any>>({
    queryKey: ["/api/admin/whatsapp/templates/by-event"],
    queryFn: () => apiFetch("/api/admin/whatsapp/templates/by-event").catch(() => ({})),
    enabled: tab === "automations",
  });
  const seedAllTemplates = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/templates/seed-all-templates", { method: "POST" }),
    onSuccess: (d: any) => { refetchEventTemplates(); toast({ title: "Templates ready!", description: d.message }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const retryLogMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/whatsapp/logs/${id}/retry`, { method: "POST" }),
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/logs"] }); toast({ title: d.success ? "Message retried!" : "Retry sent (check delivery)" }); },
    onError: (e: any) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });

  /* ── Chat Sessions ── */
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const { data: chatSessions = [], isLoading: sessionsLoading, refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ["/api/admin/chat/sessions"],
    queryFn: () => apiFetch("/api/admin/chat/sessions"),
    enabled: tab === "chatbot",
    refetchInterval: tab === "chatbot" ? 30000 : false,
  });

  /* ── WA Flows (Phase 4 — AI Flow Builder) ── */
  const FLOW_ACTIONS = [
    { value: "ai_reply", label: "🤖 AI Reply", desc: "Let AI handle the conversation" },
    { value: "send_menu", label: "📋 Show Menu", desc: "Display the interactive welcome menu" },
    { value: "send_message", label: "💬 Send Message", desc: "Send a custom fixed message" },
    { value: "send_url", label: "🌐 Send URL", desc: "Share a link with optional button" },
    { value: "send_discount", label: "🎁 Send Discount", desc: "Send a discount code" },
    { value: "track_order", label: "📦 Track Order", desc: "Prompt for order ID and look it up" },
    { value: "human_support", label: "👤 Human Support", desc: "Hand off to human agent" },
    { value: "collect_order_id", label: "🔖 Collect Order ID", desc: "Ask customer for their order ID then auto-look up" },
    { value: "show_catalog", label: "🛍️ Show Catalog", desc: "Send top products with buy links" },
  ];
  const EMPTY_FLOW = { name: "", description: "", triggerType: "keyword", keywords: [] as string[], action: "ai_reply", actionData: {} as any, isEnabled: true, priority: 0 };
  const [showFlowForm, setShowFlowForm] = useState(false);
  const [editingFlow, setEditingFlow] = useState<any>(null);
  const [newFlow, setNewFlow] = useState<any>(EMPTY_FLOW);
  const [newFlowKeyword, setNewFlowKeyword] = useState("");
  const [testingFlowId, setTestingFlowId] = useState<number | null>(null);
  const [flowTestInput, setFlowTestInput] = useState("");
  const [flowTestResult, setFlowTestResult] = useState<any>(null);
  const testFlow = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      apiFetch(`/api/admin/wa/flows/${id}/test`, { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: (r: any) => setFlowTestResult(r),
    onError: (e: any) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  const { data: waFlows = [], refetch: refetchFlows } = useQuery<any[]>({
    queryKey: ["/api/admin/wa/flows"],
    queryFn: () => apiFetch("/api/admin/wa/flows"),
    enabled: tab === "flows",
  });
  const createFlow = useMutation({
    mutationFn: (data: any) => apiFetch("/api/admin/wa/flows", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { refetchFlows(); setShowFlowForm(false); setNewFlow(EMPTY_FLOW); toast({ title: "Flow created!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateFlow = useMutation({
    mutationFn: ({ id, ...data }: any) => apiFetch(`/api/admin/wa/flows/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { refetchFlows(); setEditingFlow(null); toast({ title: "Flow updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const toggleFlow = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/wa/flows/${id}/toggle`, { method: "PATCH" }),
    onSuccess: () => refetchFlows(),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteFlow = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/wa/flows/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetchFlows(); toast({ title: "Flow deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Campaigns ── */
  const EMPTY_CAMPAIGN = { name: "", type: "custom", messageBody: "", templateId: "", templateParams: [] as string[], useTemplate: false, audience: "all_customers", audienceFilter: "", customPhones: "", rateLimitDelay: 2, maxDelay: 5, frequencyCapHours: 24, scheduledAt: "" };
  const [newCampaign, setNewCampaign] = useState(EMPTY_CAMPAIGN);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const { data: campaigns = [], refetch: refetchCampaigns } = useQuery<any[]>({
    queryKey: ["/api/admin/whatsapp/campaigns"],
    queryFn: () => apiFetch("/api/admin/whatsapp/campaigns"),
    enabled: tab === "campaigns",
    refetchInterval: tab === "campaigns" ? 5000 : false,
  });
  const { data: campaignTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/whatsapp/templates/approved"],
    queryFn: () => apiFetch("/api/admin/whatsapp/templates/approved").catch(() => []),
    enabled: tab === "campaigns",
  });
  const createCampaign = useMutation({
    mutationFn: (data: any) => apiFetch("/api/admin/whatsapp/campaigns", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { refetchCampaigns(); setShowCampaignForm(false); setNewCampaign(EMPTY_CAMPAIGN); toast({ title: "Campaign created!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/whatsapp/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetchCampaigns(); toast({ title: "Campaign deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const sendCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/whatsapp/campaigns/${id}/send`, { method: "POST" }),
    onSuccess: (d: any) => { refetchCampaigns(); toast({ title: "Campaign launched!", description: d.message }); },
    onError: (e: any) => toast({ title: "Launch failed", description: e.message, variant: "destructive" }),
  });
  const pauseCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/wa/campaigns/${id}/pause`, { method: "POST" }),
    onSuccess: () => { refetchCampaigns(); toast({ title: "Campaign paused" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const resumeCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/wa/campaigns/${id}/resume`, { method: "POST" }),
    onSuccess: () => { refetchCampaigns(); toast({ title: "Campaign resumed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const cancelCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/wa/campaigns/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { refetchCampaigns(); toast({ title: "Campaign cancelled" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const duplicateCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/whatsapp/campaigns/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => { refetchCampaigns(); toast({ title: "Campaign duplicated!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const { data: audienceCount } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/whatsapp/campaigns/audience-count", newCampaign.audience, newCampaign.audienceFilter],
    queryFn: () => apiFetch(`/api/admin/whatsapp/campaigns/audience-count?audience=${newCampaign.audience}&filter=${encodeURIComponent(newCampaign.audienceFilter)}`),
    enabled: tab === "campaigns" && showCampaignForm && newCampaign.audience !== "custom_phones",
    staleTime: 30_000,
  });

  /* ── Analytics + Cost Data ── */
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const { data: costStats, isLoading: costLoading, refetch: refetchCostStats } = useQuery<any>({
    queryKey: ["/api/admin/wa/cost-stats", analyticsDays],
    queryFn: () => apiFetch(`/api/admin/wa/cost-stats?days=${analyticsDays}`),
    enabled: tab === "analytics",
    staleTime: 60_000,
  });
  const { data: chatbotAnalytics } = useQuery<any>({
    queryKey: ["/api/admin/wa/analytics/chatbot", analyticsDays],
    queryFn: () => apiFetch(`/api/admin/wa/analytics/chatbot?days=${analyticsDays}`),
    enabled: tab === "analytics",
    staleTime: 60_000,
  });

  /* ── Smart Automation Rules ── */
  const { data: autoRules = [], refetch: refetchRules } = useQuery<any[]>({
    queryKey: ["/api/admin/wa/automation/rules"],
    queryFn: () => apiFetch("/api/admin/wa/automation/rules"),
    enabled: tab === "rules",
  });
  const { data: autoStats } = useQuery<any>({
    queryKey: ["/api/admin/wa/automation/stats"],
    queryFn: () => apiFetch("/api/admin/wa/automation/stats"),
    enabled: tab === "rules",
  });
  const { data: autoLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/wa/automation/logs"],
    queryFn: () => apiFetch("/api/admin/wa/automation/logs?limit=50"),
    enabled: tab === "rules",
    refetchInterval: tab === "rules" ? 30000 : false,
  });
  const RULE_TEMPLATES = [
    { id: "cart_abandoned", label: "🛒 Abandoned Cart Recovery", desc: "Message customers who left items in cart", defaultDelay: 60, defaultCoupon: "SAVE10" },
    { id: "order_delivered", label: "⭐ Post-Delivery Review Request", desc: "Ask for review after delivery + optional coupon", defaultDelay: 24, defaultCoupon: "THANKYOU10" },
    { id: "order_failed_delivery", label: "🔔 Failed Delivery Follow-up", desc: "Notify customer when delivery failed", defaultDelay: 2, defaultCoupon: "" },
    { id: "customer_inactive", label: "💤 Inactive Customer Re-engagement", desc: "Win back customers who haven't ordered in a while", defaultDelay: 30, defaultCoupon: "COMEBACK15" },
  ];
  const EMPTY_RULE = { name: "", triggerType: "cart_abandoned", triggerConfig: { delayMinutes: 60, couponCode: "" }, messageTemplate: "", isActive: true };
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [newRule, setNewRule] = useState<any>(EMPTY_RULE);
  const [editingRule, setEditingRule] = useState<any>(null);
  const createRule = useMutation({
    mutationFn: (data: any) => apiFetch("/api/admin/wa/automation/rules", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { refetchRules(); setShowRuleForm(false); setNewRule(EMPTY_RULE); toast({ title: "Rule created!" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const updateRule = useMutation({
    mutationFn: ({ id, ...data }: any) => apiFetch(`/api/admin/wa/automation/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { refetchRules(); setEditingRule(null); toast({ title: "Rule updated" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const toggleRule = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/wa/automation/rules/${id}/toggle`, { method: "PATCH" }),
    onSuccess: () => refetchRules(),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteRule = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/wa/automation/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { refetchRules(); toast({ title: "Rule deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /* ── Auto-resolve WABA+Phone from token ── */
  const [isResolving, setIsResolving] = useState(false);
  const handleResolveFromToken = async () => {
    if (!form.accessToken) {
      toast({ title: "Paste your Access Token first", variant: "destructive" });
      return;
    }
    setIsResolving(true);
    try {
      const res = await apiFetch("/api/admin/whatsapp/resolve-from-token", {
        method: "POST",
        body: JSON.stringify({ token: form.accessToken }),
      });
      if (res.success && (res.phoneId || res.wabaId)) {
        setForm(f => ({
          ...f,
          phoneNumberId: res.phoneId ?? f.phoneNumberId,
          businessAccountId: res.wabaId ?? f.businessAccountId,
        }));
        toast({
          title: "IDs resolved automatically!",
          description: `Phone ID: ${res.phoneId ?? "not found"} · WABA ID: ${res.wabaId ?? "not found"}${res.wabaName ? ` · ${res.wabaName}` : ""}`,
        });
      } else if (res.allWabas?.length === 0) {
        toast({
          title: "No WABA found for this token",
          description: "Make sure the System User token has whatsapp_business_messaging and whatsapp_business_management permissions and is assigned to the WABA.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Partial result — check fields",
          description: res.error ?? "Some IDs could not be auto-detected. Fill them in manually.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Resolve failed", description: e.message, variant: "destructive" });
    } finally {
      setIsResolving(false);
    }
  };

  /* ── Debug ── */
  const [connStatus, setConnStatus] = useState<{ success?: boolean; status?: string; message?: string; data?: any } | null>(null);
  const testConnection = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/test-connection", { method: "POST" }),
    onSuccess: (d: any) => { setConnStatus(d); if (d.success) toast({ title: "Connected!", description: d.message }); else toast({ title: "Connection failed", description: d.message, variant: "destructive" }); },
    onError: (e: any) => { setConnStatus({ success: false, status: "error", message: e.message }); toast({ title: "Connection error", description: e.message, variant: "destructive" }); },
  });

  /* ── Connect & Disconnect ── */
  const [isSavingAndConnecting, setIsSavingAndConnecting] = useState(false);
  const handleSaveAndConnect = async () => {
    setIsSavingAndConnecting(true);
    try {
      const updatedForm = { ...form, isActive: true };
      await apiFetch("/api/admin/whatsapp/settings", { method: "PUT", body: JSON.stringify(updatedForm) });
      setForm(updatedForm);
      qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/settings"] });
      const result = await apiFetch("/api/admin/whatsapp/test-connection", { method: "POST" });
      setConnStatus(result);
      if (result.success) {
        toast({ title: "WhatsApp Connected!", description: result.message });
      } else {
        toast({ title: "Credentials saved, but connection failed", description: result.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSavingAndConnecting(false);
    }
  };
  const handleDisconnect = async () => {
    const updatedForm = { ...form, isActive: false };
    setForm(updatedForm);
    setConnStatus(null);
    try {
      await apiFetch("/api/admin/whatsapp/settings", { method: "PUT", body: JSON.stringify(updatedForm) });
      qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/settings"] });
      toast({ title: "WhatsApp Disconnected", description: "Integration paused. Your credentials are saved." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  /* ── Meta Embedded Signup ── */
  const [isConnectingMeta, setIsConnectingMeta] = useState(false);
  const [metaLoginError, setMetaLoginError] = useState<"feature_unavailable" | "cancelled" | null>(null);
  const metaEmbeddedDataRef = useRef<{ phone_number_id?: string; waba_id?: string } | null>(null);

  const { data: metaConfig } = useQuery<{ appId: string | null; configId: string | null; isConfigured: boolean }>({
    queryKey: ["/api/admin/whatsapp/meta-config"],
    queryFn: () => apiFetch("/api/admin/whatsapp/meta-config"),
    staleTime: Infinity,
  });

  const { data: existingWaba } = useQuery<{
    hasExisting: boolean;
    wabaId?: string;
    wabaName?: string | null;
    phoneNumberId?: string | null;
    phoneDisplay?: string | null;
    verifiedName?: string | null;
    connectionMethod?: string | null;
  }>({
    queryKey: ["/api/admin/whatsapp/meta-existing-waba"],
    queryFn: () => apiFetch("/api/admin/whatsapp/meta-existing-waba"),
    staleTime: 60_000,
  });

  const exchangeMetaToken = useMutation({
    mutationFn: (payload: { code: string; wabaId?: string; phoneNumberId?: string }) =>
      apiFetch("/api/admin/whatsapp/meta-exchange-token", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (d: any) => {
      setIsConnectingMeta(false);
      if (d.success) {
        setConnStatus({
          success: true, status: "connected",
          message: `Connected — ${d.displayPhone ?? d.phoneNumberId}`,
          data: {
            display_phone_number: d.displayPhone,
            verified_name: d.verifiedName,
            quality_rating: d.qualityRating,
            status: d.status,
            business_name: d.businessName,
            waba_id: d.wabaId,
          },
        });
        qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/settings"] });
        toast({ title: "WhatsApp Connected via Meta!", description: `${d.verifiedName ?? d.displayPhone} is now active.` });
      } else {
        toast({ title: "Connection failed", description: d.error, variant: "destructive" });
      }
    },
    onError: (e: any) => { setIsConnectingMeta(false); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  /* Always default to manual — Embedded Signup doesn't work for self-owned WABAs */
  useEffect(() => {
    if (metaConfig !== undefined && !metaConfig?.isConfigured) {
      setConnMethod("manual");
    }
  }, [metaConfig]);

  const loadFbSdk = useCallback((appId: string): Promise<void> => {
    return new Promise((resolve) => {
      if (window.FB) { resolve(); return; }
      window.fbAsyncInit = () => {
        window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: "v24.0" });
        resolve();
      };
      if (!document.getElementById("facebook-jssdk")) {
        const s = document.createElement("script");
        s.id = "facebook-jssdk";
        s.src = "https://connect.facebook.net/en_US/sdk.js";
        s.async = true; s.defer = true; s.crossOrigin = "anonymous";
        document.body.appendChild(s);
        s.onerror = () => resolve();
      }
    });
  }, []);

  const handleEmbeddedSignup = async () => {
    if (!metaConfig?.appId || !metaConfig?.configId) return;
    setIsConnectingMeta(true);
    setMetaLoginError(null);
    metaEmbeddedDataRef.current = null;

    /* Track whether the popup was closed quickly (< 3 s) — a sign of "Feature unavailable" */
    const popupOpenedAt = Date.now();

    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP") metaEmbeddedDataRef.current = data.data ?? {};
      } catch {}
    };
    window.addEventListener("message", messageHandler);

    try {
      await loadFbSdk(metaConfig.appId);

      /* Always use phone_zero_step_signup so Meta presents existing WABA / phone
         selection rather than forcing "Create new account".
         This is the correct featureType for attaching existing business assets. */
      const loginParams: Record<string, any> = {
        config_id: metaConfig.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          version: 2,
          sessionInfoVersion: 3,
          featureType: "phone_zero_step_signup",
          sessionId: `kdfnuts_${Date.now()}`,
        },
      };

      window.FB.login((response: any) => {
        window.removeEventListener("message", messageHandler);
        if (response?.authResponse?.code) {
          setMetaLoginError(null);
          const { phone_number_id, waba_id } = metaEmbeddedDataRef.current ?? {};
          /* Prefer IDs returned by the signup event; fall back to what we already have saved */
          exchangeMetaToken.mutate({
            code: response.authResponse.code,
            wabaId:        waba_id        ?? existingWaba?.wabaId,
            phoneNumberId: phone_number_id ?? existingWaba?.phoneNumberId ?? undefined,
          });
        } else {
          setIsConnectingMeta(false);
          /* If popup closed in < 4 seconds without a code, Meta showed "Feature unavailable"
             (Development mode / missing Privacy Policy / App Icon etc.) */
          const elapsed = Date.now() - popupOpenedAt;
          if (elapsed < 4000) {
            setMetaLoginError("feature_unavailable");
            toast({
              title: "Meta App is not Live",
              description: 'Meta showed "Feature unavailable — Facebook Login is currently unavailable for this app". Your app is in Development mode or missing required fields. Run the Health Check below to see exactly what needs fixing.',
              variant: "destructive",
            });
          } else {
            setMetaLoginError("cancelled");
            toast({ title: "Cancelled", description: "Meta login was closed without completing." });
          }
        }
      }, loginParams);
    } catch (e: any) {
      window.removeEventListener("message", messageHandler);
      setIsConnectingMeta(false);
      toast({ title: "Error loading Meta SDK", description: e.message, variant: "destructive" });
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "settings",      label: "API Settings",    icon: Settings },
    { id: "analytics",     label: "Analytics",       icon: TrendingUp },
    { id: "rules",         label: "Smart Rules",     icon: Zap },
    { id: "flows",         label: "AI Flows",        icon: GitBranch },
    { id: "automations",   label: "Automations",     icon: CheckSquare },
    { id: "campaigns",     label: "Campaigns",       icon: Megaphone },
    { id: "recovery",      label: "Auto Recovery",   icon: RotateCcw },
    { id: "chatbot",       label: "AI Chatbot",      icon: Bot },
    { id: "conversations", label: "Conversations",   icon: MessageCircle },
    { id: "templates",     label: "Templates",       icon: FileText },
    { id: "logs",          label: "Message Logs",    icon: Phone },
    { id: "qr",            label: "QR Code",         icon: QrCode },
    { id: "debug",         label: "Debug Panel",     icon: Bug },
  ];

  const SaveBar = () => (
    <div className="flex gap-3 pt-2">
      <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
        {saveSettings.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Settings"}
      </Button>
    </div>
  );

  function msgBubble(msg: any) {
    /* Support both old whatsapp_logs schema and new wa_messages schema */
    const direction  = msg.direction ?? (msg.templateName === "incoming" ? "in" : "out");
    const msgType    = msg.type ?? "text";
    const content    = msg.content ?? msg.message ?? "";
    const isIncoming = direction === "in";
    const isAI       = msg.isBot || msg.templateName === "ai_reply";
    const isAdmin    = !isAI && !isIncoming;
    const ts         = msg.createdAt ?? msg.created_at;
    const reaction   = msg.reaction;
    const mediaUrl   = msg.media_url ?? msg.mediaUrl;
    const caption    = msg.caption;
    const agentLabel = msg.agent_name ?? (isAI ? "AI" : isAdmin ? "Admin" : null);

    const renderContent = () => {
      if (reaction) return <span className="text-2xl">{reaction}</span>;
      switch (msgType) {
        case "image":
          return (
            <div>
              {mediaUrl ? (
                <div className="rounded-xl overflow-hidden mb-1 bg-black/10 flex items-center justify-center w-48 h-32">
                  <span className="text-xs text-muted-foreground">🖼 Image</span>
                </div>
              ) : <span className="text-xs opacity-70">🖼 Image (no preview)</span>}
              {caption && <p className="text-xs mt-1">{caption}</p>}
            </div>
          );
        case "video":
          return <span className="text-sm">🎬 Video{caption ? ` — ${caption}` : ""}</span>;
        case "audio":
        case "voice":
          return (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">🎤</div>
              <div>
                <p className="text-xs font-medium">Voice note</p>
                <p className="text-[10px] opacity-70">Tap to play</p>
              </div>
            </div>
          );
        case "document":
          return <span className="text-sm">📄 Document{caption ? ` — ${caption}` : ""}</span>;
        case "sticker":
          return <span className="text-sm">🎭 Sticker</span>;
        case "location":
          return <span className="text-sm">{content}</span>;
        default:
          return <span className="whitespace-pre-wrap">{content}</span>;
      }
    };

    return (
      <div key={msg.id} className={`flex gap-2 ${isIncoming ? "justify-start" : "justify-end"}`}>
        {isIncoming && (
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1">
            <User className="w-3.5 h-3.5 text-gray-600" />
          </div>
        )}
        <div className={`max-w-[70%] ${isIncoming ? "" : "items-end flex flex-col"}`}>
          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isIncoming ? "bg-white border border-border text-gray-800 rounded-tl-sm" :
            isAI       ? "bg-[#5FA800] text-white rounded-tr-sm" :
                         "bg-gray-800 text-white rounded-tr-sm"
          }`}>
            {renderContent()}
          </div>
          <div className="flex items-center gap-1.5 mt-1 px-1">
            {isAI    && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" />AI</span>}
            {agentLabel && !isIncoming && <span className="text-[10px] text-muted-foreground">{agentLabel}</span>}
            <span className="text-[10px] text-muted-foreground">
              {ts ? new Date(ts).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }) : ""}
            </span>
            {!isIncoming && (
              <span className={`text-[10px] ${msg.status === "sent" || msg.status === "delivered" ? "text-green-500" : msg.status === "failed" ? "text-red-400" : "text-gray-400"}`}>
                {msg.status === "delivered" ? "✓✓" : msg.status === "sent" ? "✓" : msg.status === "failed" ? "✗" : "⏳"}
              </span>
            )}
          </div>
        </div>
        {!isIncoming && (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${isAI ? "bg-[#5FA800]/20" : "bg-gray-200"}`}>
            {isAI ? <Sparkles className="w-3.5 h-3.5 text-[#5FA800]" /> : <User className="w-3.5 h-3.5 text-gray-600" />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-[#25D366]" />
          WhatsApp Integration
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Meta WhatsApp Business API — automated messages, AI chatbot, cart recovery, and live conversations.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === id ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" />{label}
            {id === "chatbot" && chatbotForm.isEnabled && <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-0.5" />}
          </button>
        ))}
      </div>

      {/* ── SETTINGS TAB (WhatsApp Business Integration Module) ── */}
      {tab === "settings" && (
        <div className="space-y-5">

          {/* ══ CONNECTION STATUS HERO ══ */}
          <div className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Dark green header */}
            <div className="flex items-center gap-4 px-6 py-5" style={{ background: "linear-gradient(135deg, #075e54 0%, #128c7e 100%)" }}>
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-white font-bold text-lg">WhatsApp Business Integration</h2>
                <p className="text-[#a8e6cf] text-sm mt-0.5">Meta Cloud API — Official Business Messaging Platform</p>
              </div>
              {/* Status badge — reads from DB + live test */}
              {(() => {
                const hasLiveSuccess = form.isActive && connStatus?.success;
                const hasDbCreds = form.isActive && !!(settings?.accessToken && settings?.phoneNumberId);
                const hasAuthError = form.isActive && connStatus && !connStatus.success;
                const hasSavedCreds = !!(form.accessToken && form.phoneNumberId);
                if (hasLiveSuccess || hasDbCreds) return (
                  <span className="shrink-0 flex items-center gap-1.5 bg-green-400/20 text-green-200 border border-green-400/30 px-3 py-1.5 rounded-full text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Connected
                  </span>
                );
                if (hasAuthError) return (
                  <span className="shrink-0 flex items-center gap-1.5 bg-red-400/20 text-red-200 border border-red-400/30 px-3 py-1.5 rounded-full text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-red-400" /> Auth Error
                  </span>
                );
                if (hasSavedCreds) return (
                  <span className="shrink-0 flex items-center gap-1.5 bg-yellow-400/20 text-yellow-200 border border-yellow-400/30 px-3 py-1.5 rounded-full text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" /> Credentials Saved
                  </span>
                );
                return (
                  <span className="shrink-0 flex items-center gap-1.5 bg-red-400/20 text-red-200 border border-red-400/30 px-3 py-1.5 rounded-full text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-red-400" /> Not Connected
                  </span>
                );
              })()}
            </div>

            {/* Connected info panel — shows from DB fields + live test result */}
            {(form.isActive || connStatus?.success) && (settings?.verifiedName || settings?.phoneNumberId || connStatus?.data) && (
              <div className="px-6 py-4 bg-green-50 border-b border-green-100">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Phone Number</p>
                    <p className="text-lg font-bold text-green-900 font-mono">
                      {connStatus?.data?.display_phone_number ?? settings?.phoneNumberId ?? form.phoneNumberId ?? "—"}
                    </p>
                  </div>
                  {(connStatus?.data?.verified_name ?? settings?.verifiedName) && (
                    <div>
                      <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Business Name</p>
                      <p className="text-lg font-bold text-green-900">{connStatus?.data?.verified_name ?? settings?.verifiedName}</p>
                    </div>
                  )}
                  {(connStatus?.data?.quality_rating ?? settings?.qualityRating) && (() => {
                    const qr = connStatus?.data?.quality_rating ?? settings?.qualityRating;
                    return (
                      <div>
                        <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Quality Rating</p>
                        <p className={`text-base font-bold ${qr === "GREEN" ? "text-green-700" : qr === "YELLOW" ? "text-yellow-700" : "text-red-700"}`}>
                          {qr === "GREEN" ? "🟢" : qr === "YELLOW" ? "🟡" : "🔴"} {qr}
                        </p>
                      </div>
                    );
                  })()}
                  {settings?.connectionMethod && (
                    <div>
                      <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Connection Method</p>
                      <p className="text-sm font-bold text-green-900">
                        {settings.connectionMethod === "embedded_signup" ? "Via Meta (Official)" : "Manual API Setup"}
                      </p>
                    </div>
                  )}
                  {settings?.connectedAt && (
                    <div>
                      <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">Connected Since</p>
                      <p className="text-sm font-bold text-green-900">
                        {new Date(settings.connectedAt).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  )}
                  <div className="ml-auto">
                    <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 border border-green-300 px-3 py-1.5 rounded-full text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified with Meta
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Error panel */}
            {connStatus && !connStatus.success && (
              <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700 capitalize">{connStatus.status?.replace(/_/g, " ")}</p>
                  <p className="text-xs text-red-600 mt-0.5">{connStatus.message}</p>
                  {connStatus.status === "invalid_token" && <p className="text-xs text-red-500 mt-1">→ Your Access Token has expired. Generate a new Permanent Token from Meta Business Manager → System Users.</p>}
                  {connStatus.status === "invalid_phone_id" && <p className="text-xs text-red-500 mt-1">→ Phone Number ID is incorrect. Find it in Meta Developer Portal → WhatsApp → Getting Started.</p>}
                </div>
              </div>
            )}

            {/* Action buttons bar */}
            <div className="px-6 py-4 bg-card border-t border-border">
              <div className="flex flex-wrap gap-3 items-center">
                {/* Connect / Reconnect via Meta */}
                {metaConfig?.isConfigured && (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={handleEmbeddedSignup}
                      disabled={isConnectingMeta || exchangeMetaToken.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
                    >
                      {isConnectingMeta || exchangeMetaToken.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      }
                      {form.isActive && (connStatus?.success || settings?.accessToken) ? "Reconnect with Meta" : "Connect with Meta"}
                    </button>
                    <p className="text-[10px] text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Error aa raha hai? Scroll down karein — domain fix instructions hain
                    </p>
                  </div>
                )}
                {/* Disconnect */}
                {form.isActive && (
                  <button
                    onClick={handleDisconnect}
                    disabled={isConnectingMeta || isSavingAndConnecting}
                    className="flex items-center gap-2 px-5 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 font-semibold rounded-xl text-sm transition-colors"
                  >
                    <WifiOff className="w-4 h-4" /> Disconnect
                  </button>
                )}
                {/* Test Connection */}
                {(form.accessToken && form.phoneNumberId) && (
                  <button
                    onClick={() => testConnection.mutate()}
                    disabled={testConnection.isPending}
                    className="flex items-center gap-2 px-4 py-2.5 border border-border hover:bg-muted text-sm font-medium rounded-xl transition-colors"
                  >
                    {testConnection.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Test Connection
                  </button>
                )}
                {/* Integration Active toggle */}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Integration Active</span>
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
                </div>
              </div>
            </div>
          </div>

          {/* ══ CHOOSE INTEGRATION METHOD ══ */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Wifi className="w-4 h-4 text-[#25D366]" />
                Choose Integration Method
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Select how you want to connect your WhatsApp Business Account to Meta Cloud API</p>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Method toggle cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Manual — Recommended for self-owned WABAs */}
                <button
                  onClick={() => setConnMethod("manual")}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${connMethod === "manual" ? "border-[#25D366] bg-[#25D366]/5" : "border-border bg-card hover:bg-muted/30"}`}
                >
                  {connMethod === "manual" && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </span>
                  )}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${connMethod === "manual" ? "bg-[#25D366]/10 border border-[#25D366]/30" : "bg-muted border border-border"}`}>
                    <ShieldCheck className={`w-5 h-5 ${connMethod === "manual" ? "text-[#25D366]" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-semibold text-sm ${connMethod === "manual" ? "text-[#25D366]" : "text-foreground"}`}>Manual — System User Token</p>
                      <span className="text-[10px] font-bold bg-[#25D366] text-white px-1.5 py-0.5 rounded-full">Recommended for you</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Paste your permanent System User token → click "Auto-Resolve IDs" to auto-fill Phone ID &amp; WABA ID. Works with any existing WABA you already own.</p>
                  </div>
                </button>

                {/* Meta Embedded Signup — for 3rd-party onboarding only */}
                <button
                  onClick={() => setConnMethod("meta")}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${connMethod === "meta" ? "border-slate-400 bg-slate-50" : "border-border bg-card hover:bg-muted/30"}`}
                >
                  {connMethod === "meta" && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-slate-500 flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-semibold text-sm ${connMethod === "meta" ? "text-slate-700" : "text-muted-foreground"}`}>Meta Embedded Signup</p>
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">Not for app-owners</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Designed for SaaS vendors onboarding <em>other businesses'</em> WABAs. Will not work if your WABA is already owned by the same business that created this Meta App.</p>
                  </div>
                </button>
              </div>

              {/* ── METHOD PANEL ── */}
              {connMethod === "meta" ? (
                /* ── META OFFICIAL (EMBEDDED SIGNUP) ── */
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1877F2] flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Connect via Meta — Official Embedded Signup</p>
                      <p className="text-xs text-blue-700 mt-0.5">Click Connect to open a secure Meta popup. Meta will show your <strong>existing</strong> WhatsApp Business Accounts and phone numbers for selection — no new account will be created. Credentials are fetched and saved automatically.</p>
                    </div>
                  </div>
                  <div className="px-5 py-5 space-y-4">
                    {/* ── Why this doesn't work for self-owned WABAs ── */}
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-red-800">Why "KHAN DRY FRUITS" is greyed out</p>
                          <p className="text-xs text-red-700 mt-1 leading-relaxed">
                            This is a <strong>Meta policy restriction</strong>, not a configuration bug. Embedded Signup is designed for SaaS vendors onboarding <em>other businesses'</em> WABAs. Because this Meta App was created inside the <strong>KDF MART</strong> business portfolio (owned by <strong>KHAN DRY FRUITS</strong>), Meta intentionally prevents you from using your own app to onboard yourself — it detects circular ownership and blocks it.
                          </p>
                          <p className="text-xs text-red-700 mt-1.5 leading-relaxed font-medium">
                            Solution: Switch to "Manual — System User Token" (the left card above). That is the correct official path for connecting your own WABA.
                          </p>
                        </div>
                      </div>
                    </div>
                    {metaConfig?.isConfigured ? (
                      <>
                        {/* ── Existing WABA detected card ── */}
                        {existingWaba?.hasExisting && existingWaba.wabaId && (
                          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0 text-xs">
                              <p className="font-semibold text-emerald-800">Existing WhatsApp Business Account Detected</p>
                              <p className="text-emerald-700 mt-0.5">
                                Reconnecting will use your existing account — no new WABA will be created.
                              </p>
                              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-emerald-700">
                                {existingWaba.wabaName   && <span><span className="font-medium">Business:</span> {existingWaba.wabaName}</span>}
                                {existingWaba.phoneDisplay && <span><span className="font-medium">Phone:</span> {existingWaba.phoneDisplay}</span>}
                                {existingWaba.verifiedName && <span><span className="font-medium">Name:</span> {existingWaba.verifiedName}</span>}
                                <span className="font-mono opacity-60">WABA: {existingWaba.wabaId.slice(-8)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          {([
                            { step: "1", title: "Click Connect", desc: "Opens secure Meta login popup" },
                            { step: "2", title: "Select Existing WABA", desc: "Choose KDF MART / KHAN DRY FRUITS — existing assets shown" },
                            { step: "3", title: "Select Phone Number", desc: "Attach your existing number — no new account created" },
                          ]).map(s => (
                            <div key={s.step} className="flex items-start gap-2.5 p-3 bg-muted/30 rounded-lg border border-border">
                              <span className="w-5 h-5 rounded-full bg-[#1877F2]/10 text-[#1877F2] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</span>
                              <div>
                                <p className="font-semibold text-foreground">{s.title}</p>
                                <p className="text-muted-foreground">{s.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* ── Domain Whitelist Warning ── */}
                        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-orange-800">Meta App Domain Whitelist Required</p>
                              <p className="text-[11px] text-orange-700 mt-0.5 leading-relaxed">
                                Agar <strong>"JSSDK Unknown Host domain"</strong> error aa raha hai, toh apne Meta App Dashboard mein yeh domains add karein:
                              </p>
                            </div>
                          </div>
                          <div className="bg-white border border-orange-100 rounded-lg p-2.5 space-y-1 font-mono text-[11px]">
                            <p className="text-gray-700 select-all">abadryfruits.com</p>
                            <p className="text-gray-700 select-all">khanbabadryfruits.com</p>
                            <p className="text-gray-700 select-all">admin.khanbabadryfruits.com</p>
                            {!["abadryfruits.com","khanbabadryfruits.com","admin.khanbabadryfruits.com"].includes(window.location.hostname) && (
                              <p className="text-gray-500 select-all">{window.location.hostname}</p>
                            )}
                          </div>
                          <div className="text-[11px] text-orange-700 leading-relaxed space-y-0.5">
                            <p className="font-semibold">Steps to fix:</p>
                            <p>1. <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener" className="underline font-medium">developers.facebook.com/apps</a> → Apna App open karein</p>
                            <p>2. Left sidebar → <strong>Facebook Login for Business</strong> → <strong>Settings</strong></p>
                            <p>3. <strong>"Allowed Domains for the JavaScript SDK"</strong> mein upar wale domains add karein</p>
                            <p>4. Changes save karein, phir dobara "Connect with Meta" click karein</p>
                          </div>
                        </div>

                        {/* ── "Feature unavailable" error banner ── */}
                        {metaLoginError === "feature_unavailable" && (
                          <div className="border-2 border-red-400 bg-red-50 rounded-xl overflow-hidden">
                            {/* Header */}
                            <div className="px-4 py-3 bg-red-600 flex items-center gap-2.5">
                              <XCircle className="w-5 h-5 text-white shrink-0" />
                              <p className="text-sm font-bold text-white">Meta App is not Live — "Feature unavailable" error detected</p>
                            </div>
                            <div className="px-4 py-4 space-y-3">
                              <p className="text-xs text-red-800 leading-relaxed">
                                Meta showed <strong>"Facebook Login is currently unavailable for this app as we are updating additional details"</strong>. This is not a code bug — your Meta App (ID: <code className="font-mono bg-red-100 px-1 rounded">{metaConfig?.appId ?? "890613233206413"}</code>) is either in <strong>Development mode</strong> or missing required fields. Fix these in the Meta Developer Portal:
                              </p>

                              {/* Checklist of required fixes */}
                              <div className="space-y-2">
                                {[
                                  {
                                    num: "1", urgent: true,
                                    label: "Switch app to LIVE mode",
                                    desc: 'Top-right toggle in your Meta App dashboard. Development mode = only app admins/developers can log in.',
                                    url: `https://developers.facebook.com/apps/${metaConfig?.appId ?? "890613233206413"}/dashboard/`,
                                    linkLabel: "Open App Dashboard →",
                                  },
                                  {
                                    num: "2", urgent: true,
                                    label: "Add Privacy Policy URL",
                                    desc: 'Settings → Basic → Privacy Policy URL. Required before switching to Live.',
                                    url: `https://developers.facebook.com/apps/${metaConfig?.appId ?? "890613233206413"}/settings/basic/`,
                                    linkLabel: "Open Basic Settings →",
                                  },
                                  {
                                    num: "3", urgent: true,
                                    label: "Upload App Icon (1024×1024 px)",
                                    desc: 'Settings → Basic → App Icon. Required before switching to Live.',
                                    url: `https://developers.facebook.com/apps/${metaConfig?.appId ?? "890613233206413"}/settings/basic/`,
                                    linkLabel: "Open Basic Settings →",
                                  },
                                  {
                                    num: "4", urgent: false,
                                    label: "Add Data Deletion Callback URL",
                                    desc: 'Settings → Basic → Data Deletion → URL or Instructions. Required for Facebook Login apps.',
                                    url: `https://developers.facebook.com/apps/${metaConfig?.appId ?? "890613233206413"}/settings/basic/`,
                                    linkLabel: "Open Basic Settings →",
                                  },
                                  {
                                    num: "5", urgent: false,
                                    label: "Add App Domains",
                                    desc: 'Settings → Basic → App Domains. Add: khanbabadryfruits.com, admin.khanbabadryfruits.com',
                                    url: `https://developers.facebook.com/apps/${metaConfig?.appId ?? "890613233206413"}/settings/basic/`,
                                    linkLabel: "Open Basic Settings →",
                                  },
                                ].map(item => (
                                  <div key={item.num} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 border ${item.urgent ? "border-red-200 bg-white" : "border-red-100 bg-red-50/50"}`}>
                                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${item.urgent ? "bg-red-600 text-white" : "bg-red-200 text-red-800"}`}>{item.num}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-xs font-semibold ${item.urgent ? "text-red-900" : "text-red-800"}`}>{item.label}</p>
                                      <p className="text-[11px] text-red-700 mt-0.5 leading-relaxed">{item.desc}</p>
                                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                                         className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline">
                                        {item.linkLabel} <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Action row */}
                              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                <button
                                  onClick={() => { setConnMethod("manual"); setMetaLoginError(null); }}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Switch to Manual Method (Recommended)
                                </button>
                                <button
                                  onClick={() => setMetaLoginError(null)}
                                  className="flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-700 hover:bg-red-100 font-medium rounded-xl text-xs transition-colors"
                                >
                                  Dismiss
                                </button>
                                <p className="text-[10px] text-red-600 flex items-center gap-1">
                                  <Info className="w-3 h-3 shrink-0" />
                                  After fixing, run the Health Check in Settings tab to verify
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={handleEmbeddedSignup}
                            disabled={isConnectingMeta || exchangeMetaToken.isPending}
                            className="flex items-center gap-2 px-6 py-3 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors shadow-sm"
                          >
                            {isConnectingMeta || exchangeMetaToken.isPending
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            }
                            {form.isActive && settings?.connectionMethod === "embedded_signup" ? "Reconnect with Meta" : "Connect with Meta"}
                          </button>
                          {exchangeMetaToken.isError && (
                            <p className="text-xs text-red-600 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />{(exchangeMetaToken.error as any)?.message}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground">Uses Meta's official Facebook Login for Business flow. Credentials are retrieved and saved securely — no manual copying required.</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-4">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="text-sm text-amber-800">
                          <p className="font-semibold mb-1">Meta App credentials not configured</p>
                          <p className="text-xs leading-relaxed">Add <code className="bg-amber-100 px-1 rounded font-mono">META_APP_ID</code>, <code className="bg-amber-100 px-1 rounded font-mono">META_APP_SECRET</code>, and <code className="bg-amber-100 px-1 rounded font-mono">META_CONFIG_ID</code> as environment secrets to enable one-click Meta onboarding. These come from your Meta Developer Portal → Your App → Facebook Login for Business.</p>
                          <p className="text-xs mt-2 text-amber-700">In the meantime, use the <strong>Manual API Setup</strong> method.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ── MANUAL API SETUP ── */
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 bg-muted/30 border-b border-border flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-4 h-4 text-[#25D366]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Manual API Setup — Enter Your Credentials</p>
                      <p className="text-xs text-muted-foreground mt-0.5">From Meta Developer Portal → WhatsApp → API Setup. Paste your credentials below.</p>
                    </div>
                  </div>
                  {settingsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm px-5 py-6">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading saved credentials…
                    </div>
                  ) : (
                    <div className="px-5 py-5 space-y-4">
                      {/* Step 1 banner */}
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800 leading-relaxed space-y-1">
                        <p className="font-semibold text-sm text-emerald-800">✅ Production-Ready: System User Permanent Token</p>
                        <p>1. Paste your System User permanent token below &nbsp;→&nbsp; 2. Click <strong>"Auto-Resolve IDs"</strong> to auto-fetch Phone Number ID &amp; WABA ID &nbsp;→&nbsp; 3. Save &amp; Connect</p>
                        <p className="text-emerald-700">Need help generating the token? Expand the <strong>"System User Permanent Token"</strong> guide below the form.</p>
                      </div>

                      {/* Access Token */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Access Token <span className="text-red-500">*</span></Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showToken ? "text" : "password"}
                              value={form.accessToken}
                              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                              placeholder="EAAxxxxx… (Permanent System User Token — never expires)"
                              className="pr-10 font-mono text-xs"
                            />
                            <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={handleResolveFromToken}
                            disabled={isResolving || !form.accessToken}
                            title="Auto-fetch Phone Number ID and WABA ID from this token"
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-xs transition-colors shrink-0 whitespace-nowrap"
                          >
                            {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Auto-Resolve IDs
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Meta Business Manager → Business Settings → Users → System Users → Generate New Token → select <em>whatsapp_business_messaging</em> + <em>whatsapp_business_management</em> → set Expiry to <strong>Never</strong></p>
                      </div>

                      {/* Phone Number ID + WABA ID */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium">Phone Number ID <span className="text-red-500">*</span></Label>
                            <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Auto-filled by resolve</span>
                          </div>
                          <Input
                            value={form.phoneNumberId}
                            onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
                            placeholder="Auto-filled — or paste manually from Meta → Getting Started"
                            className="font-mono text-xs"
                          />
                          <p className="text-[11px] text-muted-foreground">Meta App Dashboard → WhatsApp → Getting Started → Phone Number ID</p>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium">WABA ID (Business Account ID)</Label>
                            <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Auto-filled by resolve</span>
                          </div>
                          <Input
                            value={form.businessAccountId}
                            onChange={(e) => setForm((f) => ({ ...f, businessAccountId: e.target.value }))}
                            placeholder="Auto-filled — or paste manually from Meta → Getting Started"
                            className="font-mono text-xs"
                          />
                          <p className="text-[11px] text-muted-foreground">WhatsApp Business Account ID — needed for template management</p>
                        </div>
                      </div>

                      {/* Advanced Official API Fields */}
                      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Official API Security &amp; Advanced Settings</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">App Secret <span className="text-xs text-muted-foreground">(for webhook HMAC)</span></Label>
                            <Input
                              type="password"
                              value={form.appSecret}
                              onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
                              placeholder={settings?.appSecret ? "••••••••  (saved)" : "Enter App Secret"}
                              className="font-mono text-xs"
                              autoComplete="new-password"
                            />
                            <p className="text-[11px] text-muted-foreground">Meta App → Settings → Basic → App Secret. Used to verify webhook signatures (X-Hub-Signature-256).</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">API Version</Label>
                            <Input
                              value={form.apiVersion}
                              onChange={(e) => setForm((f) => ({ ...f, apiVersion: e.target.value }))}
                              placeholder="v18.0"
                              className="font-mono text-xs"
                            />
                            <p className="text-[11px] text-muted-foreground">Graph API version used for all WA calls (e.g. v18.0, v19.0, v20.0).</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Business Portfolio ID</Label>
                            <Input
                              value={form.businessPortfolioId}
                              onChange={(e) => setForm((f) => ({ ...f, businessPortfolioId: e.target.value }))}
                              placeholder="123456789"
                              className="font-mono text-xs"
                            />
                            <p className="text-[11px] text-muted-foreground">Meta Business Manager → Business Settings → Business Portfolio ID.</p>
                          </div>
                        </div>
                      </div>

                      {/* Webhook Verify Token */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Webhook Verify Token</Label>
                        <Input
                          value={form.webhookVerifyToken}
                          onChange={(e) => setForm((f) => ({ ...f, webhookVerifyToken: e.target.value }))}
                          placeholder="kdfnuts_webhook_token"
                          className="font-mono text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">A secret string you choose — must match exactly what you enter in Meta's webhook configuration</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-3 pt-1 border-t border-border">
                        <button
                          onClick={handleSaveAndConnect}
                          disabled={isSavingAndConnecting || !form.accessToken || !form.phoneNumberId}
                          className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#1ebe5d] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors"
                        >
                          {isSavingAndConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                          Save & Connect
                        </button>
                        <button
                          onClick={() => saveSettings.mutate()}
                          disabled={saveSettings.isPending}
                          className="flex items-center gap-2 px-4 py-2.5 border border-border hover:bg-muted font-medium rounded-xl text-sm transition-colors"
                        >
                          {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Save Only
                        </button>
                        {form.accessToken && form.phoneNumberId && (
                          <button
                            onClick={() => testConnection.mutate()}
                            disabled={testConnection.isPending}
                            className="flex items-center gap-2 px-4 py-2.5 border border-border hover:bg-muted font-medium rounded-xl text-sm transition-colors"
                          >
                            {testConnection.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Test Connection
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ══ META APP HEALTH CHECK ══ */}
          <MetaAppHealthCheck />

          {/* ══ META CLOUD API SETUP GUIDE ══ */}
          <MetaSetupGuide />

          {/* ══ WEBHOOK CONFIGURATION ══ */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 shrink-0">
                  <ShieldCheck className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Webhook Configuration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Paste into Meta Developer Portal → WhatsApp → Configuration → Webhooks</p>
                </div>
              </div>
              {webhookInfo?.isActive ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                  <Wifi className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  <WifiOff className="w-3 h-3" /> Inactive
                </span>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Callback URL */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Callback URL (paste into Meta)</Label>
                {webhookInfo?.webhookUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground break-all select-all">{webhookInfo.webhookUrl}</code>
                    <button onClick={copyWebhookUrl} className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors font-medium">
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Deploy the app to get your public HTTPS webhook URL. The URL will appear here automatically.
                  </div>
                )}
              </div>
              {/* Verify Token display */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Verify Token (paste into Meta)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground">
                    {form.webhookVerifyToken || "kdfnuts_webhook_token"}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(form.webhookVerifyToken || "kdfnuts_webhook_token"); toast({ title: "Copied!" }); }}
                    className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors font-medium"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                </div>
              </div>
              {/* Subscriptions reminder */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-800">
                <strong>Subscribe to these fields in Meta:</strong>{" "}
                <code className="bg-blue-100 px-1 rounded">messages</code>{" "}
                <code className="bg-blue-100 px-1 rounded">message_deliveries</code>{" "}
                <code className="bg-blue-100 px-1 rounded">message_reads</code>{" "}
                <code className="bg-blue-100 px-1 rounded">messaging_postbacks</code>
              </div>
              {/* Test webhook */}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={handleTestWebhook} disabled={isTestingWebhook} className="gap-1.5 text-xs h-8">
                  {isTestingWebhook ? <><Loader2 className="w-3 h-3 animate-spin" />Testing…</> : <><RefreshCw className="w-3 h-3" />Test Webhook</>}
                </Button>
                {webhookInfo?.webhookUrl && (
                  <a href={webhookInfo.webhookUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                    <ExternalLink className="w-3 h-3" /> Open URL
                  </a>
                )}
              </div>
              {webhookTestResult && (
                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs ${webhookTestResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                  {webhookTestResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
                  <span>{webhookTestResult.success ? (webhookTestResult.message ?? "Webhook is reachable!") : webhookTestResult.error}</span>
                </div>
              )}
            </div>
          </div>

          {/* ══ FLOATING CHAT BUTTON ══ */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#25D366]/10 shrink-0">
                  <Phone className="w-5 h-5 text-[#25D366]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Floating Chat Button</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">WhatsApp button shown on all store pages</p>
                </div>
              </div>
              <Switch checked={form.chatButtonEnabled} onCheckedChange={(v) => setForm((f) => ({ ...f, chatButtonEnabled: v }))} />
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">WhatsApp Phone Number</Label>
                  <Input value={form.chatButtonPhone} onChange={(e) => setForm((f) => ({ ...f, chatButtonPhone: e.target.value }))} placeholder="+92 300 1234567" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Default Pre-filled Message</Label>
                  <Input value={form.chatButtonMessage} onChange={(e) => setForm((f) => ({ ...f, chatButtonMessage: e.target.value }))} placeholder="Hi! I'd like to know more…" />
                </div>
              </div>
            </div>
          </div>

          <SaveBar />

          <SmartTestMessage />
        </div>
      )}

      {/* ── AUTOMATIONS TAB ── */}
      {tab === "automations" && (
        <div className="space-y-5">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-800 flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-600" />
            <span>Toggle which events automatically send a WhatsApp notification to customers. All are enabled by default when WhatsApp is active.</span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Order Lifecycle Notifications</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Auto-send WhatsApp messages when order status changes</p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {[
                { key: "notifyOrderConfirmation", label: "Order Confirmation", desc: "Sent immediately when a new order is placed", emoji: "✅" },
                { key: "notifyOrderProcessing",   label: "Order Processing",   desc: "Sent when order is packed and ready for dispatch", emoji: "📦" },
                { key: "notifyOrderShipped",       label: "Order Shipped",      desc: "Sent with tracking number when order ships", emoji: "🚚" },
                { key: "notifyOrderOutForDelivery", label: "Out for Delivery",  desc: "Sent on the day of delivery", emoji: "🛵" },
                { key: "notifyOrderDelivered",     label: "Order Delivered",    desc: "Sent when delivery is confirmed", emoji: "🎉" },
                { key: "notifyOrderCancelled",     label: "Order Cancelled",    desc: "Sent if the order is cancelled", emoji: "❌" },
              ].map(({ key, label, desc, emoji }) => (
                <div key={key} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl leading-none mt-0.5">{emoji}</span>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifySettings[key] ?? true}
                    onCheckedChange={(v) => setNotifySettings(s => ({ ...s, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-50">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Other Notifications</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Bidding wins, restock alerts, and more</p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {[
                { key: "notifyBiddingWinner", label: "Auction Winner", desc: "Notify winning bidder when auction ends", emoji: "🏆" },
                { key: "notifyRestock", label: "Restock Alert", desc: "Notify customers who requested restock alerts", emoji: "🔔" },
              ].map(({ key, label, desc, emoji }) => (
                <div key={key} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl leading-none mt-0.5">{emoji}</span>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifySettings[key] ?? true}
                    onCheckedChange={(v) => setNotifySettings(s => ({ ...s, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Event Template Status */}
          {(() => {
            const EVENT_TYPES_CONFIG = [
              { event: "order_confirmation",      label: "Order Confirmation",    emoji: "✅", vars: "{{1}}=Name, {{2}}=Order#, {{3}}=Total, {{4}}=Address" },
              { event: "order_processing",         label: "Order Processing",       emoji: "📦", vars: "{{1}}=Order#" },
              { event: "order_shipped",            label: "Order Shipped",          emoji: "🚚", vars: "{{1}}=Order#, {{2}}=Tracking ID" },
              { event: "order_out_for_delivery",   label: "Out for Delivery",       emoji: "🛵", vars: "{{1}}=Order#" },
              { event: "order_delivered",          label: "Order Delivered",        emoji: "🎉", vars: "{{1}}=Order#" },
              { event: "order_cancelled",          label: "Order Cancelled",        emoji: "❌", vars: "{{1}}=Order#" },
              { event: "abandoned_cart_recovery",  label: "Abandoned Cart Recovery",emoji: "🛒", vars: "No variables" },
            ];
            const allApproved = EVENT_TYPES_CONFIG.every(c => (eventTemplates as any)[c.event]?.approvalStatus === "approved");
            const missingCount = EVENT_TYPES_CONFIG.filter(c => !(eventTemplates as any)[c.event]).length;
            return (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-50">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base flex items-center gap-2">
                        Notification Template Status
                        {allApproved
                          ? <span className="text-[11px] font-normal text-green-700 bg-green-100 px-2 py-0.5 rounded-full">All Approved</span>
                          : <span className="text-[11px] font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{missingCount > 0 ? `${missingCount} missing` : "Needs approval"}</span>}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Meta-approved template for each order notification event</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => seedAllTemplates.mutate()} disabled={seedAllTemplates.isPending}>
                      {seedAllTemplates.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Seed All
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setTab("templates")}>
                      <FileText className="w-3.5 h-3.5" />Manage Templates
                    </Button>
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {EVENT_TYPES_CONFIG.map(({ event, label, emoji, vars }) => {
                    const tpl = (eventTemplates as any)[event];
                    const status: string = tpl?.approvalStatus ?? "missing";
                    const statusBadge = {
                      approved: { cls: "bg-green-100 text-green-700", label: "Approved" },
                      pending:  { cls: "bg-blue-100 text-blue-700",   label: "Pending" },
                      rejected: { cls: "bg-red-100 text-red-700",     label: "Rejected" },
                      draft:    { cls: "bg-amber-100 text-amber-700", label: "Draft" },
                      missing:  { cls: "bg-gray-100 text-gray-500",   label: "Missing" },
                    }[status] ?? { cls: "bg-gray-100 text-gray-500", label: status };
                    return (
                      <div key={event} className="flex items-center gap-3 px-5 py-3.5">
                        <span className="text-lg leading-none flex-shrink-0">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{label}</p>
                          {tpl
                            ? <p className="text-xs font-mono text-muted-foreground truncate">{tpl.name} · {vars}</p>
                            : <p className="text-xs text-muted-foreground">{vars}</p>}
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${statusBadge.cls}`}>{statusBadge.label}</span>
                        <Button
                          size="sm" variant="ghost"
                          className="text-[#25D366] hover:text-[#1ebe5d] hover:bg-[#25D366]/10 text-xs h-7 px-2.5 flex-shrink-0"
                          onClick={() => setTab("templates")}
                        >
                          {tpl ? (status === "approved" ? "View" : "Submit") : "Create"} →
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <div className="px-5 py-3 border-t bg-muted/20">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-green-700">Approved</span> templates are sent automatically for outbound messages.
                    {" "}<span className="font-semibold text-amber-700">Draft/Missing</span> = free-text fallback only (works within 24h of customer contact).
                    {" "}Click <button className="text-[#25D366] underline font-medium" onClick={() => setTab("templates")}>Manage Templates</button> to create, edit, and submit to Meta.
                  </p>
                </div>
              </div>
            );
          })()}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => saveNotifySettings.mutate()}
              disabled={saveNotifySettings.isPending}
              style={{ backgroundColor: "#5FA800" }}
              className="text-white gap-1.5"
            >
              {saveNotifySettings.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Automation Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* ── CAMPAIGNS TAB ── */}
      {tab === "campaigns" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Marketing Campaigns</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Policy-safe bulk messaging with approved templates, random delays and frequency caps</p>
            </div>
            <Button onClick={() => setShowCampaignForm(v => !v)} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
              <Plus className="w-4 h-4" /> New Campaign
            </Button>
          </div>

          {/* Anti-ban info banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-600" />
            <span><strong>Anti-ban protection active:</strong> Campaigns use random delays between messages and skip customers messaged within the frequency cap window. Use approved Meta templates to stay policy-compliant.</span>
          </div>

          {/* Create form */}
          {showCampaignForm && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4 text-purple-500" /> Create Campaign</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Campaign Name *</Label>
                  <Input value={newCampaign.name} onChange={e => setNewCampaign(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Eid Sale 2025" />
                </div>
                <div className="space-y-1.5">
                  <Label>Campaign Type</Label>
                  <select value={newCampaign.type} onChange={e => setNewCampaign(f => ({ ...f, type: e.target.value }))} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                    <option value="discount">Discount Offer</option>
                    <option value="coupon">Coupon Code</option>
                    <option value="new_arrivals">New Arrivals</option>
                    <option value="promotion">Promotion</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              {/* Message source toggle */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                <Switch checked={newCampaign.useTemplate} onCheckedChange={v => setNewCampaign(f => ({ ...f, useTemplate: v, templateId: "", templateParams: [] }))} />
                <div>
                  <p className="text-sm font-medium">{newCampaign.useTemplate ? "Using approved Meta template (recommended)" : "Custom free text message"}</p>
                  <p className="text-xs text-muted-foreground">{newCampaign.useTemplate ? "Approved templates are required for outbound campaigns per Meta policy" : "Free text only works within 24h of customer contact"}</p>
                </div>
              </div>

              {newCampaign.useTemplate ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Select Approved Template *</Label>
                    {(campaignTemplates as any[]).length === 0 ? (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        No approved templates yet. Go to Templates tab, create a template and submit to Meta for approval.
                      </div>
                    ) : (
                      <select value={newCampaign.templateId} onChange={e => {
                        const tpl = (campaignTemplates as any[]).find((t: any) => t.name === e.target.value);
                        setNewCampaign(f => ({ ...f, templateId: e.target.value, templateParams: tpl ? Array(tpl.paramCount).fill("") : [] }));
                      }} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                        <option value="">— Select a template —</option>
                        {(campaignTemplates as any[]).map((t: any) => (
                          <option key={t.id} value={t.name}>{t.name} ({t.paramCount} variable{t.paramCount !== 1 ? "s" : ""})</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {newCampaign.templateId && newCampaign.templateParams.length > 0 && (
                    <div className="space-y-2">
                      <Label>Template Variable Values</Label>
                      <p className="text-xs text-muted-foreground">These values fill in {"{{1}}"}, {"{{2}}"} etc. in the template body for every recipient.</p>
                      {newCampaign.templateParams.map((v, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-muted px-2 py-1 rounded w-12 text-center">{`{{${i + 1}}}`}</span>
                          <Input value={v} onChange={e => {
                            const p = [...newCampaign.templateParams]; p[i] = e.target.value;
                            setNewCampaign(f => ({ ...f, templateParams: p }));
                          }} placeholder={`Value for {{${i + 1}}}`} className="flex-1 text-sm" />
                        </div>
                      ))}
                    </div>
                  )}
                  {newCampaign.templateId && (() => {
                    const tpl = (campaignTemplates as any[]).find((t: any) => t.name === newCampaign.templateId);
                    if (!tpl) return null;
                    let preview = tpl.messageBody;
                    newCampaign.templateParams.forEach((v, i) => { preview = preview.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`); });
                    return (
                      <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap text-gray-700">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Preview</p>
                        {preview}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Message Body *</Label>
                  <textarea value={newCampaign.messageBody} onChange={e => setNewCampaign(f => ({ ...f, messageBody: e.target.value }))} rows={4} placeholder="Hi! 🎉 We have an exciting offer just for you..." className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none" />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">
                  <span>Audience</span>
                  {audienceCount !== undefined && newCampaign.audience !== "custom_phones" && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1">
                      <Users className="w-3 h-3" />{audienceCount.count.toLocaleString()} recipients
                    </span>
                  )}
                </Label>
                <select value={newCampaign.audience} onChange={e => setNewCampaign(f => ({ ...f, audience: e.target.value }))} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                  <option value="all_customers">All Customers (unique phones from orders)</option>
                  <option value="by_order_status">By Order Status</option>
                  <option value="chat_leads">Chat Leads (website widget leads)</option>
                  <option value="custom_phones">Custom Phone List</option>
                </select>
                {newCampaign.audience === "chat_leads" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="w-3 h-3" />Contacts who filled the chat widget lead form on your website</p>
                )}
              </div>
              {newCampaign.audience === "by_order_status" && (
                <div className="space-y-1.5">
                  <Label>Filter by Order Status</Label>
                  <select value={newCampaign.audienceFilter} onChange={e => setNewCampaign(f => ({ ...f, audienceFilter: e.target.value }))} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
              {newCampaign.audience === "custom_phones" && (
                <div className="space-y-1.5">
                  <Label>Phone Numbers (one per line, with country code)</Label>
                  <textarea value={newCampaign.customPhones} onChange={e => setNewCampaign(f => ({ ...f, customPhones: e.target.value }))} rows={4} placeholder="923001234567&#10;923009876543" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none font-mono" />
                </div>
              )}

              {/* Delay + Anti-ban settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><TimerIcon className="w-3 h-3" />Min Delay (sec)</Label>
                  <Input type="number" min={1} max={60} value={newCampaign.rateLimitDelay} onChange={e => setNewCampaign(f => ({ ...f, rateLimitDelay: parseInt(e.target.value) || 2 }))} />
                  <p className="text-[10px] text-muted-foreground">Minimum pause between sends</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><TimerIcon className="w-3 h-3" />Max Delay (sec)</Label>
                  <Input type="number" min={1} max={120} value={newCampaign.maxDelay} onChange={e => setNewCampaign(f => ({ ...f, maxDelay: parseInt(e.target.value) || 5 }))} />
                  <p className="text-[10px] text-muted-foreground">Random delay up to this value</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs"><ShieldCheck className="w-3 h-3" />Frequency Cap (hours)</Label>
                  <Input type="number" min={0} max={720} value={newCampaign.frequencyCapHours} onChange={e => setNewCampaign(f => ({ ...f, frequencyCapHours: parseInt(e.target.value) || 24 }))} />
                  <p className="text-[10px] text-muted-foreground">Skip if sent to same number within this window</p>
                </div>
              </div>

              {/* Schedule (optional) */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm"><CalendarClock className="w-3.5 h-3.5 text-indigo-500" />Schedule Send (optional)</Label>
                <Input
                  type="datetime-local"
                  value={newCampaign.scheduledAt}
                  onChange={e => setNewCampaign(f => ({ ...f, scheduledAt: e.target.value }))}
                  className="text-sm"
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-xs text-muted-foreground">Leave blank to send immediately when you click "Launch". Set a date/time to schedule for later.</p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => createCampaign.mutate({
                    ...newCampaign,
                    templateId: newCampaign.useTemplate ? newCampaign.templateId : null,
                    templateParams: newCampaign.useTemplate ? newCampaign.templateParams : null,
                    messageBody: newCampaign.useTemplate ? "" : newCampaign.messageBody,
                    scheduledAt: newCampaign.scheduledAt || null,
                  })}
                  disabled={createCampaign.isPending || !newCampaign.name || (newCampaign.useTemplate ? !newCampaign.templateId : !newCampaign.messageBody)}
                  style={{ backgroundColor: "#5FA800" }} className="text-white">
                  {createCampaign.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : newCampaign.scheduledAt ? "Schedule Campaign" : "Create Campaign"}
                </Button>
                <Button variant="outline" onClick={() => setShowCampaignForm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Campaign list */}
          {(campaigns as any[]).length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-xl py-12 text-center">
              <Megaphone className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No campaigns yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first campaign to start sending bulk messages</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(campaigns as any[]).map((c: any) => {
                const total = c.recipientCount || 1;
                const done = (c.sentCount || 0) + (c.failedCount || 0) + (c.skippedCount || 0);
                const pct = c.status === "sent" ? 100 : Math.min(99, Math.round((done / total) * 100));
                return (
                  <div key={c.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{c.name}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">{c.type}</span>
                          {c.templateId && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">template</span>}
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                            c.status === "sent"    ? "bg-green-100 text-green-700"
                            : c.status === "sending" ? "bg-blue-100 text-blue-700 animate-pulse"
                            : "bg-gray-100 text-gray-600"
                          }`}>{c.status}</span>
                        </div>
                        {c.templateId
                          ? <p className="text-xs text-blue-600 mt-1 font-mono">template: {c.templateId}</p>
                          : <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.messageBody}</p>
                        }
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.audience === "all_customers" ? "All customers" : c.audience === "by_order_status" ? `${c.audienceFilter}` : c.audience === "chat_leads" ? "Chat leads" : "Custom list"}</span>
                          {c.scheduledAt && c.status === "draft" && <span className="flex items-center gap-1 text-indigo-600 font-medium"><CalendarClock className="w-3 h-3" />Scheduled: {new Date(c.scheduledAt).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                          <span className="flex items-center gap-1"><TimerIcon className="w-3 h-3" />{c.rateLimitDelay}–{c.maxDelay ?? c.rateLimitDelay}s</span>
                          {(c.frequencyCapHours ?? 0) > 0 && <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" />{c.frequencyCapHours}h cap</span>}
                          {c.sentAt && <span>{new Date(c.sentAt).toLocaleDateString("en-PK")}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 items-start flex-wrap justify-end">
                        {c.status === "draft" && (
                          <Button size="sm" onClick={() => { if (confirm(`Launch "${c.name}"?\n\nThis will send to all audience members with anti-spam delays and frequency cap.`)) sendCampaign.mutate(c.id); }} disabled={sendCampaign.isPending} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
                            <Play className="w-3.5 h-3.5" /> Launch
                          </Button>
                        )}
                        {c.status === "sending" && (
                          <Button size="sm" variant="outline" onClick={() => pauseCampaign.mutate(c.id)} disabled={pauseCampaign.isPending} className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
                            <TimerIcon className="w-3.5 h-3.5" /> Pause
                          </Button>
                        )}
                        {c.status === "paused" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => resumeCampaign.mutate(c.id)} disabled={resumeCampaign.isPending} className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50">
                              <Play className="w-3.5 h-3.5" /> Resume
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Cancel this campaign permanently?")) cancelCampaign.mutate(c.id); }} className="text-red-500 hover:bg-red-50 gap-1.5">
                              <XCircle className="w-3.5 h-3.5" /> Cancel
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => duplicateCampaign.mutate(c.id)} disabled={duplicateCampaign.isPending} className="text-muted-foreground hover:text-foreground hover:bg-muted" title="Duplicate campaign">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this campaign?")) deleteCampaign.mutate(c.id); }} disabled={deleteCampaign.isPending || c.status === "sending"} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Progress bar (always visible when not draft) */}
                    {c.status !== "draft" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium">{c.status === "sending" ? `Sending… ${done}/${c.recipientCount}` : `Completed — ${c.recipientCount} recipients`}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-[#25D366] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: "Sent",      value: c.sentCount ?? 0,      color: "text-green-600",  bg: "bg-green-50",  border: "border-green-100" },
                            { label: "Delivered", value: c.deliveredCount ?? 0, color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-100" },
                            { label: "Read",      value: c.readCount ?? 0,      color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
                            { label: "Failed",    value: c.failedCount ?? 0,    color: "text-red-600",    bg: "bg-red-50",    border: "border-red-100" },
                          ].map(s => (
                            <div key={s.label} className={`rounded-lg border ${s.border} ${s.bg} px-2 py-1.5 text-center`}>
                              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                              <p className="text-[10px] text-muted-foreground">{s.label}</p>
                            </div>
                          ))}
                        </div>
                        {(c.skippedCount ?? 0) > 0 && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />{c.skippedCount} skipped by frequency cap
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DEBUG TAB ── */}
      {tab === "debug" && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Debug Panel</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Diagnose WhatsApp API connection issues and inspect error logs</p>
          </div>

          {/* ── Webhook Setup Guide ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#25D366]" /> Webhook Setup Guide
                <span className="text-[10px] font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Required for incoming messages</span>
              </h3>
              <Button variant="outline" size="sm" onClick={() => refetchWebhookInfo()} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />Refresh
              </Button>
            </div>
            <div className="px-5 py-5 space-y-4">

              {/* URL + Token fields */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Callback URL — paste this into Meta Developer Console</p>
                  {webhookInfo?.webhookUrl ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground break-all">
                        {webhookInfo.webhookUrl}
                      </code>
                      <Button size="sm" variant="outline" onClick={copyWebhookUrl} className="flex-shrink-0 gap-1.5">
                        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <p className="text-sm text-amber-800">Webhook URL not available yet. <strong>Deploy the app</strong> to get a stable public HTTPS URL for Meta.</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Verify Token — paste this into Meta Developer Console</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground">
                      {webhookInfo?.verifyToken ?? "kdfnuts_webhook_token"}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => {
                      navigator.clipboard.writeText(webhookInfo?.verifyToken ?? "kdfnuts_webhook_token");
                      setCopied(true); setTimeout(() => setCopied(false), 2000);
                    }} className="flex-shrink-0 gap-1.5">
                      <Copy className="w-3.5 h-3.5" />Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Change this in API Settings → Webhook Verify Token if needed.</p>
                </div>
              </div>

              {/* Test webhook button */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleTestWebhook} disabled={isTestingWebhook || !webhookInfo?.webhookUrl} variant="outline" className="gap-2">
                  {isTestingWebhook ? <><Loader2 className="w-4 h-4 animate-spin" />Testing…</> : <><CheckCircle2 className="w-4 h-4" />Test Webhook</>}
                </Button>
                {webhookTestResult && (
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${webhookTestResult.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                    {webhookTestResult.success ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    {webhookTestResult.success ? webhookTestResult.message : webhookTestResult.error}
                  </div>
                )}
              </div>

              {/* Step-by-step instructions */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-4 space-y-3">
                <p className="text-sm font-semibold text-blue-900">How to configure in Meta Developer Console</p>
                <ol className="text-xs text-blue-800 space-y-2 list-none">
                  {[
                    { step: "1", text: <>Go to <strong>developers.facebook.com</strong> → Your App → <strong>WhatsApp → Configuration</strong></> },
                    { step: "2", text: <>Under <strong>Webhook</strong>, click <strong>Edit</strong> → paste the <strong>Callback URL</strong> above</> },
                    { step: "3", text: <>Paste the <strong>Verify Token</strong> above into the Verify Token field → click <strong>Verify and Save</strong></> },
                    { step: "4", text: <>Under <strong>Webhook Fields</strong>, click <strong>Manage</strong> → Subscribe to: <code className="bg-blue-100 px-1 rounded">messages</code>, <code className="bg-blue-100 px-1 rounded">message_deliveries</code>, <code className="bg-blue-100 px-1 rounded">message_reads</code></> },
                    { step: "5", text: <>Click <strong>Test Webhook</strong> above — if it passes, Meta can deliver messages to your server</> },
                  ].map(({ step, text }) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ol>
                {!webhookInfo?.isProd && (
                  <div className="flex items-start gap-2 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800"><strong>Development mode:</strong> The URL above works for testing, but for production configure Meta with your <strong>deployed app URL</strong> (use the Deploy button in Replit). Deployed apps have a permanent domain that won't change.</p>
                  </div>
                )}
              </div>

              {/* Webhook Payload Viewer (moved here for relevance) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Webhook Payload Log (last 50)</p>
                  <Button variant="outline" size="sm" onClick={handleLoadWebhookLogs} disabled={isLoadingWebhookLogs} className="gap-1.5">
                    {isLoadingWebhookLogs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Load Webhooks
                  </Button>
                </div>
                {webhookLogs.length === 0 ? (
                  <div className="text-center py-5 text-muted-foreground text-xs bg-muted/20 rounded-xl border border-border">
                    Click "Load Webhooks" to see raw payloads from Meta. Every delivery status (sent/delivered/read) and incoming customer message will appear here.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {webhookLogs.map((wh: any, i: number) => {
                      const hasStatuses = wh.body?.entry?.[0]?.changes?.[0]?.value?.statuses?.length > 0;
                      const hasMessages = wh.body?.entry?.[0]?.changes?.[0]?.value?.messages?.length > 0;
                      const statuses = wh.body?.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
                      const messages = wh.body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
                      return (
                        <details key={i} className="border border-border rounded-lg overflow-hidden">
                          <summary className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/30 text-xs">
                            <span className="text-muted-foreground font-mono">{new Date(wh.ts).toLocaleString("en-PK")}</span>
                            {hasMessages && (
                              <>
                                <Badge variant="outline" className="bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30">
                                  📥 incoming message{messages.length > 1 ? `s (${messages.length})` : ""}
                                </Badge>
                                {messages.map((m: any, mi: number) => (
                                  <span key={mi} className="text-muted-foreground">from {m.from}</span>
                                ))}
                              </>
                            )}
                            {hasStatuses && statuses.map((s: any, si: number) => (
                              <Badge key={si} variant="outline" className={
                                s.status === "read"      ? "bg-purple-50 text-purple-700 border-purple-200" :
                                s.status === "delivered" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                s.status === "sent"      ? "bg-sky-50 text-sky-700 border-sky-200" :
                                s.status === "failed"    ? "bg-red-50 text-red-700 border-red-200" :
                                "bg-gray-50 text-gray-600 border-gray-200"
                              }>
                                {s.status} — {s.id?.slice(0, 16)}…
                              </Badge>
                            ))}
                            {!hasStatuses && !hasMessages && <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">{wh.body?.object ?? "unknown"}</Badge>}
                          </summary>
                          <div className="px-3 py-2 bg-muted/20 border-t border-border">
                            <pre className="text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">{JSON.stringify(wh.body, null, 2)}</pre>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Connection Status */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-blue-500" /> API Connection Status</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <Button onClick={() => testConnection.mutate()} disabled={testConnection.isPending} variant="outline" className="gap-2">
                {testConnection.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</> : <><RefreshCw className="w-4 h-4" /> Test Connection</>}
              </Button>
              {connStatus && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${connStatus.success ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                  {connStatus.success ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <span>{connStatus.message}</span>
                  {!connStatus.success && connStatus.status && (
                    <span className="text-xs font-mono bg-red-100 px-1.5 py-0.5 rounded">{connStatus.status}</span>
                  )}
                </div>
              )}
            </div>
            {connStatus && !connStatus.success && (
              <div className="mt-2">
                {connStatus.status === "invalid_token" && (
                  <div className="text-sm bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-800">
                    <p className="font-semibold">🔑 Invalid Access Token</p>
                    <p className="mt-1">Your access token has expired or is incorrect. Go to <strong>Meta Business Suite → WhatsApp → API Setup</strong> and generate a new permanent token.</p>
                  </div>
                )}
                {connStatus.status === "invalid_phone_id" && (
                  <div className="text-sm bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-800">
                    <p className="font-semibold">📱 Invalid Phone Number ID</p>
                    <p className="mt-1">The Phone Number ID is incorrect. Find it in <strong>Meta Developer Console → WhatsApp → Getting Started</strong>.</p>
                  </div>
                )}
                {connStatus.status === "rate_limit" && (
                  <div className="text-sm bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-800">
                    <p className="font-semibold">⚡ Rate Limit Hit</p>
                    <p className="mt-1">You've exceeded Meta's messaging rate limits. Wait a few minutes before retrying, and increase the delay between messages in your campaigns.</p>
                  </div>
                )}
                {connStatus.status === "not_configured" && (
                  <div className="text-sm bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-800">
                    <p className="font-semibold">⚙️ Not Configured</p>
                    <p className="mt-1">Go to <strong>API Settings</strong> and enter your Access Token and Phone Number ID from Meta Developer Console.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Analysis */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Recent Error Analysis</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Categorized errors from the message log</p>
            </div>
            <div className="p-5">
              {logsLoading ? (
                <div className="flex items-center justify-center h-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (() => {
                const failedLogs = ((logs ?? []) as any[]).filter((l: any) => l.status === "failed");
                if (failedLogs.length === 0) return (
                  <div className="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">All Clear!</p>
                      <p className="text-xs mt-0.5">No failed messages in the recent log.</p>
                    </div>
                  </div>
                );
                const categorize = (r: string) => {
                  if (!r) return "unknown";
                  if (r.includes("190") || r.includes("access_token") || r.includes("OAuthException")) return "invalid_token";
                  if (r.includes("80007") || r.includes("rate") || r.includes("Rate")) return "rate_limit";
                  if (r.includes("template") || r.includes("Template")) return "template_error";
                  if (r.includes("webhook") || r.includes("Webhook")) return "webhook_issue";
                  if (r.includes("network") || r.includes("fetch") || r.includes("ECONNREFUSED")) return "network_error";
                  return "other";
                };
                const counts: Record<string, number> = {};
                failedLogs.forEach((l: any) => { const cat = categorize(l.response ?? ""); counts[cat] = (counts[cat] ?? 0) + 1; });
                const CAT_INFO: Record<string, { icon: string; label: string; hint: string }> = {
                  invalid_token: { icon: "🔑", label: "Invalid Token", hint: "Regenerate your access token in Meta Business Suite" },
                  rate_limit:    { icon: "⚡", label: "Rate Limit",    hint: "Increase delay between messages in campaign settings" },
                  template_error:{ icon: "📄", label: "Template Error",hint: "Check template names and variable formats" },
                  webhook_issue: { icon: "🔗", label: "Webhook Issue", hint: "Verify the webhook URL in Meta Developer Console" },
                  network_error: { icon: "🌐", label: "Network Error", hint: "Check server internet connectivity" },
                  other:         { icon: "❓", label: "Other",         hint: "Review individual log entries for details" },
                  unknown:       { icon: "❓", label: "Unknown",       hint: "Review API responses in the logs tab" },
                };
                return (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{failedLogs.length} failed message{failedLogs.length !== 1 ? "s" : ""} found</p>
                    {Object.entries(counts).map(([cat, count]) => {
                      const info = CAT_INFO[cat] ?? CAT_INFO.other;
                      return (
                        <div key={cat} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                          <span className="text-xl">{info.icon}</span>
                          <div className="flex-1">
                            <p className="font-semibold text-sm text-red-800 flex items-center justify-between">
                              <span>{info.label}</span>
                              <span className="ml-2 text-xs bg-red-100 px-2 py-0.5 rounded-full">{count}×</span>
                            </p>
                            <p className="text-xs text-red-700 mt-0.5">{info.hint}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Recent Failed Logs */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" /> Recent Failed Messages</h3>
              <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/logs"] })}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
              </Button>
            </div>
            {logsLoading ? (
              <div className="flex items-center justify-center h-24"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (() => {
              const failedLogs = ((logs ?? []) as any[]).filter((l: any) => l.status === "failed").slice(0, 10);
              return failedLogs.length === 0 ? (
                <div className="px-5 py-8 text-center text-muted-foreground text-sm">No failed messages</div>
              ) : (
                <div className="divide-y divide-border">
                  {failedLogs.map((l: any) => (
                    <div key={l.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono font-medium">{l.phone}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.message}</p>
                        {l.response && <p className="text-[10px] font-mono text-red-600 mt-1 bg-red-50 rounded px-2 py-1 line-clamp-2">{l.response}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">{new Date(l.createdAt).toLocaleString("en-PK")}</span>
                        <button onClick={() => retryLogMutation.mutate(l.id)} disabled={retryLogMutation.isPending} className="flex items-center gap-1 text-[10px] font-medium text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-50">
                          <RotateCw className="w-3 h-3" /> Retry
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

        </div>
      )}

      {/* ── RECOVERY TAB ── */}
      {tab === "recovery" && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-100">
                  <RotateCcw className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">Abandoned Cart Recovery</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Auto-send WhatsApp messages to customers who left items in their cart</p>
                </div>
              </div>
              <Switch checked={form.abandonedRecoveryEnabled} onCheckedChange={(v) => setForm((f) => ({ ...f, abandonedRecoveryEnabled: v }))} />
            </div>
            <div className="px-5 py-5 space-y-5">
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 leading-relaxed">
                <span className="font-semibold">How it works:</span> Every 5 minutes, the system checks for active abandoned checkouts that have a phone number and haven't been messaged yet. If the cart has been inactive longer than the delay below, a WhatsApp message is sent automatically.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Recovery Delay (minutes)</Label>
                  <Input type="number" min={15} max={1440} value={form.abandonedRecoveryDelayMinutes} onChange={(e) => setForm((f) => ({ ...f, abandonedRecoveryDelayMinutes: parseInt(e.target.value) || 45 }))} placeholder="45" />
                  <p className="text-xs text-muted-foreground">Recommended: 30–60 minutes after last cart activity</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5" />Auto Coupon Code (optional)</Label>
                  <Input value={form.abandonedRecoveryCouponCode} onChange={(e) => setForm((f) => ({ ...f, abandonedRecoveryCouponCode: e.target.value.toUpperCase() }))} placeholder="SAVE10" />
                  <p className="text-xs text-muted-foreground">If set, the coupon code is included in recovery message</p>
                </div>
              </div>
            </div>
          </div>
          <SaveBar />
        </div>
      )}

      {/* ── CHATBOT TAB ── */}
      {tab === "chatbot" && (
        <div className="space-y-5">

          {/* ── Stats Row ── */}
          {chatbotStats && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "AI Replies Today", value: chatbotStats.today_ai_replies ?? 0, color: "text-purple-600", bg: "bg-purple-50" },
                { label: "Total AI Replies", value: chatbotStats.total_ai_replies ?? 0, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Incoming (24h)", value: chatbotStats.incoming_24h ?? 0, color: "text-orange-600", bg: "bg-orange-50" },
                { label: "Unique Customers", value: chatbotStats.unique_customers ?? 0, color: "text-green-600", bg: "bg-green-50" },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border border-border p-4 ${s.bg}`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Main Settings Card ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-50">
                  <Bot className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-base flex items-center gap-2">
                    AI Auto-Reply Chatbot
                    {chatbotForm.isEnabled
                      ? <span className="text-[11px] font-normal text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1"><Sparkles className="w-3 h-3" />Active</span>
                      : <span className="text-[11px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Disabled</span>}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Powered by OpenAI — automatically replies to customer WhatsApp messages</p>
                </div>
              </div>
              <Switch checked={chatbotForm.isEnabled} onCheckedChange={(v) => setChatbotForm(f => ({ ...f, isEnabled: v }))} />
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* How it works */}
              <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 text-xs text-purple-800 leading-relaxed space-y-1">
                <p className="font-semibold mb-1">How the Order-Aware Chatbot works:</p>
                <p>1. Customer sends a WhatsApp message → system captures it instantly</p>
                <p>2. System looks up their recent orders by phone number</p>
                <p>3. Order context (status, tracking, total) is injected into ChatGPT's prompt</p>
                <p>4. ChatGPT generates a personalised reply — e.g. "Hi Qadir, your order #KDF123 is on the way 🚚"</p>
                <p>5. Reply is sent back via WhatsApp and logged in Conversations</p>
              </div>

              {/* AI Model */}
              <div className="space-y-1.5">
                <Label className="text-sm">AI Model</Label>
                <select value={chatbotForm.aiModel} onChange={e => setChatbotForm(f => ({ ...f, aiModel: e.target.value }))}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                  {AI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">GPT-4o Mini is recommended — fast and cost-effective for customer support.</p>
              </div>

              {/* Order Context Toggle */}
              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Order-Aware Context</p>
                    <p className="text-xs text-muted-foreground">Automatically fetch customer's recent orders and pass to AI so it can answer order questions</p>
                  </div>
                </div>
                <Switch checked={chatbotForm.orderContextEnabled} onCheckedChange={(v) => setChatbotForm(f => ({ ...f, orderContextEnabled: v }))} />
              </div>

              {/* Rate Limit + Daily Cap */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Reply Cooldown (seconds)</Label>
                  <Input type="number" min={0} max={3600} value={chatbotForm.replyDelaySec}
                    onChange={e => setChatbotForm(f => ({ ...f, replyDelaySec: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Minimum seconds between AI replies to the same customer. Prevents spam.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Max AI Replies / Day</Label>
                  <Input type="number" min={1} max={10000} value={chatbotForm.maxDailyReplies}
                    onChange={e => setChatbotForm(f => ({ ...f, maxDailyReplies: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Total AI replies allowed per day across all customers.</p>
                </div>
              </div>

              {/* AI Order Placement */}
              <div className="flex items-center justify-between p-4 bg-[#5FA800]/5 border border-[#5FA800]/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#5FA800]/10 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-[#5FA800]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">AI Order Placement (Website Chat)</p>
                    <p className="text-xs text-muted-foreground">Let the chatbot collect details and place orders automatically in the website chat widget</p>
                  </div>
                </div>
                <Switch checked={chatbotForm.orderingEnabled} onCheckedChange={(v) => setChatbotForm(f => ({ ...f, orderingEnabled: v }))} />
              </div>

              {/* System Prompt */}
              <div className="space-y-1.5">
                <Label className="text-sm">System Prompt (AI Behaviour Instructions)</Label>
                <Textarea value={chatbotForm.systemPrompt} onChange={e => setChatbotForm(f => ({ ...f, systemPrompt: e.target.value }))} rows={7} className="text-sm resize-y font-mono" placeholder="You are a helpful assistant for KDF NUTS..." />
                <p className="text-xs text-muted-foreground">Defines how the AI behaves. Order context is automatically appended — you don't need to mention it here.</p>
              </div>

              {/* Fallback */}
              <div className="space-y-1.5">
                <Label className="text-sm">Fallback Message (sent if AI fails)</Label>
                <Input value={chatbotForm.fallbackMessage} onChange={e => setChatbotForm(f => ({ ...f, fallbackMessage: e.target.value }))} placeholder="Thank you! Our team will get back to you shortly. 🙏" />
                <p className="text-xs text-muted-foreground">Sent if OpenAI returns an error. Keep it friendly and professional.</p>
              </div>

              {/* Tips */}
              <div className="border border-dashed border-border rounded-xl p-4 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />System Prompt Tips</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {[
                    "Mention your store name and what you sell",
                    "Tell the AI to reply in both English and Urdu based on customer's language",
                    "Define your shipping & return policy",
                    "List your business hours and WhatsApp number",
                    "Note: Order data is auto-injected — the AI already knows their orders",
                  ].map(tip => (
                    <li key={tip} className="flex items-start gap-1.5"><ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ── Welcome Menu Builder (Phase 1) ── */}
          {(() => {
            const liveItems: WaMenuItem[] = chatbotForm.menuItems && (chatbotForm.menuItems as WaMenuItem[]).length > 0
              ? (chatbotForm.menuItems as WaMenuItem[])
              : DEFAULT_MENU_ITEMS;
            const greeting = chatbotForm.greetingMessage || "Hello! 👋 Welcome to *KDF NUTS* 🥜\nHow can we help you today?\n\nReply anytime — we're here to help 💚";

            const moveItem = (idx: number, dir: -1 | 1) => {
              const items = [...liveItems];
              const swapIdx = idx + dir;
              if (swapIdx < 0 || swapIdx >= items.length) return;
              [items[idx], items[swapIdx]] = [items[swapIdx], items[idx]];
              setChatbotForm(f => ({ ...f, menuItems: items }));
            };
            const updateItem = (idx: number, patch: Partial<WaMenuItem>) => {
              const items = liveItems.map((it, i) => i === idx ? { ...it, ...patch } : it);
              setChatbotForm(f => ({ ...f, menuItems: items }));
            };
            const deleteItem = (idx: number) => {
              setChatbotForm(f => ({ ...f, menuItems: liveItems.filter((_, i) => i !== idx) }));
            };
            const addItem = () => {
              const newItem: WaMenuItem = { id: `custom_${Date.now()}`, emoji: "⭐", label: "New Option", description: "Description here", sectionTitle: "" };
              setChatbotForm(f => ({ ...f, menuItems: [...liveItems, newItem] }));
            };
            const resetToDefaults = () => setChatbotForm(f => ({ ...f, menuItems: DEFAULT_MENU_ITEMS }));

            return (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-50">
                      <MessageSquare className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-base flex items-center gap-2">
                        Interactive Menu Builder
                        {chatbotForm.menuEnabled
                          ? <span className="text-[11px] font-normal text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Active</span>
                          : <span className="text-[11px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Disabled</span>}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Fully editable tappable menu — add, remove, reorder and customise every item</p>
                    </div>
                  </div>
                  <Switch checked={chatbotForm.menuEnabled} onCheckedChange={(v) => setChatbotForm(f => ({ ...f, menuEnabled: v }))} />
                </div>

                <div className="px-5 py-5 space-y-5">
                  {/* Two-column: editor + live preview */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* Left: editor */}
                    <div className="space-y-4">
                      {/* Greeting message */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-semibold">Greeting Message</Label>
                        <Textarea
                          value={chatbotForm.greetingMessage}
                          onChange={e => setChatbotForm(f => ({ ...f, greetingMessage: e.target.value }))}
                          rows={3}
                          className="text-sm resize-y font-mono"
                          placeholder="Hello! 👋 Welcome to *KDF NUTS* 🥜&#10;How can we help you today?"
                        />
                        <p className="text-xs text-muted-foreground">Supports WhatsApp formatting: *bold*, _italic_. Leave blank for default.</p>
                      </div>

                      {/* Menu items list */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold">Menu Items ({liveItems.length}/10)</Label>
                          <div className="flex gap-2">
                            <button onClick={resetToDefaults} className="text-[10px] text-muted-foreground hover:text-foreground underline">Reset defaults</button>
                            <button onClick={addItem} disabled={liveItems.length >= 10} className="flex items-center gap-1 text-xs font-medium text-[#5FA800] hover:text-[#4a8800] disabled:opacity-40">
                              <Plus className="w-3.5 h-3.5" />Add Item
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {liveItems.map((item, idx) => (
                            <div key={item.id} className={`border rounded-lg bg-muted/20 p-3 space-y-2 transition-opacity ${item.enabled === false ? "opacity-50 border-dashed" : "border-border"}`}>
                              {/* Row 1: reorder + emoji + label + enable toggle + delete */}
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-0.5">
                                  <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ArrowUp className="w-3 h-3" /></button>
                                  <button onClick={() => moveItem(idx, 1)} disabled={idx === liveItems.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ArrowDown className="w-3 h-3" /></button>
                                </div>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <input value={item.emoji} onChange={e => updateItem(idx, { emoji: e.target.value })}
                                    className="w-10 border border-input rounded px-1.5 py-1 text-center text-sm bg-background" maxLength={4} />
                                  <input value={item.label} onChange={e => updateItem(idx, { label: e.target.value })}
                                    className="flex-1 border border-input rounded px-2 py-1 text-sm bg-background min-w-0" placeholder="Label" maxLength={24} />
                                </div>
                                <button
                                  onClick={() => updateItem(idx, { enabled: item.enabled === false ? true : false })}
                                  title={item.enabled === false ? "Enable item" : "Disable item"}
                                  className={`p-1 rounded transition-colors ${item.enabled === false ? "text-muted-foreground/40 hover:text-muted-foreground" : "text-green-600 hover:text-green-700"}`}>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteItem(idx)} disabled={liveItems.length <= 1}
                                  className="text-red-400 hover:text-red-600 disabled:opacity-20 p-1">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {/* Row 2: description */}
                              <input value={item.description} onChange={e => updateItem(idx, { description: e.target.value })}
                                className="w-full border border-input rounded px-2 py-1 text-xs bg-background text-muted-foreground" placeholder="Description (shown under label)" maxLength={72} />
                              {/* Row 3: custom reply message */}
                              <textarea value={item.replyMessage ?? ""} onChange={e => updateItem(idx, { replyMessage: e.target.value })}
                                rows={2}
                                className="w-full border border-input rounded px-2 py-1 text-xs bg-background resize-none font-mono"
                                placeholder="Auto-reply when this item is tapped (leave blank for default AI / flow handling)" />
                              {/* Row 4: section title (all items) */}
                              <input value={item.sectionTitle ?? ""} onChange={e => updateItem(idx, { sectionTitle: e.target.value })}
                                className="w-full border border-input rounded px-2 py-1 text-xs bg-background" placeholder="Section header above this item (optional)" maxLength={24} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: live WA preview */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" />Live WhatsApp Preview</p>
                      <div className="bg-[#e5ddd5] rounded-xl p-3 space-y-2 max-w-xs">
                        <div className="bg-white rounded-xl px-3 py-2.5 text-xs shadow-sm">
                          <p className="font-semibold text-[11px] text-[#25D366] mb-1">KDF NUTS 🥜</p>
                          <p className="text-gray-800 leading-relaxed whitespace-pre-line">{greeting}</p>
                        </div>
                        <div className="border border-[#25D366] bg-white rounded-xl text-xs text-center py-1.5 text-[#25D366] font-medium">View Options ▾</div>
                        <div className="bg-white rounded-xl shadow-sm text-xs divide-y divide-gray-100">
                          {liveItems.map((item, i) => (
                            <div key={item.id} className="px-3 py-2">
                              <div className="flex items-center gap-2 text-gray-800">
                                <span>{item.emoji}</span>
                                <span className="font-medium">{item.label || "…"}</span>
                              </div>
                              {item.description && <p className="text-gray-400 text-[10px] mt-0.5 ml-5">{item.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Live preview updates as you edit</p>
                    </div>
                  </div>

                  {/* Greeting Keywords */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Greeting Keywords (comma separated)</Label>
                    <Input
                      value={chatbotForm.menuGreetingKeywords}
                      onChange={e => setChatbotForm(f => ({ ...f, menuGreetingKeywords: e.target.value }))}
                      placeholder="hi,hello,hey,salam,start,menu,help,shop"
                    />
                    <p className="text-xs text-muted-foreground">When a customer sends any of these words, they'll receive the interactive menu.</p>
                  </div>

                  {/* Website URL */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Website URL (for "Shop Products" &amp; "Visit Website")</Label>
                    <Input
                      value={chatbotForm.websiteUrl}
                      onChange={e => setChatbotForm(f => ({ ...f, websiteUrl: e.target.value }))}
                      placeholder="https://kdfnuts.com"
                    />
                  </div>

                  {/* Discount Code + Message */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Discount Code</Label>
                      <Input
                        value={chatbotForm.discountCode}
                        onChange={e => setChatbotForm(f => ({ ...f, discountCode: e.target.value }))}
                        placeholder="WELCOME10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Discount Message</Label>
                      <Textarea
                        value={chatbotForm.discountMessage}
                        onChange={e => setChatbotForm(f => ({ ...f, discountMessage: e.target.value }))}
                        rows={2}
                        className="text-sm resize-y"
                        placeholder="Your exclusive discount code…"
                      />
                    </div>
                  </div>

                  {/* Hot Deals Message */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Hot Deals Message</Label>
                    <Textarea
                      value={chatbotForm.hotDealsMessage}
                      onChange={e => setChatbotForm(f => ({ ...f, hotDealsMessage: e.target.value }))}
                      rows={3}
                      className="text-sm resize-y"
                      placeholder="🔥 Today's Hot Deals…"
                    />
                    <p className="text-xs text-muted-foreground">Sent when customer taps the "Hot Deals" menu item.</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Product Catalog Card ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50">
                  <ShoppingBag className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">AI Product Catalog</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Detect product questions and reply with matching product cards + buy buttons</p>
                </div>
              </div>
              <Switch
                checked={chatbotForm.catalogEnabled}
                onCheckedChange={v => setChatbotForm(f => ({ ...f, catalogEnabled: v }))}
              />
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5 text-xs text-emerald-800 leading-relaxed">
                <strong>How it works:</strong> When a customer asks about a product (e.g. "cashews price?", "kya milta hai?"), the AI searches your product database and replies with product name, price, and interactive <em>View Product</em> / <em>Buy Now</em> buttons — all before the regular AI chatbot kicks in.
              </div>

              {chatbotForm.catalogEnabled && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Max Products per Reply</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1} max={5}
                        value={chatbotForm.catalogMaxProducts}
                        onChange={e => setChatbotForm(f => ({ ...f, catalogMaxProducts: Number(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="w-8 text-center font-bold text-emerald-700 text-sm">
                        {chatbotForm.catalogMaxProducts}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Send 1–5 product cards per customer query (recommended: 3)</p>
                  </div>

                  <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview — what the customer sees</p>
                    <div className="bg-[#25D366]/5 border border-[#25D366]/20 rounded-xl p-3 space-y-2 text-xs">
                      <p className="font-semibold text-[#25D366]">🛍️ KDF NUTS Product Catalog 🥜</p>
                      <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1">
                        <p className="font-bold">*Premium Kashmiri Almonds*</p>
                        <p>💰 <strong>Price:</strong> Rs. 2,500</p>
                        <p className="text-gray-500">📝 Freshly packed, Grade A Kashmiri almonds...</p>
                        <div className="flex gap-1.5 pt-1">
                          <span className="bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/30 px-2 py-0.5 rounded text-[10px] font-medium">🔗 View Product</span>
                          <span className="bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/30 px-2 py-0.5 rounded text-[10px] font-medium">🛒 Buy Now</span>
                          <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-medium">🏠 Main Menu</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">One card per product · up to {chatbotForm.catalogMaxProducts} product{chatbotForm.catalogMaxProducts !== 1 ? "s" : ""} per reply</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                    <strong>Keyword detection:</strong> The catalog auto-fires when a message contains product-related words like: <em>almond, cashew, price, kya milta, buy, catalog, nuts, dry fruit…</em> — no configuration needed.
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button onClick={() => saveChatbot.mutate()} disabled={saveChatbot.isPending} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
            {saveChatbot.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Chatbot Settings"}
          </Button>

          {/* ── Test AI Reply ── */}
          <TestAIReply />

          {/* ── Website Chat Sessions ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-base">Website Chat Sessions</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">AI chat conversations from the website widget</p>
                </div>
              </div>
              <button onClick={() => refetchSessions()} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="flex divide-x divide-border" style={{ minHeight: 300 }}>
              <div className="w-56 flex-shrink-0 overflow-y-auto" style={{ maxHeight: 400 }}>
                {sessionsLoading ? (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
                ) : (chatSessions as any[]).length === 0 ? (
                  <div className="text-center py-8 px-4 text-muted-foreground">
                    <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No chat sessions yet.</p>
                    <p className="text-xs mt-1">Sessions appear when customers use the website chatbot.</p>
                  </div>
                ) : (
                  (chatSessions as any[]).map((s: any) => {
                    const msgs = (s.messages ?? []) as any[];
                    const last = msgs[msgs.length - 1];
                    return (
                      <button key={s.id} onClick={() => setSelectedSession(s)}
                        className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedSession?.id === s.id ? "bg-[#5FA800]/5 border-l-2 border-l-[#5FA800]" : ""}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-muted-foreground font-mono truncate">{s.sessionId?.slice(0, 16)}…</span>
                          <span className="text-[10px] text-muted-foreground/60 ml-1 flex-shrink-0">{msgs.length} msg</span>
                        </div>
                        {last && <p className="text-xs text-foreground truncate">{last.content?.slice(0, 50)}</p>}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20" style={{ maxHeight: 400 }}>
                {!selectedSession ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a session to view messages</div>
                ) : (
                  ((selectedSession.messages ?? []) as any[]).map((msg: any, i: number) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-xl text-xs leading-relaxed ${msg.role === "user" ? "bg-[#5FA800] text-white" : "bg-white border border-border text-foreground"}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {msg.timestamp && <p className={`text-[10px] mt-1 ${msg.role === "user" ? "text-white/70" : "text-muted-foreground"}`}>{new Date(msg.timestamp).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONVERSATIONS TAB ── */}
      {tab === "conversations" && (
        <div className="flex gap-3 h-[calc(100vh-260px)] min-h-[560px]">

          {/* ── LEFT: Conversation list ── */}
          <div className="w-72 flex-shrink-0 border border-border rounded-xl overflow-hidden flex flex-col bg-white">
            {/* Header + search */}
            <div className="px-3 py-2.5 border-b bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Conversations</p>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[#25D366] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse inline-block" />SSE Live
                  </span>
                  <button onClick={() => refetchConvs()} className="ml-1 text-muted-foreground hover:text-foreground transition-colors p-1 rounded"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <Input
                value={convSearch}
                onChange={e => setConvSearch(e.target.value)}
                placeholder="Search phone or name…"
                className="h-7 text-xs"
              />
              {/* Status filter tabs */}
              <div className="flex gap-1">
                {(["all","open","resolved","spam"] as const).map(f => (
                  <button key={f} onClick={() => setConvFilter(f)}
                    className={`flex-1 text-[10px] py-0.5 rounded font-medium transition-colors ${convFilter === f ? "bg-[#25D366] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {convsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
              ) : (conversations as any[]).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground px-4">
                  <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No conversations yet.</p>
                  <p className="text-xs mt-1">Messages appear when customers contact you via WhatsApp.</p>
                </div>
              ) : (
                (conversations as any[]).map((conv: any) => (
                  <button key={conv.phone ?? conv.id} onClick={() => { setSelectedPhone(conv.phone); setConvDetail(null); setConvNotes([]); }}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedPhone === conv.phone ? "bg-[#5FA800]/5 border-l-2 border-l-[#5FA800]" : ""}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {conv.is_starred && <span className="text-yellow-400 text-[10px]">★</span>}
                        <span className="text-xs font-medium font-mono truncate">{conv.contact_name ?? conv.phone}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {parseInt(conv.unread_count ?? "0") > 0 && (
                          <span className="text-[10px] font-bold text-white bg-[#25D366] rounded-full px-1.5 py-0.5">{conv.unread_count}</span>
                        )}
                        {conv.bot_mode === "human" && <span className="text-[9px] bg-orange-100 text-orange-600 rounded px-1 font-medium">Human</span>}
                        {conv.bot_mode === "off"   && <span className="text-[9px] bg-gray-100 text-gray-500 rounded px-1 font-medium">Off</span>}
                      </div>
                    </div>
                    {conv.contact_name && <p className="text-[10px] text-muted-foreground font-mono">{conv.phone}</p>}
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.last_message ?? "—"}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[10px] text-muted-foreground/60">
                        {conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </p>
                      {conv.intent && (
                        <span className="text-[9px] bg-blue-50 text-blue-600 rounded px-1">{conv.intent.replace(/_/g, " ")}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── MIDDLE: Chat window ── */}
          <div className="flex-1 border border-border rounded-xl overflow-hidden flex flex-col">
            {!selectedPhone ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageCircle className="w-14 h-14 mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a conversation</p>
                <p className="text-xs mt-1">Choose a contact from the left to view the chat</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between gap-2 flex-shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-[#25D366]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold font-mono truncate">
                        {convDetail?.contact_name ?? selectedPhone}
                        {convDetail?.is_starred && <span className="ml-1 text-yellow-400 text-xs">★</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{(chatMessages as any[]).length} msgs
                        {convDetail?.agent_name && <span className="ml-2 text-blue-500">Agent: {convDetail.agent_name}</span>}
                        {convDetail?.intent && <span className="ml-2 text-orange-500">Intent: {convDetail.intent.replace(/_/g, " ")}</span>}
                      </p>
                    </div>
                  </div>
                  {/* Action toolbar */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Bot mode switcher */}
                    <div className="flex items-center rounded-lg border border-border overflow-hidden text-[10px] font-medium">
                      {(["auto","human","off"] as const).map(m => (
                        <button key={m} onClick={() => toggleBotMode(m)} disabled={botModeChanging}
                          className={`px-2 py-1 transition-colors ${convDetail?.bot_mode === m ? "bg-[#25D366] text-white" : "bg-white text-muted-foreground hover:bg-muted/40"}`}>
                          {m === "auto" ? "🤖" : m === "human" ? "👤" : "🔕"}
                        </button>
                      ))}
                    </div>
                    {/* Resolve */}
                    <button onClick={() => toggleConvStatus(convDetail?.status === "resolved" ? "open" : "resolved")}
                      className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${convDetail?.status === "resolved" ? "bg-gray-100 text-gray-600" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"}`}>
                      {convDetail?.status === "resolved" ? "Reopen" : "✓ Resolve"}
                    </button>
                    {/* Star */}
                    <button onClick={toggleStar} className={`p-1.5 rounded-lg border transition-colors ${convDetail?.is_starred ? "text-yellow-500 border-yellow-200 bg-yellow-50" : "text-muted-foreground border-border hover:bg-muted/30"}`}>
                      <span className="text-sm">★</span>
                    </button>
                    {/* Note */}
                    <button onClick={() => setShowNoteInput(v => !v)}
                      className={`p-1.5 rounded-lg border text-xs transition-colors ${showNoteInput ? "bg-blue-50 text-blue-600 border-blue-200" : "text-muted-foreground border-border hover:bg-muted/30"}`}
                      title="Add internal note">
                      📝
                    </button>
                    <button onClick={() => refetchMsgs()} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg border border-border hover:bg-muted/30"><RefreshCw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setShowRightPanel(v => !v)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg border border-border hover:bg-muted/30" title="Toggle info panel">
                      <span className="text-xs">⚙</span>
                    </button>
                  </div>
                </div>

                {/* Internal note input */}
                {showNoteInput && (
                  <div className="px-4 py-2 border-b bg-blue-50/60 flex items-center gap-2">
                    <span className="text-[10px] text-blue-600 font-semibold">Internal Note</span>
                    <Input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add note (not sent to customer)…" className="flex-1 h-7 text-xs bg-white" />
                    <Button size="sm" onClick={addNote} className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white">Save</Button>
                    <button onClick={() => setShowNoteInput(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
                  </div>
                )}

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]/20">
                  {msgsLoading ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : (chatMessages as any[]).length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">No messages in this conversation yet.</div>
                  ) : (
                    <>
                      {(chatMessages as any[]).map(msg => msgBubble(msg))}
                      <div ref={chatEndRef} />
                    </>
                  )}
                </div>

                {/* Template picker dropdown */}
                {showTemplatePickerConv && (
                  <div className="border-t bg-muted/30 px-4 py-2 max-h-48 overflow-y-auto">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Approved Templates — click to use</p>
                    {(approvedTemplates as any[]).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No approved templates yet. Submit templates in the Templates tab.</p>
                    ) : (
                      (approvedTemplates as any[]).map((tpl: any) => (
                        <button key={tpl.id}
                          onClick={() => {
                            setReplyMsg(tpl.messageBody);
                            setShowTemplatePickerConv(false);
                          }}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-border mb-1 transition-colors">
                          <span className="font-medium text-foreground">{tpl.name}</span>
                          <span className="ml-2 text-muted-foreground truncate block">{tpl.messageBody.slice(0, 80)}…</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="border-t bg-white px-4 py-3 flex items-center gap-2">
                  <button
                    onClick={() => setShowTemplatePickerConv(v => !v)}
                    title="Insert approved template"
                    className={`flex-shrink-0 p-2 rounded-lg border transition-colors ${showTemplatePickerConv ? "bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366]" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}>
                    <FileText className="w-4 h-4" />
                  </button>
                  <Input
                    value={replyMsg}
                    onChange={e => setReplyMsg(e.target.value)}
                    placeholder="Type a reply… or click 📄 to pick a template"
                    className="flex-1"
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  />
                  <Button onClick={sendReply} disabled={isSendingReply || !replyMsg.trim()} style={{ backgroundColor: "#25D366" }} className="text-white gap-1.5 flex-shrink-0">
                    {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT: Conversation Info Panel ── */}
          {selectedPhone && showRightPanel && (
            <div className="w-60 flex-shrink-0 border border-border rounded-xl overflow-hidden flex flex-col bg-white text-xs">
              <div className="px-3 py-2.5 border-b bg-muted/20 flex items-center justify-between">
                <p className="text-xs font-semibold">Contact Info</p>
                <button onClick={() => setShowRightPanel(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {/* Contact details */}
                <div className="px-3 py-3 border-b space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-[#25D366]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{convDetail?.contact_name ?? "Unknown"}</p>
                      <p className="text-muted-foreground font-mono">{selectedPhone}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className={`font-medium ${convDetail?.status === "open" ? "text-green-600" : convDetail?.status === "resolved" ? "text-blue-600" : "text-gray-500"}`}>
                        {convDetail?.status ?? "open"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Bot Mode</span>
                      <span className={`font-medium ${convDetail?.bot_mode === "auto" ? "text-green-600" : convDetail?.bot_mode === "human" ? "text-orange-600" : "text-gray-500"}`}>
                        {convDetail?.bot_mode ?? "auto"}
                      </span>
                    </div>
                    {convDetail?.agent_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Agent</span>
                        <span className="font-medium text-blue-600">{convDetail.agent_name}</span>
                      </div>
                    )}
                    {convDetail?.intent && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Intent</span>
                        <span className="font-medium text-orange-600">{convDetail.intent.replace(/_/g, " ")}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Messages</span>
                      <span className="font-medium">{chatMessages.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Starred</span>
                      <span>{convDetail?.is_starred ? "⭐ Yes" : "No"}</span>
                    </div>
                  </div>
                </div>

                {/* Internal note */}
                {convDetail?.internal_note && (
                  <div className="px-3 py-2.5 border-b bg-blue-50/50">
                    <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1">Latest Note</p>
                    <p className="text-muted-foreground leading-relaxed">{convDetail.internal_note}</p>
                  </div>
                )}

                {/* Agent notes history */}
                {convNotes.length > 0 && (
                  <div className="px-3 py-2.5 border-b">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes History</p>
                    <div className="space-y-2">
                      {convNotes.map((n: any) => (
                        <div key={n.id} className="bg-yellow-50 rounded-lg p-2 border border-yellow-100">
                          <p className="leading-relaxed mb-1">{n.note}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {n.agent_name} · {n.created_at ? new Date(n.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick actions */}
                <div className="px-3 py-2.5 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</p>
                  <a href={`https://wa.me/${selectedPhone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors font-medium">
                    <MessageCircle className="w-3.5 h-3.5" />Open in WhatsApp
                  </a>
                  <button onClick={() => toggleBotMode("human")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors font-medium">
                    <User className="w-3.5 h-3.5" />Take Over (Human)
                  </button>
                  <button onClick={() => toggleBotMode("auto")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors font-medium">
                    <Sparkles className="w-3.5 h-3.5" />Return to AI Bot
                  </button>
                  <button onClick={() => toggleConvStatus(convDetail?.status === "resolved" ? "open" : "resolved")}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors font-medium">
                    <CheckSquare className="w-3.5 h-3.5" />
                    {convDetail?.status === "resolved" ? "Reopen" : "Mark Resolved"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TEMPLATES TAB ── */}
      {tab === "templates" && <WhatsAppTemplatesTab />}

      {/* ── ANALYTICS TAB ── */}
      {tab === "analytics" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#25D366]" />Meta WA Cost &amp; Analytics</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Message volume, delivery rates, and estimated Meta conversation charges</p>
            </div>
            <div className="flex items-center gap-2">
              {([7, 14, 30, 90] as const).map(d => (
                <button key={d} onClick={() => setAnalyticsDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${analyticsDays === d ? "bg-[#5FA800] text-white shadow" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{d}d</button>
              ))}
              <button onClick={() => refetchCostStats()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><RefreshCw className="w-4 h-4" /></button>
            </div>
          </div>

          {costLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !costStats ? (
            <div className="text-center py-16 text-muted-foreground">No analytics data available yet.</div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Messages", value: costStats.totalMessages ?? 0, icon: MessageCircle, color: "#25D366" },
                  { label: "Delivered", value: costStats.delivered ?? 0, icon: CheckSquare, color: "#5FA800" },
                  { label: "Failed", value: costStats.failed ?? 0, icon: XCircle, color: "#ef4444" },
                  { label: "Delivery Rate", value: `${costStats.deliveryRate ?? 0}%`, icon: TrendingUp, color: "#6366f1" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                    <p className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
                  </div>
                ))}
              </div>

              {/* Cost estimate card */}
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Estimated Meta API Cost</p>
                    <p className="text-3xl font-bold text-emerald-900">PKR {(costStats.estimatedCostPKR ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 mt-1">≈ USD {(costStats.estimatedCostUSD ?? 0).toFixed(2)} · Based on Meta's per-conversation pricing</p>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /><span className="text-muted-foreground">Marketing:</span><span className="font-semibold">{costStats.marketingConversations ?? 0}</span></div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-400" /><span className="text-muted-foreground">Utility:</span><span className="font-semibold">{costStats.utilityConversations ?? 0}</span></div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /><span className="text-muted-foreground">Service:</span><span className="font-semibold">{costStats.serviceConversations ?? 0}</span></div>
                  </div>
                </div>
              </div>

              {/* Message type breakdown */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold text-sm mb-4">Message Type Breakdown</h3>
                <div className="space-y-3">
                  {(costStats.byType ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No message data for this period</p>
                  ) : (costStats.byType as any[]).map((row: any) => {
                    const pct = costStats.totalMessages > 0 ? Math.round((row.count / costStats.totalMessages) * 100) : 0;
                    const colors: Record<string, string> = { order_confirmation: "#25D366", order_packed: "#5FA800", order_failed_delivery: "#ef4444", review_request: "#6366f1", campaign: "#f59e0b", cart_recovery: "#ec4899", rider_assigned: "#0ea5e9", return_refund: "#8b5cf6" };
                    const col = colors[row.type] ?? "#94a3b8";
                    return (
                      <div key={row.type} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-40 shrink-0 capitalize">{row.type.replace(/_/g, " ")}</span>
                        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: col }} />
                        </div>
                        <span className="text-xs font-semibold w-8 text-right">{row.count}</span>
                        <span className="text-[10px] text-muted-foreground w-9 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Daily trend */}
              {(costStats.dailyTrend ?? []).length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b bg-muted/30"><h3 className="font-semibold text-sm">Daily Trend</h3></div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/20">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Date</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Sent</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Delivered</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Failed</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground hidden md:table-cell">Est. PKR</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {(costStats.dailyTrend as any[]).slice(0, 14).map((row: any) => (
                        <tr key={row.date} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-xs font-mono">{row.date}</td>
                          <td className="px-4 py-2.5 text-xs text-right">{row.sent}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-green-600">{row.delivered}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-red-500">{row.failed}</td>
                          <td className="px-4 py-2.5 text-xs text-right hidden md:table-cell">Rs.{(row.estimatedCostPKR ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Campaign performance */}
              {(costStats.campaignPerformance ?? []).length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b bg-muted/30"><h3 className="font-semibold text-sm">Campaign Performance</h3></div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/20">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Campaign</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Sent</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Delivered</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Failed</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Rate</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {(costStats.campaignPerformance as any[]).map((row: any) => (
                        <tr key={row.campaignId} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-xs font-medium">{row.name}</td>
                          <td className="px-4 py-2.5 text-xs text-right">{row.sent}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-green-600">{row.delivered}</td>
                          <td className="px-4 py-2.5 text-xs text-right text-red-500">{row.failed}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-semibold">{row.deliveryRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Chatbot Performance Section ── */}
          {chatbotAnalytics && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pt-1">
                <Bot className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-base">Chatbot Performance</h3>
                <span className="text-xs text-muted-foreground">({chatbotAnalytics.days}d)</span>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "AI Replies", value: chatbotAnalytics.aiReplies, sub: `${chatbotAnalytics.aiRepliesToday} today`, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100" },
                  { label: "Bot Handle Rate", value: `${chatbotAnalytics.botHandleRate}%`, sub: `of ${chatbotAnalytics.incomingTotal} messages`, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100" },
                  { label: "Menu Interactions", value: chatbotAnalytics.menuInteractions, sub: "taps on menu options", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
                  { label: "Resolution Rate", value: `${chatbotAnalytics.resolutionRate}%`, sub: `${chatbotAnalytics.resolvedConversations} resolved`, color: "text-green-600", bg: "bg-green-50", border: "border-green-100" },
                ].map(({ label, value, sub, color, bg, border }) => (
                  <div key={label} className={`rounded-xl border ${border} ${bg} px-4 py-3`}>
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Bot vs Human mode */}
              {chatbotAnalytics.totalConversations > 0 && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold">Bot vs Human Mode</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
                      <div className="h-full bg-indigo-500 rounded-l-full transition-all" style={{ width: `${chatbotAnalytics.totalConversations > 0 ? Math.round((chatbotAnalytics.botModeConversations / chatbotAnalytics.totalConversations) * 100) : 0}%` }} />
                      <div className="h-full bg-amber-400 rounded-r-full transition-all" style={{ width: `${chatbotAnalytics.totalConversations > 0 ? Math.round((chatbotAnalytics.humanModeConversations / chatbotAnalytics.totalConversations) * 100) : 0}%` }} />
                    </div>
                    <div className="flex gap-3 text-xs shrink-0">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />Bot {chatbotAnalytics.botModeConversations}</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Human {chatbotAnalytics.humanModeConversations}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Top flows */}
              {(chatbotAnalytics.topFlows ?? []).length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b bg-muted/30"><h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />Top Triggered Flows</h3></div>
                  <div className="divide-y divide-border">
                    {(chatbotAnalytics.topFlows as any[]).map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-muted/20">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{f.name}</span>
                          {(f.keywords ?? []).length > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground font-mono">({(f.keywords as string[]).slice(0, 3).join(", ")})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">{f.action}</span>
                          <span className="font-bold text-sm">{f.firedCount ?? 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SMART RULES TAB ── */}
      {tab === "rules" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" />Smart Automation Rules</h2>
              <p className="text-sm text-muted-foreground mt-0.5">IF/THEN triggers — automatically send WhatsApp messages based on customer behavior</p>
            </div>
            <Button onClick={() => setShowRuleForm(v => !v)} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
              <Plus className="w-4 h-4" /> New Rule
            </Button>
          </div>

          {/* Stats bar */}
          {autoStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Active Rules", value: autoStats.activeRules ?? 0, color: "#5FA800" },
                { label: "Fired (24h)", value: autoStats.firedToday ?? 0, color: "#6366f1" },
                { label: "Fired (7d)", value: autoStats.firedWeek ?? 0, color: "#0ea5e9" },
                { label: "Total Fired", value: autoStats.totalFired ?? 0, color: "#25D366" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-xl font-bold" style={{ color }}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Create Rule form */}
          {showRuleForm && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />Create Automation Rule</h3>
              <div className="space-y-1.5">
                <Label>Trigger Type</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {RULE_TEMPLATES.map(tpl => (
                    <button key={tpl.id} onClick={() => setNewRule((r: any) => ({ ...r, triggerType: tpl.id, name: tpl.label, triggerConfig: { delayMinutes: tpl.defaultDelay * 60, couponCode: tpl.defaultCoupon } }))}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${newRule.triggerType === tpl.id ? "border-[#5FA800] bg-[#5FA800]/5" : "border-border hover:border-muted-foreground/40"}`}>
                      <p className="font-medium text-sm">{tpl.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tpl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Rule Name</Label>
                  <Input value={newRule.name} onChange={e => setNewRule((r: any) => ({ ...r, name: e.target.value }))} placeholder="e.g. 1h Cart Recovery" />
                </div>
                <div className="space-y-1.5">
                  <Label>Delay (minutes after trigger)</Label>
                  <Input type="number" min={1} value={newRule.triggerConfig?.delayMinutes ?? 60} onChange={e => setNewRule((r: any) => ({ ...r, triggerConfig: { ...r.triggerConfig, delayMinutes: parseInt(e.target.value) || 60 } }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Coupon Code (optional)</Label>
                <Input value={newRule.triggerConfig?.couponCode ?? ""} onChange={e => setNewRule((r: any) => ({ ...r, triggerConfig: { ...r.triggerConfig, couponCode: e.target.value } }))} placeholder="e.g. SAVE10" />
              </div>
              <div className="space-y-1.5">
                <Label>Custom Message Template (optional)</Label>
                <textarea value={newRule.messageTemplate} onChange={e => setNewRule((r: any) => ({ ...r, messageTemplate: e.target.value }))} rows={3} placeholder="Leave blank to use default template. Use {{name}}, {{coupon}}, {{product}} placeholders." className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={newRule.isActive} onCheckedChange={v => setNewRule((r: any) => ({ ...r, isActive: v }))} />
                <Label>Active immediately</Label>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => createRule.mutate(newRule)} disabled={createRule.isPending || !newRule.name || !newRule.triggerType} style={{ backgroundColor: "#5FA800" }} className="text-white">
                  {createRule.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create Rule"}
                </Button>
                <Button variant="outline" onClick={() => setShowRuleForm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {(autoRules as any[]).length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-xl py-12 text-center">
              <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No automation rules yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first rule to automate WhatsApp messages based on customer events</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(autoRules as any[]).map((rule: any) => (
                <div key={rule.id} className={`bg-card border rounded-xl p-4 ${rule.isActive ? "border-border" : "border-dashed border-muted-foreground/30 opacity-60"}`}>
                  {editingRule?.id === rule.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={editingRule.name} onChange={e => setEditingRule((r: any) => ({ ...r, name: e.target.value }))} /></div>
                        <div className="space-y-1"><Label className="text-xs">Delay (min)</Label><Input type="number" value={editingRule.triggerConfig?.delayMinutes ?? 60} onChange={e => setEditingRule((r: any) => ({ ...r, triggerConfig: { ...r.triggerConfig, delayMinutes: parseInt(e.target.value) || 60 } }))} /></div>
                      </div>
                      <div className="space-y-1"><Label className="text-xs">Coupon Code</Label><Input value={editingRule.triggerConfig?.couponCode ?? ""} onChange={e => setEditingRule((r: any) => ({ ...r, triggerConfig: { ...r.triggerConfig, couponCode: e.target.value } }))} /></div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateRule.mutate(editingRule)} disabled={updateRule.isPending} style={{ backgroundColor: "#5FA800" }} className="text-white">
                          {updateRule.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingRule(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{rule.name}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{(rule.triggerType ?? "").replace(/_/g, " ")}</span>
                          {rule.isActive
                            ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                            : <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Paused</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><TimerIcon className="w-3 h-3" />Delay: {Math.round((rule.triggerConfig?.delayMinutes ?? 60) / 60)}h</span>
                          {rule.triggerConfig?.couponCode && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Coupon: <span className="font-mono font-semibold text-[#5FA800]">{rule.triggerConfig.couponCode}</span></span>}
                          <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" />Fired: {rule.firedCount ?? 0}</span>
                          {rule.lastFiredAt && <span>Last: {new Date(rule.lastFiredAt).toLocaleDateString("en-PK")}</span>}
                        </div>
                        {rule.messageTemplate && <p className="text-xs text-muted-foreground mt-1.5 italic line-clamp-2">"{rule.messageTemplate}"</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch checked={rule.isActive} onCheckedChange={() => toggleRule.mutate(rule.id)} />
                        <Button size="sm" variant="ghost" onClick={() => setEditingRule(rule)} className="text-muted-foreground hover:text-foreground"><Settings className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this rule?")) deleteRule.mutate(rule.id); }} className="text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Automation Logs */}
          {(autoLogs as any[]).length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Phone className="w-4 h-4" />Recent Automation Logs</h3>
                <span className="text-xs text-muted-foreground">{(autoLogs as any[]).length} entries</span>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/20">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Rule</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">Trigger</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Phone</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden lg:table-cell">Time</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {(autoLogs as any[]).map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs font-medium">{log.ruleName ?? `Rule #${log.ruleId}`}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell font-mono">{log.triggerType}</td>
                      <td className="px-4 py-2.5 text-xs font-mono">{log.phone}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${log.status === "sent" ? "bg-green-100 text-green-700" : log.status === "failed" ? "bg-red-100 text-red-700" : log.status === "skipped" ? "bg-gray-100 text-gray-500" : "bg-blue-100 text-blue-700"}`}>{log.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">{new Date(log.createdAt).toLocaleString("en-PK")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── AI FLOWS TAB (Phase 4) ── */}
      {tab === "flows" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2"><GitBranch className="w-5 h-5 text-indigo-500" />AI Flow Builder</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Define keyword triggers → actions. Flows run before the AI chatbot and override it when matched.</p>
            </div>
            <Button onClick={() => setShowFlowForm(v => !v)} style={{ backgroundColor: "#5FA800" }} className="text-white gap-1.5">
              <Plus className="w-4 h-4" /> New Flow
            </Button>
          </div>

          {/* Info */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-800 flex items-start gap-2">
            <GitBranch className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-indigo-500" />
            <div>
              <strong>How AI Flows work:</strong> When a customer sends a message, the system checks all enabled flows in priority order. If a keyword matches, the configured action runs immediately — bypassing the AI chatbot. Great for FAQs, product links, and automated responses.
            </div>
          </div>

          {/* Create flow form */}
          {showFlowForm && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><GitBranch className="w-4 h-4 text-indigo-500" />Create Flow</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Flow Name *</Label>
                  <Input value={newFlow.name} onChange={e => setNewFlow((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. Product Inquiry" />
                </div>
                <div className="space-y-1.5">
                  <Label>Priority (higher = checked first)</Label>
                  <Input type="number" min={0} max={100} value={newFlow.priority} onChange={e => setNewFlow((f: any) => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Input value={newFlow.description} onChange={e => setNewFlow((f: any) => ({ ...f, description: e.target.value }))} placeholder="Brief description of this flow" />
              </div>

              {/* Keywords */}
              <div className="space-y-1.5">
                <Label>Trigger Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    value={newFlowKeyword}
                    onChange={e => setNewFlowKeyword(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newFlowKeyword.trim()) {
                        e.preventDefault();
                        setNewFlow((f: any) => ({ ...f, keywords: [...(f.keywords || []), newFlowKeyword.trim().toLowerCase()] }));
                        setNewFlowKeyword("");
                      }
                    }}
                    placeholder="Type keyword + Enter to add"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={() => {
                    if (newFlowKeyword.trim()) {
                      setNewFlow((f: any) => ({ ...f, keywords: [...(f.keywords || []), newFlowKeyword.trim().toLowerCase()] }));
                      setNewFlowKeyword("");
                    }
                  }}>Add</Button>
                </div>
                {(newFlow.keywords || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(newFlow.keywords as string[]).map((kw: string, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        {kw}
                        <button onClick={() => setNewFlow((f: any) => ({ ...f, keywords: f.keywords.filter((_: string, j: number) => j !== i) }))} className="hover:text-red-500">✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Add keywords that trigger this flow. Leave empty to match all messages (use with high priority carefully).</p>
              </div>

              {/* Action */}
              <div className="space-y-2">
                <Label>Action</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {FLOW_ACTIONS.map(act => (
                    <button key={act.value} onClick={() => setNewFlow((f: any) => ({ ...f, action: act.value, actionData: {} }))}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${newFlow.action === act.value ? "border-indigo-500 bg-indigo-50" : "border-border hover:border-muted-foreground/40"}`}>
                      <p className="font-medium text-sm">{act.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{act.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action data */}
              {newFlow.action === "send_message" && (
                <div className="space-y-1.5">
                  <Label>Message to Send</Label>
                  <textarea value={newFlow.actionData?.message ?? ""} onChange={e => setNewFlow((f: any) => ({ ...f, actionData: { ...f.actionData, message: e.target.value } }))}
                    rows={3} placeholder="The message sent to the customer when this flow matches" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none" />
                </div>
              )}
              {newFlow.action === "send_url" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>URL</Label>
                    <Input value={newFlow.actionData?.url ?? ""} onChange={e => setNewFlow((f: any) => ({ ...f, actionData: { ...f.actionData, url: e.target.value } }))} placeholder="https://kdfnuts.com/products" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Button Text</Label>
                    <Input value={newFlow.actionData?.buttonText ?? ""} onChange={e => setNewFlow((f: any) => ({ ...f, actionData: { ...f.actionData, buttonText: e.target.value } }))} placeholder="Shop Now" />
                  </div>
                </div>
              )}
              {newFlow.action === "send_discount" && (
                <div className="space-y-1.5">
                  <Label>Discount Code</Label>
                  <Input value={newFlow.actionData?.discountCode ?? ""} onChange={e => setNewFlow((f: any) => ({ ...f, actionData: { ...f.actionData, discountCode: e.target.value } }))} placeholder="SAVE20" />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch checked={newFlow.isEnabled} onCheckedChange={v => setNewFlow((f: any) => ({ ...f, isEnabled: v }))} />
                <Label>Enable immediately</Label>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => createFlow.mutate(newFlow)} disabled={createFlow.isPending || !newFlow.name} style={{ backgroundColor: "#5FA800" }} className="text-white">
                  {createFlow.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create Flow"}
                </Button>
                <Button variant="outline" onClick={() => { setShowFlowForm(false); setNewFlow(EMPTY_FLOW); }}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Flows list */}
          {(waFlows as any[]).length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-xl py-14 text-center">
              <GitBranch className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No flows yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first flow to intercept keywords and trigger instant responses</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(waFlows as any[]).map((flow: any) => (
                <div key={flow.id} className={`bg-card border rounded-xl p-4 ${flow.isEnabled ? "border-border" : "border-dashed border-muted-foreground/30 opacity-60"}`}>
                  {editingFlow?.id === flow.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={editingFlow.name} onChange={e => setEditingFlow((f: any) => ({ ...f, name: e.target.value }))} /></div>
                        <div className="space-y-1"><Label className="text-xs">Priority</Label><Input type="number" value={editingFlow.priority ?? 0} onChange={e => setEditingFlow((f: any) => ({ ...f, priority: parseInt(e.target.value) || 0 }))} /></div>
                      </div>
                      <div className="space-y-1"><Label className="text-xs">Description</Label><Input value={editingFlow.description ?? ""} onChange={e => setEditingFlow((f: any) => ({ ...f, description: e.target.value }))} /></div>
                      {editingFlow.action === "send_message" && (
                        <div className="space-y-1"><Label className="text-xs">Message</Label>
                          <textarea value={editingFlow.actionData?.message ?? ""} onChange={e => setEditingFlow((f: any) => ({ ...f, actionData: { ...f.actionData, message: e.target.value } }))} rows={2} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none" />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateFlow.mutate(editingFlow)} disabled={updateFlow.isPending} style={{ backgroundColor: "#5FA800" }} className="text-white">
                          {updateFlow.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingFlow(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{flow.name}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {FLOW_ACTIONS.find(a => a.value === flow.action)?.label ?? flow.action}
                          </span>
                          {flow.priority > 0 && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">P{flow.priority}</span>}
                          {flow.isEnabled
                            ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                            : <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Off</span>}
                        </div>
                        {flow.description && <p className="text-xs text-muted-foreground mt-1">{flow.description}</p>}
                        {(flow.keywords ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(flow.keywords as string[]).map((kw: string, i: number) => (
                              <span key={i} className="text-[10px] bg-muted text-muted-foreground font-mono px-1.5 py-0.5 rounded">{kw}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Zap className="w-3 h-3" />Fired: {flow.firedCount ?? 0}</span>
                          {flow.updatedAt && <span>Updated: {new Date(flow.updatedAt).toLocaleDateString("en-PK")}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch checked={flow.isEnabled} onCheckedChange={() => toggleFlow.mutate(flow.id)} />
                        <Button size="sm" variant="ghost" title="Test this flow"
                          onClick={() => { setTestingFlowId(testingFlowId === flow.id ? null : flow.id); setFlowTestInput(""); setFlowTestResult(null); }}
                          className={testingFlowId === flow.id ? "text-blue-600 bg-blue-50" : "text-muted-foreground hover:text-foreground"}>
                          <Zap className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingFlow(flow)} className="text-muted-foreground hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this flow?")) deleteFlow.mutate(flow.id); }} className="text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    {testingFlowId === flow.id && (
                      <div className="border-t border-border pt-3 space-y-2 mt-1">
                        <p className="text-xs font-medium text-blue-600 flex items-center gap-1.5"><Zap className="w-3 h-3" />Test Flow — type a sample customer message to see if it would trigger</p>
                        <div className="flex gap-2">
                          <input
                            value={flowTestInput}
                            onChange={e => { setFlowTestInput(e.target.value); setFlowTestResult(null); }}
                            onKeyDown={e => { if (e.key === "Enter" && flowTestInput.trim()) testFlow.mutate({ id: flow.id, message: flowTestInput }); }}
                            placeholder="e.g. track my order / hi / discount code"
                            className="flex-1 border border-input rounded-lg px-3 py-1.5 text-sm bg-background"
                          />
                          <Button size="sm" onClick={() => testFlow.mutate({ id: flow.id, message: flowTestInput })} disabled={testFlow.isPending || !flowTestInput.trim()} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                            {testFlow.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Run"}
                          </Button>
                        </div>
                        {flowTestResult && (flowTestResult as any).flowName === flow.name && (
                          <div className={`rounded-lg px-3 py-2.5 border ${flowTestResult.matched ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                            <p className={`font-semibold text-xs mb-1 ${flowTestResult.matched ? "text-green-700" : "text-amber-700"}`}>
                              {flowTestResult.matched ? "✅ Would trigger!" : "⚠️ Would NOT trigger — no keyword match"}
                            </p>
                            {flowTestResult.matched && <p className="text-xs text-gray-700">{flowTestResult.actionDescription}</p>}
                            {!flowTestResult.matched && (flowTestResult.keywords ?? []).length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">Expected keywords: {(flowTestResult.keywords as string[]).join(", ")}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "qr" && <WhatsAppQRTab />}

      {tab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Last 50 WhatsApp messages sent or received by the system.</p>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />Refresh
            </Button>
          </div>
          {logsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" />Loading logs…</div>
          ) : !(logs as any[])?.length ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
              <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No messages yet.</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Phone</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Type</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Message</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Delivery</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Time</th>
                    <th className="w-16 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(logs as any[]).map((log: any) => {
                    let parsedResp: any = null;
                    try { parsedResp = log.response ? JSON.parse(log.response) : null; } catch { parsedResp = null; }
                    const errCode = parsedResp?.error?.code ?? parsedResp?.errors?.[0]?.code;
                    const errMsg = parsedResp?.error?.message ?? parsedResp?.errors?.[0]?.message;
                    return (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">
                        <div>{log.phone}</div>
                        {log.messageId && <div className="text-[10px] text-muted-foreground/60 truncate max-w-[120px]" title={log.messageId}>{log.messageId.slice(0,20)}…</div>}
                      </td>
                      <td className="px-4 py-3 text-xs hidden md:table-cell">
                        <Badge variant="outline" className={
                          log.templateName === "incoming"    ? "bg-blue-50 text-blue-700 border-blue-200" :
                          log.templateName === "ai_reply"    ? "bg-purple-50 text-purple-700 border-purple-200" :
                          log.templateName === "admin_reply" ? "bg-gray-50 text-gray-700 border-gray-200" :
                          "bg-green-50 text-green-700 border-green-200"
                        }>{log.templateName ?? "sent"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-xs hidden lg:table-cell">
                        <div>{log.message}</div>
                        {errCode && <div className="text-[10px] text-red-500 mt-0.5">Error {errCode}: {errMsg}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={
                          log.status === "sent"     ? "bg-green-50 text-green-700 border-green-200" :
                          log.status === "received" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          log.status === "failed"   ? "bg-red-50 text-red-700 border-red-200" :
                          "bg-gray-50 text-gray-500 border-gray-200"
                        }>{log.status}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {log.deliveryStatus ? (
                          <Badge variant="outline" className={
                            log.deliveryStatus === "read"      ? "bg-purple-50 text-purple-700 border-purple-200" :
                            log.deliveryStatus === "delivered" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            log.deliveryStatus === "sent"      ? "bg-sky-50 text-sky-700 border-sky-200" :
                            log.deliveryStatus === "failed"    ? "bg-red-50 text-red-700 border-red-200" :
                            "bg-gray-50 text-gray-500 border-gray-200"
                          }>
                            {log.deliveryStatus === "read"      ? "✓✓ Read" :
                             log.deliveryStatus === "delivered" ? "✓✓ Delivered" :
                             log.deliveryStatus === "sent"      ? "✓ Sent" :
                             log.deliveryStatus === "failed"    ? "✗ Failed" :
                             log.deliveryStatus}
                          </Badge>
                        ) : log.status === "sent" ? (
                          <span className="text-[10px] text-muted-foreground/50">Pending…</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {new Date(log.createdAt).toLocaleString("en-PK")}
                      </td>
                      <td className="px-4 py-3">
                        {log.status === "failed" && (
                          <button
                            onClick={() => retryLogMutation.mutate(log.id)}
                            disabled={retryLogMutation.isPending}
                            title="Retry sending this message"
                            className="flex items-center gap-1 text-[10px] font-medium text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <RotateCw className="w-3 h-3" /> Retry
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
