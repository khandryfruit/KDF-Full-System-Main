import { useState } from "react";
import { Bot, Wand2, Copy, CheckCircle2, FileText, Tag, AlertTriangle, ChevronDown, ChevronUp, Loader2, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const H = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` });

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { ...H(), ...(opts?.headers ?? {}) } });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${r.status}`); }
  return r.json();
}

interface BlogResult {
  title?: string;
  seoTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  slug?: string;
  tags?: string[];
  content?: string;
  excerpt?: string;
  faq?: { question: string; answer: string }[];
  readTime?: number;
}

interface ProductSeoResult {
  seoTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  keywords?: string[];
  altText?: string;
  aiDescription?: string;
  faq?: { question: string; answer: string }[];
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center gap-1 text-xs px-2.5 py-1 border rounded hover:bg-muted transition-colors">
      {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ResultField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  const charCount = value.length;
  const isTitle = label.toLowerCase().includes("title");
  const isDesc = label.toLowerCase().includes("description");
  const warn = (isTitle && charCount > 60) || (isDesc && charCount > 160);
  return (
    <div className="border rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${warn ? "text-amber-500" : "text-muted-foreground"}`}>
            {charCount} chars{warn ? " ⚠️" : ""}
          </span>
          <CopyBtn text={value} />
        </div>
      </div>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors">
        <span className="text-sm font-medium">{q}</span>
        {open ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
      </button>
      {open && <div className="px-3 pb-3 text-sm text-muted-foreground">{a}</div>}
    </div>
  );
}

export default function SEOAIWriterPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"product" | "blog">("product");

  // Product SEO
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pCat, setPCat] = useState("");
  const [pResult, setPResult] = useState<ProductSeoResult | null>(null);
  const [pLoading, setPLoading] = useState(false);

  // Blog Writer
  const [bTopic, setBTopic] = useState("");
  const [bKeyword, setBKeyword] = useState("");
  const [bTone, setBTone] = useState("informative");
  const [bWords, setBWords] = useState("800");
  const [bResult, setBResult] = useState<BlogResult | null>(null);
  const [bLoading, setBLoading] = useState(false);

  async function generateProductSEO() {
    if (!pName) { toast({ title: "Please enter a product name", variant: "destructive" }); return; }
    setPLoading(true);
    try {
      const result = await apiFetch("/api/admin/seo/ai/generate", {
        method: "POST",
        body: JSON.stringify({ type: "product", name: pName, description: pDesc, price: pPrice, category: pCat }),
      });
      setPResult(result);
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setPLoading(false);
    }
  }

  async function generateBlog() {
    if (!bTopic) { toast({ title: "Please enter a blog topic", variant: "destructive" }); return; }
    setBLoading(true);
    try {
      const result = await apiFetch("/api/admin/seo/ai/blog-write", {
        method: "POST",
        body: JSON.stringify({ topic: bTopic, targetKeyword: bKeyword, tone: bTone, wordCount: Number(bWords) }),
      });
      setBResult(result);
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setBLoading(false);
    }
  }

