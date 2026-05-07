import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Loader2, RefreshCw, Settings2, Languages, Mic2,
  FileText, Package, Tags, BookOpen, CheckCircle2, Wand2,
  Key, Eye, EyeOff, ToggleLeft, ToggleRight, ShieldCheck,
  AlertTriangle, Badge as BadgeIcon,
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

const TONE_OPTIONS = [
  { value: "professional", label: "Professional", desc: "Clear, authoritative, trustworthy" },
  { value: "friendly",     label: "Friendly",     desc: "Warm, conversational, approachable" },
  { value: "marketing",    label: "Marketing",    desc: "Persuasive, high-converting, exciting" },
];
const LANG_OPTIONS = [
  { value: "english", label: "English" },
  { value: "urdu",    label: "Urdu (اردو)" },
];
const GEN_TYPES = [
  { type: "product-description", label: "Product Description", icon: Package, desc: "Full description + bullet points + short summary" },
  { type: "product-seo",         label: "Product SEO",         icon: FileText, desc: "Meta title, meta description, keyword list" },
  { type: "category-description",label: "Category Description",icon: Tags,     desc: "Category desc + meta title + meta description" },
  { type: "blog-post",           label: "Blog Article",        icon: BookOpen, desc: "Full article with headings, excerpt, SEO" },
];

