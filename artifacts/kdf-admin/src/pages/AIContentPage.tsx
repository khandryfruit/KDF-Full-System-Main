import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Loader2, RefreshCw, Settings2, Languages, Mic2,
  FileText, Package, Tags, BookOpen, CheckCircle2, Wand2,
  Key, Eye, EyeOff, ShieldCheck, AlertTriangle, Brain,
  Zap, Bot, Image as ImageIcon, BarChart2, Globe,
  ChevronDown, ChevronRight, Check, X, TestTube2,
  Palette, Sliders, MessageCircle, Search, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
  return res.json();
}

/* ── Constants ── */
const PROVIDERS = [
  { id: "openai",   label: "OpenAI",    badge: "GPT-4o mini", color: "text-emerald-600 bg-emerald-50 border-emerald-200", keyField: "openaiApiKey",   placeholder: "sk-proj-...",    hint: "Get from platform.openai.com" },
  { id: "gemini",   label: "Gemini",    badge: "Flash 2.0",   color: "text-blue-600   bg-blue-50   border-blue-200",   keyField: "geminiApiKey",   placeholder: "AIza...",        hint: "Get from ai.google.dev" },
  { id: "deepseek", label: "DeepSeek",  badge: "Chat",        color: "text-violet-600 bg-violet-50 border-violet-200", keyField: "deepseekApiKey", placeholder: "sk-...",         hint: "Get from platform.deepseek.com" },
  { id: "claude",   label: "Claude",    badge: "Haiku 3",     color: "text-orange-600 bg-orange-50 border-orange-200", keyField: "claudeApiKey",   placeholder: "sk-ant-...",     hint: "Get from console.anthropic.com" },
];

const TASK_ROUTES: { key: string; label: string; icon: React.FC<any>; desc: string }[] = [
  { key: "content",  label: "Content Gen",  icon: FileText,      desc: "Products, blogs, categories" },
  { key: "chat",     label: "Chat / Bot",   icon: MessageCircle, desc: "Customer chatbot replies" },
  { key: "seo",      label: "SEO",          icon: Search,        desc: "Meta tags, keywords" },
  { key: "whatsapp", label: "WhatsApp",     icon: Send,          desc: "Campaign messages" },
  { key: "image",    label: "Image Gen",    icon: ImageIcon,     desc: "AI image generation" },
];

const PERSONALITIES = [
  { id: "professional",   label: "Professional",   desc: "Clear, authoritative, trustworthy" },
  { id: "friendly",       label: "Friendly",       desc: "Warm, conversational, approachable" },
  { id: "luxury",         label: "Luxury",         desc: "Exclusive, sophisticated, aspirational" },
  { id: "sales-expert",   label: "Sales Expert",   desc: "Persuasive, urgency-driven, high-converting" },
  { id: "seo-expert",     label: "SEO Expert",     desc: "Keyword-rich, Google-optimized content" },
  { id: "urdu-native",    label: "Urdu Native",    desc: "Blends Urdu naturally into English" },
  { id: "viral",          label: "Viral",          desc: "Punchy, shareable, scroll-stopping" },
];

const TONE_OPTIONS = [
  { value: "professional", label: "Professional", desc: "Clear, authoritative, trustworthy" },
  { value: "friendly",     label: "Friendly",     desc: "Warm, conversational, approachable" },
  { value: "marketing",    label: "Marketing",    desc: "Persuasive, high-converting, exciting" },
];

const LANG_OPTIONS = [
  { value: "english", label: "English" },
  { value: "urdu",    label: "Urdu (اردو)" },
];

const IMAGE_STYLES = [
  { id: "premium-ecommerce", label: "Premium Ecommerce" },
  { id: "lifestyle",         label: "Lifestyle" },
  { id: "luxury",            label: "Luxury" },
  { id: "minimal",           label: "Minimal" },
  { id: "3d-render",         label: "3D Render" },
  { id: "instagram",         label: "Instagram Style" },
  { id: "food-photography",  label: "Food Photography" },
];