  const inp = "w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-rose-500" />
          AI SEO Writer
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Generate SEO titles, meta descriptions, FAQs, alt text, and complete blog posts with AI
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {(["product", "blog"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-5 py-1.5 text-sm rounded-md font-medium transition-colors ${tab === t ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "product" ? <Tag className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
            {t === "product" ? "Product SEO" : "Blog Writer"}
          </button>
        ))}
      </div>

      {/* Product SEO Tab */}
      {tab === "product" && (
        <div className="space-y-5">
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold">Product Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block">Product Name *</label>
                <input className={inp} value={pName} onChange={e => setPName(e.target.value)} placeholder="California Almonds 500g" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Category</label>
                <input className={inp} value={pCat} onChange={e => setPCat(e.target.value)} placeholder="Dry Fruits & Nuts" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Price (Rs.)</label>
                <input className={inp} value={pPrice} onChange={e => setPPrice(e.target.value)} placeholder="1,699" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium mb-1 block">Existing Description (optional)</label>
                <textarea className={inp} rows={3} value={pDesc} onChange={e => setPDesc(e.target.value)}
                  placeholder="Any existing description or notes about this product…" />
              </div>
            </div>
            <button onClick={generateProductSEO} disabled={pLoading || !pName}
              className="flex items-center gap-2 bg-rose-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-rose-600 disabled:opacity-50 transition-colors">
              {pLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {pLoading ? "Generating…" : "Generate SEO Content"}
            </button>
          </div>

          {pResult && (
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Generated SEO Content
              </h3>
              <ResultField label="SEO Title (60 chars max)" value={pResult.seoTitle ?? ""} />
              <ResultField label="Meta Description (155 chars max)" value={pResult.metaDescription ?? ""} />
              <ResultField label="Focus Keyword" value={pResult.focusKeyword ?? ""} />
              <ResultField label="Image Alt Text" value={pResult.altText ?? ""} />
              {pResult.keywords && pResult.keywords.length > 0 && (
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">LSI Keywords</label>
                    <CopyBtn text={pResult.keywords.join(", ")} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pResult.keywords.map((k, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">{k}</span>
                    ))}
                  </div>
                </div>
              )}
              {pResult.aiDescription && <ResultField label="AI Product Description" value={pResult.aiDescription} />}
              {pResult.faq && pResult.faq.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">FAQ Schema (3 Q&As)</label>
                    <CopyBtn text={JSON.stringify(pResult.faq, null, 2)} />
                  </div>
                  <div className="space-y-2">
                    {pResult.faq.map((item, i) => <FAQItem key={i} q={item.question} a={item.answer} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Blog Writer Tab */}
      {tab === "blog" && (
        <div className="space-y-5">
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold">Blog Post Generator</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-medium mb-1 block">Blog Topic *</label>
                <input className={inp} value={bTopic} onChange={e => setBTopic(e.target.value)}
                  placeholder="Health benefits of eating almonds daily" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Target Keyword</label>
                <input className={inp} value={bKeyword} onChange={e => setBKeyword(e.target.value)}
                  placeholder="almonds health benefits" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Tone</label>
                <select className={inp} value={bTone} onChange={e => setBTone(e.target.value)}>
                  <option value="informative">Informative</option>
                  <option value="friendly">Friendly & Casual</option>
                  <option value="professional">Professional</option>
                  <option value="persuasive">Persuasive</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Word Count</label>
                <select className={inp} value={bWords} onChange={e => setBWords(e.target.value)}>
                  <option value="400">~400 words (short)</option>
                  <option value="800">~800 words (standard)</option>
                  <option value="1200">~1200 words (long-form)</option>
                  <option value="2000">~2000 words (pillar)</option>
                </select>
              </div>
            </div>
            <button onClick={generateBlog} disabled={bLoading || !bTopic}
              className="flex items-center gap-2 bg-rose-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-rose-600 disabled:opacity-50 transition-colors">
              {bLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {bLoading ? "Writing blog post… (15-20 sec)" : "Write Blog Post"}
            </button>
            {bLoading && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                AI is writing a full blog post. This takes 15-30 seconds depending on length…
              </div>
            )}
          </div>

          {bResult && (
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Generated Blog Post
              </h3>

              <div className="grid md:grid-cols-2 gap-3">
                <ResultField label="Blog Title (H1)" value={bResult.title ?? ""} />
                <ResultField label="SEO Title (60 chars)" value={bResult.seoTitle ?? ""} />
                <div className="md:col-span-2">
                  <ResultField label="Meta Description" value={bResult.metaDescription ?? ""} />
                </div>
                <ResultField label="Focus Keyword" value={bResult.focusKeyword ?? ""} />
                <ResultField label="URL Slug" value={bResult.slug ?? ""} />
              </div>

              {bResult.tags && bResult.tags.length > 0 && (
                <div className="border rounded-lg p-3">
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {bResult.tags.map((t, i) => (
                      <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {bResult.excerpt && <ResultField label="Excerpt / Summary" value={bResult.excerpt} />}

              {bResult.content && (
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Full Blog Content ({bResult.readTime ?? 5} min read)
                    </label>
                    <CopyBtn text={bResult.content} />
                  </div>
                  <div className="prose prose-sm max-w-none text-sm bg-muted/30 p-4 rounded-lg max-h-96 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: bResult.content.replace(/\n/g, "<br>") }} />
                </div>
              )}

              {bResult.faq && bResult.faq.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">FAQ Schema</label>
                    <CopyBtn text={JSON.stringify(bResult.faq, null, 2)} />
                  </div>
                  <div className="space-y-2">
                    {bResult.faq.map((item, i) => <FAQItem key={i} q={item.question} a={item.answer} />)}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <a href="/blog" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  <FileText className="h-4 w-4" />
                  Go to Blog Editor to publish
                </a>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Suggested Blog Topics for KDF NUTS</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                "Top 10 health benefits of walnuts (akhrot)",
                "How to store dry fruits in summer",
                "Best dry fruits for weight loss",
                "Almonds vs cashews — which is better?",
                "Dry fruits for brain health",
                "How many pistachios should you eat daily?",
                "Dry fruits during Ramadan",
                "Best dry fruits for diabetics",
              ].map((topic, i) => (
                <button key={i} onClick={() => setBTopic(topic)}
                  className="text-left text-xs text-blue-800 px-2 py-1.5 rounded border border-blue-200 bg-white hover:bg-blue-50 transition-colors">
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