export default function AIContentPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ["/api/admin/ai/settings"],
    queryFn: () => apiFetch("/api/admin/ai/settings").catch(() => null),
  });

  /* ── AI Config state ── */
  const [apiKey, setApiKey]     = useState("");
  const [orgId, setOrgId]       = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showKey, setShowKey]   = useState(false);

  /* ── Content settings state ── */
  const [settings, setSettings] = useState({
    systemPrompt: "You are an expert eCommerce content writer for KDF NUTS, a premium dry fruits and nuts store in Pakistan. Write high-converting, SEO-optimized content in a friendly yet professional tone.",
    tone: "professional",
    language: "english",
  });

  useEffect(() => {
    if (settingsData) {
      setApiKey(settingsData.openaiApiKey ?? "");
      setOrgId(settingsData.openaiOrgId ?? "");
      setAiEnabled(settingsData.aiEnabled ?? false);
      setSettings({
        systemPrompt: settingsData.systemPrompt ?? settings.systemPrompt,
        tone:         settingsData.tone         ?? "professional",
        language:     settingsData.language     ?? "english",
      });
    }
  }, [settingsData]);

  const saveConfig = useMutation({
    mutationFn: () => apiFetch("/api/admin/ai/settings", {
      method: "PUT",
      body: JSON.stringify({ openaiApiKey: apiKey, openaiOrgId: orgId, aiEnabled, ...settings }),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/ai/settings"] });
      setApiKey(d.openaiApiKey ?? "");
      toast({ title: "AI configuration saved" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  const saveSettings = useMutation({
    mutationFn: () => apiFetch("/api/admin/ai/settings", {
      method: "PUT",
      body: JSON.stringify({ openaiApiKey: apiKey, openaiOrgId: orgId, aiEnabled, ...settings }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/ai/settings"] }); toast({ title: "Settings saved" }); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message }),
  });

  /* ── Test generator ── */
  const [testType, setTestType] = useState("product-description");
  const [testName, setTestName] = useState("");
  const [testKeywords, setTestKeywords] = useState("");
  const [testCategory, setTestCategory] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);

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

  const hasKey = settingsData?._hasKey;
  const mainContent = result?.content ?? result?.description ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-600" />
          AI Content Generation
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          OpenAI-powered content for products, blogs, categories, and SEO — available across the admin.
        </p>
      </div>

      <Tabs defaultValue="config">
        <TabsList className="mb-4">
          <TabsTrigger value="config" className="gap-1.5">
            <Key className="w-3.5 h-3.5" />AI Configuration
          </TabsTrigger>
          <TabsTrigger value="generator" className="gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />Content Generator
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: AI Configuration ── */}
        <TabsContent value="config" className="space-y-5">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold">AI Configuration</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Fill up the necessary info to activate the AI feature</p>
              </div>
              {hasKey && aiEnabled && (
                <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                  <ShieldCheck className="w-3 h-3" />Active
                </Badge>
              )}
              {hasKey && !aiEnabled && (
                <Badge variant="outline" className="text-muted-foreground gap-1">
                  <AlertTriangle className="w-3 h-3" />Disabled
                </Badge>
              )}
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* AI Status toggle */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border bg-muted/30">
                <div>
                  <p className="text-sm font-medium">AI Status</p>
                  <p className="text-xs text-muted-foreground">Enable or disable AI content generation globally</p>
                </div>
                <Switch
                  checked={aiEnabled}
                  onCheckedChange={setAiEnabled}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>

              {/* API Key + Org ID */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    OpenAI API Key <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="pr-9 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hasKey ? "A key is already saved. Enter a new one to replace it." : "Get your key from platform.openai.com"}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    OpenAI Organization ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={orgId}
                    onChange={e => setOrgId(e.target.value)}
                    placeholder="org-..."
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Found in your OpenAI account settings</p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button" variant="outline"
                  onClick={() => { setApiKey(settingsData?.openaiApiKey ?? ""); setOrgId(settingsData?.openaiOrgId ?? ""); setAiEnabled(settingsData?.aiEnabled ?? false); }}
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  onClick={() => saveConfig.mutate()}
                  disabled={saveConfig.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                >
                  {saveConfig.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save"}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Content preferences ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                <Settings2 className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold">Content Preferences</h2>
                <p className="text-xs text-muted-foreground">Default tone and language for all generated content</p>
              </div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">System Prompt</Label>
                <Textarea
                  value={settings.systemPrompt}
                  onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                  rows={4}
                  className="text-sm resize-y"
                  placeholder="You are an expert eCommerce content writer…"
                />
                <p className="text-xs text-muted-foreground">Defines the AI's persona for all content generation.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5"><Mic2 className="w-3.5 h-3.5" />Tone</Label>
                  <div className="space-y-1.5">
                    {TONE_OPTIONS.map(t => (
                      <button key={t.value} type="button" onClick={() => setSettings(s => ({ ...s, tone: t.value }))}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${settings.tone === t.value ? "border-purple-300 bg-purple-50" : "border-border hover:bg-muted/40"}`}>
                        <div>
                          <p className="text-sm font-medium">{t.label}</p>
                          <p className="text-xs text-muted-foreground">{t.desc}</p>
                        </div>
                        {settings.tone === t.value && <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5"><Languages className="w-3.5 h-3.5" />Language</Label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {LANG_OPTIONS.map(l => (
                      <button key={l.value} type="button" onClick={() => setSettings(s => ({ ...s, language: l.value }))}
                        className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${settings.language === l.value ? "border-purple-300 bg-purple-50 text-purple-700" : "border-border hover:bg-muted/40"}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 bg-muted/40 border border-border rounded-xl px-3 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Wand2 className="w-3 h-3" />AI Buttons In</p>
                    {[
                      { icon: Package, label: "Products", desc: "Description & SEO" },
                      { icon: Tags,    label: "Categories", desc: "SEO meta fields" },
                      { icon: BookOpen,label: "Blog Posts", desc: "Content, title, SEO" },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2 text-xs">
                        <item.icon className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground">— {item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
                  {saveSettings.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Save Preferences"}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 2: Content Generator ── */}
        <TabsContent value="generator" className="space-y-4">
          {!hasKey && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>No OpenAI API key configured. Go to <strong>AI Configuration</strong> tab to add your key.</p>
            </div>
          )}
          {hasKey && !aiEnabled && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>AI is currently <strong>disabled</strong>. Enable it in the AI Configuration tab.</p>
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
              <div className="grid grid-cols-2 gap-3">
                {GEN_TYPES.map(g => (
                  <button key={g.type} type="button" onClick={() => { setTestType(g.type); setResult(null); }}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${testType === g.type ? "border-purple-300 bg-purple-50" : "border-border hover:bg-muted/30"}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${testType === g.type ? "bg-purple-100" : "bg-muted"}`}>
                      <g.icon className={`w-3.5 h-3.5 ${testType === g.type ? "text-purple-600" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${testType === g.type ? "text-purple-700" : ""}`}>{g.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{g.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Product / Topic Name</Label>
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

              <Button onClick={handleGenerate} disabled={generating || !hasKey || !aiEnabled} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Content</>}
              </Button>
            </div>
          </div>

          {(generating || result) && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />Generated Content
                </p>
                {result && (
                  <button onClick={handleGenerate} disabled={generating} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />Regenerate
                  </button>
                )}
              </div>
              <div className="px-5 py-4 space-y-4">
                {generating ? (
                  <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="text-sm">AI is generating content…</span>
                  </div>
                ) : result ? (
                  <>
                    {result.title && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</p>
                        <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-sm font-medium">{result.title}</div>
                      </div>
                    )}
                    {mainContent && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Content</p>
                        <div className="bg-muted/30 border rounded-lg p-4 text-sm prose prose-sm max-w-none max-h-64 overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: mainContent }} />
                      </div>
                    )}
                    {result.shortDescription && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Short Description</p>
                        <div className="bg-muted/30 border rounded-lg px-3 py-2 text-sm text-muted-foreground">{result.shortDescription}</div>
                      </div>
                    )}
                    {result.excerpt && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Excerpt</p>
                        <div className="bg-muted/30 border rounded-lg px-3 py-2 text-sm text-muted-foreground">{result.excerpt}</div>
                      </div>
                    )}
                    {(result.metaTitle || result.metaDescription || result.keywords) && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SEO Metadata</p>
                        <div className="grid grid-cols-2 gap-3">
                          {result.metaTitle && (
                            <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                              <p className="text-[10px] font-semibold text-green-700 uppercase mb-1">Meta Title</p>
                              <p className="text-sm font-medium text-green-900">{result.metaTitle}</p>
                              <p className="text-[10px] text-green-600 mt-1">{result.metaTitle.length} chars</p>
                            </div>
                          )}
                          {result.metaDescription && (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                              <p className="text-[10px] font-semibold text-blue-700 uppercase mb-1">Meta Description</p>
                              <p className="text-xs text-blue-800">{result.metaDescription}</p>
                              <p className="text-[10px] text-blue-600 mt-1">{result.metaDescription.length} chars</p>
                            </div>
                          )}
                        </div>
                        {result.keywords && (
                          <div className="bg-muted/40 border rounded-lg px-3 py-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Keywords</p>
                            <div className="flex flex-wrap gap-1.5">
                              {result.keywords.split(",").map(k => k.trim()).filter(Boolean).map(k => (
                                <Badge key={k} variant="outline" className="text-xs">{k}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