const GEN_TYPES = [
  { type: "product-description",       label: "Product Description",       icon: Package,  desc: "Full desc + short summary" },
  { type: "product-description-human", label: "Human-like Description",    icon: Bot,      desc: "Natural, persuasive copy" },
  { type: "product-seo",               label: "Product SEO",               icon: Search,   desc: "Meta title + description + keywords" },
  { type: "category-description",      label: "Category Description",      icon: Tags,     desc: "Category desc + SEO meta" },
  { type: "blog-post",                 label: "Blog Article",              icon: BookOpen, desc: "Full article with headings + SEO" },
  { type: "wa-campaign",               label: "WhatsApp Campaign",         icon: Send,     desc: "Campaign message + CTA + emojis" },
  { type: "email-subject",             label: "Email Subject Lines",       icon: FileText, desc: "5 compelling subject lines" },
  { type: "ad-copy",                   label: "Ad Copy",                   icon: Zap,      desc: "Meta/Google ad headline + desc" },
];

/* ── Slider Component ── */
function SliderInput({ label, value, onChange, min = 0, max = 100, desc }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; desc?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-semibold text-primary">{value}%</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 accent-purple-600 cursor-pointer" />
      {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
    </div>
  );
}

/* ── Provider Key Card ── */
function ProviderCard({
  provider, apiKey, onKeyChange, onTest, testing, testResult, isHasKey, isPrimary, isFallback,
  onSetPrimary, onSetFallback,
}: {
  provider: typeof PROVIDERS[0];
  apiKey: string;
  onKeyChange: (v: string) => void;
  onTest: () => void;
  testing: boolean;
  testResult: "ok" | "fail" | null;
  isHasKey: boolean;
  isPrimary: boolean;
  isFallback: boolean;
  onSetPrimary: () => void;
  onSetFallback: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={`border rounded-xl p-4 space-y-3 transition-all ${isPrimary ? "border-purple-300 bg-purple-50/40" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-black ${provider.color}`}>
            {provider.label[0]}
          </div>
          <div>
            <p className="font-semibold text-sm leading-none">{provider.label}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${provider.color}`}>{provider.badge}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isHasKey && testResult === "ok"   && <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5"><Check className="w-3 h-3" />Connected</span>}
          {isHasKey && testResult === "fail"  && <span className="text-[10px] text-red-600   font-medium flex items-center gap-0.5"><X     className="w-3 h-3" />Failed</span>}
          {isHasKey && (
            <button onClick={onTest} disabled={testing}
              className="text-[11px] px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1">
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube2 className="w-3 h-3" />}
              Test
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <Input type={show ? "text" : "password"} value={apiKey} onChange={e => onKeyChange(e.target.value)}
          placeholder={provider.placeholder} className="pr-9 font-mono text-xs" />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{isHasKey ? "Key saved. Enter new to replace." : provider.hint}</p>

      <div className="flex gap-1.5">
        <button onClick={onSetPrimary}
          className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${isPrimary ? "bg-purple-600 text-white border-purple-600" : "border-border hover:bg-muted"}`}>
          {isPrimary ? "✓ Primary" : "Set Primary"}
        </button>
        <button onClick={onSetFallback}
          className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${isFallback ? "bg-blue-600 text-white border-blue-600" : "border-border hover:bg-muted"}`}>
          {isFallback ? "✓ Fallback" : "Set Fallback"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function AIContentPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ["/api/admin/ai/settings"],
    queryFn: () => apiFetch("/api/admin/ai/settings").catch(() => null),
  });

  /* ── Form State ── */
  const [aiEnabled, setAiEnabled] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiOrgId,  setOpenaiOrgId]  = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");

  const [primaryProvider,  setPrimaryProvider]  = useState("openai");
  const [fallbackProvider, setFallbackProvider] = useState("");
  const [taskRouting, setTaskRouting] = useState<Record<string, string>>({
    chat: "openai", content: "openai", seo: "openai", image: "openai", whatsapp: "openai",
  });

  const [personality,         setPersonality]         = useState("professional");
  const [creativityLevel,     setCreativityLevel]     = useState(70);
  const [salesAggressiveness, setSalesAggressiveness] = useState(60);
  const [humanLikeLevel,      setHumanLikeLevel]      = useState(80);
  const [tone,     setTone]     = useState("professional");
  const [language, setLanguage] = useState("english");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are an expert eCommerce sales and content expert for KDF NUTS, a premium dry fruits and nuts brand in Pakistan. You talk like a real human — warm, confident, and persuasive."
  );

  const [imageProvider,       setImageProvider]       = useState("openai");
  const [imageStyle,          setImageStyle]          = useState("premium-ecommerce");
  const [autoGenerateImages,  setAutoGenerateImages]  = useState(false);
  const [imageQuality,        setImageQuality]        = useState("standard");
  const [brandColors,         setBrandColors]         = useState("#5FA800,#F58300");

  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "ok" | "fail">>({});

  useEffect(() => {
    if (!settingsData) return;
    const d = settingsData;
    setAiEnabled(d.aiEnabled ?? false);
    setOpenaiApiKey(d.openaiApiKey ?? "");
    setOpenaiOrgId(d.openaiOrgId ?? "");
    setGeminiApiKey(d.geminiApiKey ?? "");
    setDeepseekApiKey(d.deepseekApiKey ?? "");
    setClaudeApiKey(d.claudeApiKey ?? "");
    setPrimaryProvider(d.primaryProvider ?? "openai");
    setFallbackProvider(d.fallbackProvider ?? "");
    setTaskRouting(d.taskRouting ?? { chat: "openai", content: "openai", seo: "openai", image: "openai", whatsapp: "openai" });
    setPersonality(d.personality ?? "professional");
    setCreativityLevel(d.creativityLevel ?? 70);
    setSalesAggressiveness(d.salesAggressiveness ?? 60);
    setHumanLikeLevel(d.humanLikeLevel ?? 80);
    setTone(d.tone ?? "professional");
    setLanguage(d.language ?? "english");
    setSystemPrompt(d.systemPrompt ?? "");
    setImageProvider(d.imageProvider ?? "openai");
    setImageStyle(d.imageStyle ?? "premium-ecommerce");
    setAutoGenerateImages(d.autoGenerateImages ?? false);
    setImageQuality(d.imageQuality ?? "standard");
    setBrandColors(d.brandColors ?? "#5FA800,#F58300");
  }, [settingsData]);

  function buildPayload() {
    return {
      aiEnabled, openaiApiKey, openaiOrgId, geminiApiKey, deepseekApiKey, claudeApiKey,
      primaryProvider, fallbackProvider, taskRouting,
      personality, creativityLevel, salesAggressiveness, humanLikeLevel,
      tone, language, systemPrompt,
      imageProvider, imageStyle, autoGenerateImages, imageQuality, brandColors,
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/ai/settings", { method: "PUT", body: JSON.stringify(buildPayload()) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/ai/settings"] }); toast({ title: "AI settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const handleTestProvider = async (providerId: string) => {
    setTestingProvider(providerId);
    try {
      const r = await apiFetch("/api/admin/ai/test-provider", { method: "POST", body: JSON.stringify({ provider: providerId }) });
      setTestResults(prev => ({ ...prev, [providerId]: r.ok ? "ok" : "fail" }));
    } catch {
      setTestResults(prev => ({ ...prev, [providerId]: "fail" }));
    } finally { setTestingProvider(null); }
  };

  const providerKeyMap: Record<string, string> = {
    openai: openaiApiKey, gemini: geminiApiKey, deepseek: deepseekApiKey, claude: claudeApiKey,
  };
  const hasKeyMap: Record<string, boolean> = {
    openai:   !!settingsData?._hasOpenai,
    gemini:   !!settingsData?._hasGemini,
    deepseek: !!settingsData?._hasDeepseek,
    claude:   !!settingsData?._hasClaude,
  };
  const setKeyMap: Record<string, (v: string) => void> = {
    openai: setOpenaiApiKey, gemini: setGeminiApiKey, deepseek: setDeepseekApiKey, claude: setClaudeApiKey,
  };

  /* ── Content Generator state ── */
  const [testType,     setTestType]     = useState("product-description");
  const [testName,     setTestName]     = useState("");
  const [testKeywords, setTestKeywords] = useState("");
  const [testCategory, setTestCategory] = useState("");
  const [generating,   setGenerating]   = useState(false);
  const [result,       setResult]       = useState<Record<string, any> | null>(null);

  /* ── Image Generator state ── */
  const [imgPrompt,   setImgPrompt]   = useState("");
  const [imgSubject,  setImgSubject]  = useState("");
  const [imgStyle,    setImgStyle]    = useState(imageStyle);
  const [generatingImg, setGeneratingImg] = useState(false);
  const [imgResult,   setImgResult]   = useState<{ imageUrl?: string; imageData?: string; provider?: string; prompt?: string } | null>(null);

  const handleGenerate = async () => {
    if (!testName && !testKeywords) { toast({ variant: "destructive", title: "Enter a name or keywords first" }); return; }
    setGenerating(true); setResult(null);
    try {
      const r = await apiFetch("/api/admin/ai/generate", {
        method: "POST",
        body: JSON.stringify({ type: testType, name: testName, keywords: testKeywords, category: testCategory }),
      });
      setResult(r);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Generation failed", description: e.message });
    } finally { setGenerating(false); }
  };

  const handleGenerateImage = async () => {
    setGeneratingImg(true); setImgResult(null);
    try {
      const r = await apiFetch("/api/admin/ai/generate-image", {
        method: "POST",
        body: JSON.stringify({ subject: imgSubject || "premium dry fruits", prompt: imgPrompt || undefined, style: imgStyle, quality: imageQuality }),
      });
      setImgResult(r);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Image generation failed", description: e.message });
    } finally { setGeneratingImg(false); }
  };

  const hasAnyKey = settingsData?._hasOpenai || settingsData?._hasGemini || settingsData?._hasDeepseek || settingsData?._hasClaude;
  const mainContent = result?.content ?? result?.description ?? "";

  return (
    <div className="space-y-5 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            AI Command Center
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Multi-provider AI engine — content, images, chat, SEO, and campaigns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border ${aiEnabled && hasAnyKey ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-muted border-border text-muted-foreground"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${aiEnabled && hasAnyKey ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            {aiEnabled && hasAnyKey ? "AI Active" : "AI Inactive"}
          </div>
          <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} className="data-[state=checked]:bg-purple-600" />
        </div>
      </div>

      <Tabs defaultValue="providers">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="providers"  className="gap-1.5 text-xs"><Key       className="w-3.5 h-3.5" />Providers</TabsTrigger>
          <TabsTrigger value="routing"    className="gap-1.5 text-xs"><Zap       className="w-3.5 h-3.5" />Routing</TabsTrigger>
          <TabsTrigger value="personality" className="gap-1.5 text-xs"><Bot      className="w-3.5 h-3.5" />Personality</TabsTrigger>
          <TabsTrigger value="images"     className="gap-1.5 text-xs"><ImageIcon className="w-3.5 h-3.5" />Images</TabsTrigger>
          <TabsTrigger value="generator"  className="gap-1.5 text-xs"><Sparkles  className="w-3.5 h-3.5" />Generator</TabsTrigger>
          <TabsTrigger value="imagegen"   className="gap-1.5 text-xs"><Palette   className="w-3.5 h-3.5" />Image Gen</TabsTrigger>
        </TabsList>

        {/* ══ TAB 1: PROVIDERS ══ */}
        <TabsContent value="providers" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROVIDERS.map(p => (
              <ProviderCard key={p.id}
                provider={p}
                apiKey={providerKeyMap[p.id] ?? ""}
                onKeyChange={setKeyMap[p.id]}
                onTest={() => handleTestProvider(p.id)}
                testing={testingProvider === p.id}
                testResult={testResults[p.id] ?? null}
                isHasKey={hasKeyMap[p.id] ?? false}
                isPrimary={primaryProvider === p.id}
                isFallback={fallbackProvider === p.id}
                onSetPrimary={() => setPrimaryProvider(p.id)}
                onSetFallback={() => setFallbackProvider(fallbackProvider === p.id ? "" : p.id)}
              />
            ))}
          </div>

          {primaryProvider && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Brain className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-900">Current Setup</p>
                <p className="text-xs text-purple-700">
                  Primary: <strong>{primaryProvider}</strong>
                  {fallbackProvider && <> · Fallback: <strong>{fallbackProvider}</strong></>}
                </p>
              </div>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          )}

          {/* OpenAI Org ID */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <Label className="text-sm">OpenAI Organization ID (optional)</Label>
            <Input value={openaiOrgId} onChange={e => setOpenaiOrgId(e.target.value)} placeholder="org-..." className="font-mono text-sm" />
            <p className="text-xs text-muted-foreground">Found in your OpenAI account settings</p>
          </div>
        </TabsContent>

        {/* ══ TAB 2: TASK ROUTING ══ */}
        <TabsContent value="routing" className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />Task Routing</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Route each task type to the best AI provider</p>
            </div>
            <div className="p-4 space-y-2">
              {TASK_ROUTES.map(task => (
                <div key={task.key} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                    <task.icon className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{task.label}</p>
                    <p className="text-xs text-muted-foreground">{task.desc}</p>
                  </div>
                  <select
                    value={taskRouting[task.key] ?? primaryProvider}
                    onChange={e => setTaskRouting(prev => ({ ...prev, [task.key]: e.target.value }))}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background font-medium min-w-[110px]"
                  >
                    {PROVIDERS.map(p => (
                      <option key={p.id} value={p.id} disabled={!hasKeyMap[p.id] && p.id !== "openai"}>
                        {p.label} {!hasKeyMap[p.id] && p.id !== "openai" ? "(no key)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
              {saveMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Routing"}
            </Button>
          </div>
        </TabsContent>

        {/* ══ TAB 3: PERSONALITY ══ */}
        <TabsContent value="personality" className="space-y-4">
          {/* Presets */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4 text-blue-500" />AI Personality</h2>
              <p className="text-xs text-muted-foreground mt-0.5">How the AI sounds across all content</p>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {PERSONALITIES.map(p => (
                <button key={p.id} onClick={() => setPersonality(p.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${personality === p.id ? "border-purple-300 bg-purple-50" : "border-border hover:bg-muted/30"}`}>
                  {personality === p.id && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 mb-1" />}
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            <h2 className="font-semibold flex items-center gap-2"><Sliders className="w-4 h-4 text-purple-500" />Fine-tune Controls</h2>
            <SliderInput label="Creativity Level" value={creativityLevel} onChange={setCreativityLevel}
              desc="Higher = more creative and varied responses. Lower = more consistent and predictable." />
            <SliderInput label="Human-like Level" value={humanLikeLevel} onChange={setHumanLikeLevel}
              desc="Higher = sounds more like a real human. Lower = more structured and formal." />
            <SliderInput label="Sales Aggressiveness" value={salesAggressiveness} onChange={setSalesAggressiveness}
              desc="Higher = stronger CTAs and urgency. Lower = softer, informational tone." />
          </div>

          {/* Tone + Language */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-gray-500" />Content Preferences</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1.5"><Mic2 className="w-3.5 h-3.5" />Default Tone</Label>
                <div className="space-y-1.5">
                  {TONE_OPTIONS.map(t => (
                    <button key={t.value} onClick={() => setTone(t.value)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${tone === t.value ? "border-purple-300 bg-purple-50" : "border-border hover:bg-muted/40"}`}>
                      <div>
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.desc}</p>
                      </div>
                      {tone === t.value && <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1.5"><Languages className="w-3.5 h-3.5" />Default Language</Label>
                <div className="space-y-1.5">
                  {LANG_OPTIONS.map(l => (
                    <button key={l.value} onClick={() => setLanguage(l.value)}
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${language === l.value ? "border-purple-300 bg-purple-50 text-purple-700" : "border-border hover:bg-muted/40"}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div>
              <Label className="text-sm font-semibold">System Prompt</Label>
              <p className="text-xs text-muted-foreground mt-0.5">The core persona and instructions for the AI</p>
            </div>
            <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} className="text-sm resize-y" />
            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
                {saveMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Personality"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ══ TAB 4: IMAGE SETTINGS ══ */}
        <TabsContent value="images" className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-pink-500" />Image Generation Settings</h2>

            <div className="flex items-center justify-between px-4 py-3 rounded-xl border bg-muted/30">
              <div>
                <p className="text-sm font-medium">Auto-generate images with content</p>
                <p className="text-xs text-muted-foreground">Automatically generate product/blog images when creating content</p>
              </div>
              <Switch checked={autoGenerateImages} onCheckedChange={setAutoGenerateImages} className="data-[state=checked]:bg-pink-600" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Image AI Provider</Label>
                <div className="space-y-1.5">
                  {[
                    { id: "openai", label: "OpenAI DALL-E 3", badge: "DALL-E 3", available: !!settingsData?._hasOpenai },
                    { id: "gemini", label: "Google Gemini",   badge: "Flash 2.0 Image", available: !!settingsData?._hasGemini },
                  ].map(p => (
                    <button key={p.id} onClick={() => setImageProvider(p.id)}
                      disabled={!p.available}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-50 ${imageProvider === p.id ? "border-pink-300 bg-pink-50" : "border-border hover:bg-muted/40"}`}>
                      <div>
                        <p className="text-sm font-medium">{p.label}</p>
                        <span className="text-[10px] text-muted-foreground">{p.badge}</span>
                        {!p.available && <span className="text-[10px] text-red-500 ml-1">— no key</span>}
                      </div>
                      {imageProvider === p.id && <CheckCircle2 className="w-4 h-4 text-pink-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Default Style</Label>
                <div className="space-y-1.5">
                  {IMAGE_STYLES.map(s => (
                    <button key={s.id} onClick={() => setImageStyle(s.id)}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${imageStyle === s.id ? "border-pink-300 bg-pink-50 text-pink-700" : "border-border hover:bg-muted/40"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Quality Mode</Label>
                <div className="flex gap-2">
                  {[{ id: "standard", label: "Standard" }, { id: "hd", label: "HD" }].map(q => (
                    <button key={q.id} onClick={() => setImageQuality(q.id)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${imageQuality === q.id ? "border-pink-300 bg-pink-50 text-pink-700" : "border-border hover:bg-muted/40"}`}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Brand Colors</Label>
                <Input value={brandColors} onChange={e => setBrandColors(e.target.value)} placeholder="#5FA800,#F58300" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Comma-separated hex colors for brand consistency</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-pink-600 hover:bg-pink-700 text-white gap-1.5">
                {saveMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Image Settings"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ══ TAB 5: CONTENT GENERATOR ══ */}
        <TabsContent value="generator" className="space-y-4">
          {!hasAnyKey && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>No AI API key configured. Go to <strong>Providers</strong> tab to add your key.</p>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold">Content Generator</h2>
                <p className="text-xs text-muted-foreground">Test AI generation with any content type</p>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GEN_TYPES.map(g => (
                  <button key={g.type} onClick={() => { setTestType(g.type); setResult(null); }}
                    className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-colors ${testType === g.type ? "border-purple-300 bg-purple-50" : "border-border hover:bg-muted/30"}`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${testType === g.type ? "bg-purple-100" : "bg-muted"}`}>
                      <g.icon className={`w-3 h-3 ${testType === g.type ? "text-purple-600" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className={`text-xs font-medium leading-tight ${testType === g.type ? "text-purple-700" : ""}`}>{g.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{g.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name / Topic</Label>
                  <Input value={testName} onChange={e => setTestName(e.target.value)} placeholder="e.g. Premium Cashews 500g" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Keywords</Label>
                  <Input value={testKeywords} onChange={e => setTestKeywords(e.target.value)} placeholder="cashews, nuts, protein" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Input value={testCategory} onChange={e => setTestCategory(e.target.value)} placeholder="Dry Fruits" />
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={generating || !hasAnyKey || !aiEnabled} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Content</>}
              </Button>
            </div>
          </div>

          {(generating || result) && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b">
                <p className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-600" />Generated Content</p>
                {result && <button onClick={handleGenerate} disabled={generating} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"><RefreshCw className="w-3 h-3" />Regenerate</button>}
              </div>
              <div className="px-5 py-4 space-y-4">
                {generating ? (
                  <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="text-sm">AI is generating content…</span>
                  </div>
                ) : result ? (
                  <>
                    {result.title && <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</p><div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-sm font-medium">{result.title}</div></div>}
                    {mainContent && <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Content</p><div className="bg-muted/30 border rounded-lg p-4 text-sm prose prose-sm max-w-none max-h-64 overflow-y-auto" dangerouslySetInnerHTML={{ __html: mainContent }} /></div>}
                    {result.shortDescription && <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Short Description</p><div className="bg-muted/30 border rounded-lg px-3 py-2 text-sm text-muted-foreground">{result.shortDescription}</div></div>}
                    {result.message && <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</p><div className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-lg px-3 py-2 text-sm">{result.emoji} {result.message}</div></div>}
                    {result.subjects && <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject Lines</p><div className="space-y-1">{(result.subjects as string[]).map((s, i) => <div key={i} className="bg-muted/30 border rounded-lg px-3 py-2 text-sm">{i + 1}. {s}</div>)}</div></div>}
                    {result.headline && <div className="space-y-1"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ad Copy</p><div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 space-y-1"><p className="text-sm font-bold text-blue-900">{result.headline}</p><p className="text-xs text-blue-700">{result.description}</p><span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">{result.cta}</span></div></div>}
                    {(result.metaTitle || result.metaDescription) && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SEO Metadata</p>
                        <div className="grid grid-cols-2 gap-3">
                          {result.metaTitle && <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2"><p className="text-[10px] font-semibold text-green-700 uppercase mb-1">Meta Title</p><p className="text-sm font-medium text-green-900">{result.metaTitle}</p><p className="text-[10px] text-green-600 mt-1">{result.metaTitle.length} chars</p></div>}
                          {result.metaDescription && <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"><p className="text-[10px] font-semibold text-blue-700 uppercase mb-1">Meta Description</p><p className="text-xs text-blue-800">{result.metaDescription}</p><p className="text-[10px] text-blue-600 mt-1">{result.metaDescription.length} chars</p></div>}
                        </div>
                        {result.keywords && <div className="bg-muted/40 border rounded-lg px-3 py-2"><p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Keywords</p><div className="flex flex-wrap gap-1.5">{result.keywords.split(",").map((k: string) => k.trim()).filter(Boolean).map((k: string) => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}</div></div>}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══ TAB 6: IMAGE GENERATOR ══ */}
        <TabsContent value="imagegen" className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center">
                <Palette className="w-4 h-4 text-pink-600" />
              </div>
              <div>
                <h2 className="font-semibold">AI Image Generator</h2>
                <p className="text-xs text-muted-foreground">Generate product images, banners, and creatives with AI</p>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Product / Subject</Label>
                  <Input value={imgSubject} onChange={e => setImgSubject(e.target.value)} placeholder="e.g. Premium Cashews 500g" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Style</Label>
                  <select value={imgStyle} onChange={e => setImgStyle(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                    {IMAGE_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Custom Prompt (optional)</Label>
                <Textarea value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} rows={2}
                  placeholder="e.g. White background, studio lighting, premium packaging, 4K quality…" className="text-sm resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleGenerateImage} disabled={generatingImg || !hasAnyKey || !aiEnabled}
                  className="gap-2 bg-pink-600 hover:bg-pink-700 text-white">
                  {generatingImg ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><ImageIcon className="w-4 h-4" />Generate Image</>}
                </Button>
                <span className="text-xs text-muted-foreground">Provider: <strong>{imageProvider === "gemini" ? "Gemini" : "OpenAI DALL-E 3"}</strong> · {imageQuality === "hd" ? "HD" : "Standard"}</span>
              </div>
            </div>
          </div>

          {(generatingImg || imgResult) && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b">
                <p className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-pink-600" />Generated Image</p>
                {imgResult && <button onClick={handleGenerateImage} disabled={generatingImg} className="text-xs text-pink-600 hover:text-pink-700 flex items-center gap-1"><RefreshCw className="w-3 h-3" />Regenerate</button>}
              </div>
              <div className="px-5 py-4">
                {generatingImg ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                    <span className="text-sm">AI is creating your image…</span>
                  </div>
                ) : imgResult ? (
                  <div className="space-y-3">
                    {(imgResult.imageUrl || imgResult.imageData) && (
                      <img
                        src={imgResult.imageData ?? imgResult.imageUrl}
                        alt="AI Generated"
                        className="w-full max-h-96 object-contain rounded-xl border border-border bg-muted/20"
                      />
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Provider: <strong>{imgResult.provider}</strong></span>
                      {(imgResult.imageUrl || imgResult.imageData) && (
                        <a href={imgResult.imageData ?? imgResult.imageUrl} download="ai-image.png" target="_blank"
                          className="text-xs bg-pink-50 text-pink-700 border border-pink-200 rounded-lg px-2 py-1 hover:bg-pink-100 transition-colors">
                          Download
                        </a>
                      )}
                    </div>
                    {imgResult.prompt && <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 italic">"{imgResult.prompt}"</p>}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
