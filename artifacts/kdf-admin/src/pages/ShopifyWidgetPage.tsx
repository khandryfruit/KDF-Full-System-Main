import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Code2, Copy, CheckCheck, ExternalLink, Zap, Globe, Settings,
  ChevronDown, ChevronUp, Info, MessageSquare, ShoppingBag, BarChart3, RefreshCw, AlertTriangle, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getApiBase } from "@/lib/apiBase";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Copied!", description: "Code copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
      {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function CodeBlock({ code, lang = "html" }: { code: string; lang?: string }) {
  return (
    <div className="relative bg-gray-900 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-xs text-gray-400 font-mono">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-sm text-green-300 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function StepCard({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="w-8 h-8 rounded-full bg-[#5FA800] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{num}</div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  );
}

export default function ShopifyWidgetPage() {
  const { toast } = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);

  /* Fetch install snippet from API */
  const { data: installData, isLoading } = useQuery({
    queryKey: ["/api/chat/shopify-install"],
    queryFn: async () => {
      const res = await fetch("/api/chat/shopify-install", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch install snippet");
      return res.json();
    },
    staleTime: 30000,
  });

  /* Fetch chat stats for the widget section */
  const { data: statsData } = useQuery({
    queryKey: ["/api/admin/chat/leads"],
    queryFn: () => apiFetch("/api/admin/chat/leads"),
    staleTime: 60000,
  });

  const { data: aiHealth, isFetching: healthFetching, refetch: refetchHealth } = useQuery({
    queryKey: ["/api/admin/chat/ai-health"],
    queryFn: () => apiFetch("/api/admin/chat/ai-health"),
    staleTime: 20000,
  });

  const widgetJsUrl =
    installData?.widgetUrl ??
    `${(getApiBase() || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "")}/api/widget.js`;
  const widgetScriptTag = `<script src="${widgetJsUrl}" async></script>`;
  const liquidSnippet = installData?.liquidSnippet ?? "Loading…";
  const themeInstructions: string[] = installData?.steps ?? installData?.themeInstructions ?? [];

  const advancedConfig = `<script>
  window.KDFChatConfig = {
    color: '#5FA800',       // Widget button color
    // embedUrl: 'https://your-custom-domain.com/kdf-nuts/home?embed=1',
    customer: {             // Optional: pre-fill customer info
      id: '{{ customer.id }}',
      name: '{{ customer.first_name }} {{ customer.last_name }}',
      email: '{{ customer.email }}',
      phone: '{{ customer.phone }}'
    }
  };
</script>`;

  const totalLeads = statsData?.stats?.total ?? 0;
  const shopifyLeads = statsData?.leads?.filter((l: any) => l.source === "shopify")?.length ?? 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#5FA800]" />
            Shopify Chat Widget
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Embed the KDF NUTS AI chat widget into your Shopify store in minutes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">
            <Zap className="w-3 h-3 mr-1" />
            Live
          </Badge>
          <a
            href="/api/widget.js"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview widget.js
          </a>
        </div>
      </div>

      {/* AI / OpenAI pipeline health */}
      <div
        className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 ${
          aiHealth?.credentialsResolveOk && aiHealth?.chatbotEnabled
            ? "bg-emerald-50/80 border-emerald-200"
            : "bg-amber-50/90 border-amber-200"
        }`}
      >
        <div className="flex gap-3 min-w-0">
          {aiHealth?.credentialsResolveOk && aiHealth?.chatbotEnabled ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-gray-900">AI chat pipeline</p>
            {healthFetching && !aiHealth ? (
              <p className="text-xs text-gray-600">Checking configuration…</p>
            ) : aiHealth ? (
              <ul className="text-xs text-gray-700 space-y-0.5 list-disc list-inside">
                <li>Chatbot enabled: <strong>{aiHealth.chatbotEnabled ? "yes" : "no"}</strong> (WhatsApp → Chatbot settings)</li>
                <li>AI enabled in DB: <strong>{aiHealth.aiEnabledInDb ? "yes" : "no"}</strong></li>
                <li>OpenAI key in database: <strong>{aiHealth.hasOpenAiKeyInDb ? "yes" : "no"}</strong></li>
                <li><code className="text-[11px] bg-white/60 px-1 rounded">OPENAI_API_KEY</code> on server: <strong>{aiHealth.hasOpenAiKeyInEnv ? "yes" : "no"}</strong></li>
                <li>Credentials resolve: <strong>{aiHealth.credentialsResolveOk ? "ok" : "failed"}</strong>
                  {aiHealth.keyFromEnv ? " (using env fallback)" : ""}
                </li>
                {!aiHealth.credentialsResolveOk && aiHealth.credentialError && (
                  <li className="text-amber-900 font-medium break-words">{aiHealth.credentialError}</li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-gray-600">Could not load health.</p>
            )}
            <p className="text-[11px] text-gray-500 pt-1">
              Fix: <a className="text-blue-600 underline font-medium" href="/ai-content">AI Content</a>
              {" · "}
              <a className="text-blue-600 underline font-medium" href="/whatsapp">WhatsApp / Chatbot</a>
              {" · "}
              Set <code className="bg-white/60 px-1 rounded">OPENAI_API_KEY</code> on Railway if the DB key is empty.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => refetchHealth()}>
          <RefreshCw className={`w-3.5 h-3.5 ${healthFetching ? "animate-spin" : ""}`} />
          Refresh check
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
        <p className="text-sm font-semibold text-gray-900">Shopify: chat opens but clicks do nothing</p>
        <ul className="text-xs text-gray-700 mt-2 space-y-1.5 list-disc list-inside leading-relaxed">
          <li>
            Re-copy the Liquid snippet from step 2 after deploy — it must set{" "}
            <code className="text-[11px] bg-white px-1 rounded border">window.KDFChatConfig</code>{" "}
            <strong>before</strong> loading <code className="text-[11px] bg-white px-1 rounded border">widget.js</code> (guests get <code className="text-[11px] bg-white px-1 rounded border">store: &quot;shopify&quot;</code>; logged-in customers also get cart + profile).
          </li>
          <li>
            Widget <strong>v3.3</strong> mounts inside a top-level <code className="text-[11px] bg-white px-1 rounded border">#kdf-chat-root</code> with correct{" "}
            <code className="text-[11px] bg-white px-1 rounded border">pointer-events</code> so theme overlays are less likely to swallow the iframe.
          </li>
          <li>
            The chat embed no longer forces <code className="text-[11px] bg-white px-1 rounded border">document.body.style.height</code> from{" "}
            <code className="text-[11px] bg-white px-1 rounded border">visualViewport</code> inside the iframe (that could clip the flex layout on Shopify).
          </li>
        </ul>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: <Globe className="w-4 h-4 text-blue-500" />, label: "Widget URL", value: "/api/widget.js", sub: "CDN-ready script" },
          { icon: <MessageSquare className="w-4 h-4 text-[#5FA800]" />, label: "Chat Leads", value: totalLeads, sub: "All sources" },
          { icon: <ShoppingBag className="w-4 h-4 text-purple-500" />, label: "Shopify Leads", value: shopifyLeads, sub: `source = shopify` },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">{s.icon}</div>
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-base font-bold text-gray-800 truncate max-w-[120px]">{s.value}</p>
              <p className="text-[10px] text-gray-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Installation Steps */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Installation Guide
        </h2>

        <StepCard num={1} title="Copy the Script Tag">
          <p className="text-xs text-gray-600">
            This single line loads the chat widget on any webpage, including Shopify.
          </p>
          <CodeBlock code={widgetScriptTag} lang="html" />
        </StepCard>

        <StepCard num={2} title="Add to Shopify Theme">
          <p className="text-xs text-gray-600">
            In your Shopify admin, go to <strong>Online Store → Themes → Edit code</strong>.
            Open <code className="bg-gray-100 px-1 rounded text-[11px]">layout/theme.liquid</code> and
            paste the script just before <code className="bg-gray-100 px-1 rounded text-[11px]">&lt;/body&gt;</code>.
          </p>
          {isLoading ? (
            <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <CodeBlock code={liquidSnippet} lang="liquid" />
          )}
        </StepCard>

        <StepCard num={3} title="Save & Preview">
          <div className="space-y-2">
            {(themeInstructions.length > 0 ? themeInstructions : [
              "Click Save in the Shopify theme editor.",
              "Visit your Shopify store — a green chat button appears bottom-right.",
              "Click it to open the KDF NUTS AI assistant.",
              "Customers can search products, place orders, and get support in Urdu & English.",
            ]).map((step: string, i: number) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-xs text-gray-600">{step}</p>
              </div>
            ))}
          </div>
        </StepCard>
      </div>

      {/* Advanced Config */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-800">Advanced Configuration</span>
            <Badge variant="outline" className="text-[10px]">Optional</Badge>
          </div>
          {showAdvanced ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 space-y-3 border-t border-gray-100">
            <p className="text-xs text-gray-600 pt-3">
              Add this <strong>before</strong> the widget script tag to customize behavior and pre-fill customer data from Shopify Liquid.
            </p>
            <CodeBlock code={advancedConfig} lang="liquid" />
            <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                When a logged-in Shopify customer opens the chat, their name, email, and phone are automatically injected — no re-entry needed.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Features */}
      <div className="bg-gradient-to-br from-[#5FA800]/5 to-emerald-50 rounded-2xl border border-[#5FA800]/20 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#5FA800]" />
          What the Widget Includes
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            "AI-powered product search (Urdu + English)",
            "Voice ordering via mic (ur-PK → en-US fallback)",
            "Auto cart building from natural language",
            "Direct order placement (COD)",
            "GPS address auto-detection",
            "WhatsApp escalation to human support",
            "Lead capture with CRM sync",
            "Shopify customer context injection",
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#5FA800] flex-shrink-0" />
              <p className="text-xs text-gray-700">{f}</p>
            </div>
          ))}
        </div>
      </div>

      {/* View Leads CTA */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Monitor Widget Leads</p>
          <p className="text-xs text-gray-500">Track all Shopify chat leads, interests, and cart activity in the CRM.</p>
        </div>
        <a href="/chat-leads" className="inline-flex items-center gap-2 bg-[#5FA800] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#4e8f00] transition-colors">
          <MessageSquare className="w-4 h-4" />
          View Leads
        </a>
      </div>
    </div>
  );
}
