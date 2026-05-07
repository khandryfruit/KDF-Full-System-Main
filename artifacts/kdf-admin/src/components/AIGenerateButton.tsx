import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, Check, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

interface AIGenerateButtonProps {
  type: string;
  context?: Record<string, string>;
  onResult: (result: Record<string, string>) => void;
  label?: string;
  compact?: boolean;
}

interface AIDropdownButtonProps extends AIGenerateButtonProps {
  actions: Array<{ type: string; label: string }>;
}

async function callGenerate(type: string, ctx: Record<string, string>): Promise<Record<string, string>> {
  const res = await fetch("/api/admin/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN()}` },
    body: JSON.stringify({ type, ...ctx }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/* ─── Inline generate button (fills field directly) ─── */
export function AIGenerateButton({ type, context = {}, onResult, label, compact = false }: AIGenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await callGenerate(type, context);
      onResult(result);
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI generation failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={loading}
      title={label ?? "Generate with AI"}
      className={`inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${compact ? "text-[11px]" : "text-xs"}`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      {label ?? "AI"}
    </button>
  );
}

/* ─── Preview modal generate (shows result before inserting) ─── */
export function AIGenerateWithPreview({ type, context = {}, onResult, label }: AIGenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [extraCtx, setExtraCtx] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const generate = async () => {
    setLoading(true);
    try {
      const r = await callGenerate(type, { ...context, ...extraCtx });
      setResult(r);
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI generation failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => { setResult(null); setOpen(true); };
  const handleUse = () => { if (result) { onResult(result); setOpen(false); } };

  const mainContent = result?.content ?? result?.description ?? result?.title ?? "";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded px-1.5 py-0.5 transition-colors text-xs"
      >
        <Sparkles className="w-3 h-3" />{label ?? "Generate with AI"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              {label ?? "AI Content Generator"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Additional context */}
            {type === "blog-post" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Topic / Title Hint</Label>
                  <Input placeholder="e.g. Benefits of Cashews for health" value={extraCtx.name ?? ""} onChange={e => setExtraCtx(c => ({ ...c, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Target Keywords</Label>
                  <Input placeholder="cashews, dry fruits, nutrition" value={extraCtx.keywords ?? ""} onChange={e => setExtraCtx(c => ({ ...c, keywords: e.target.value }))} />
                </div>
              </div>
            )}

            {!result && !loading && (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-xl">
                <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-30 text-purple-400" />
                <p className="text-sm">Click Generate to create AI content</p>
                <p className="text-xs mt-1">Content will appear here for review before inserting</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <p className="text-sm">Generating content with AI…</p>
              </div>
            )}

            {result && !loading && (
              <div className="space-y-3">
                {result.title && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Title</Label>
                    <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm font-medium">{result.title}</div>
                  </div>
                )}
                {mainContent && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Content</Label>
                    <div className="bg-muted/40 rounded-lg p-3 text-sm max-h-52 overflow-y-auto prose prose-sm"
                      dangerouslySetInnerHTML={{ __html: mainContent }} />
                  </div>
                )}
                {result.excerpt && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Excerpt</Label>
                    <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm text-muted-foreground">{result.excerpt}</div>
                  </div>
                )}
                {result.metaTitle && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Meta Title</Label>
                      <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">{result.metaTitle}</div>
                    </div>
                    {result.metaDescription && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Meta Description</Label>
                        <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">{result.metaDescription}</div>
                      </div>
                    )}
                  </div>
                )}
                {result.keywords && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Keywords</Label>
                    <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground font-mono">{result.keywords}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t gap-2">
            <Button type="button" variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {result ? "Regenerate" : "Generate"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} className="gap-1">
                <X className="w-3.5 h-3.5" />Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleUse} disabled={!result} className="gap-1 bg-purple-600 hover:bg-purple-700 text-white">
                <Check className="w-3.5 h-3.5" />Use This
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Dropdown for multiple AI actions (rewrite / shorten / expand) ─── */
export function AIActionsMenu({ existingContent, onResult }: { existingContent: string; onResult: (r: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const actions = [
    { type: "rewrite",  label: "Rewrite with AI" },
    { type: "shorten",  label: "Make Shorter" },
    { type: "expand",   label: "Expand Content" },
  ];

  const run = async (type: string) => {
    setLoading(type); setOpen(false);
    try {
      const r = await callGenerate(type, { existingContent });
      onResult(r);
      toast({ title: "Content updated by AI" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI failed", description: e.message });
    } finally { setLoading(null); }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={!!loading || !existingContent}
        className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded px-1.5 py-0.5 transition-colors text-xs disabled:opacity-40"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        Improve <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute top-6 left-0 z-50 bg-white border border-border rounded-xl shadow-lg p-1 min-w-[160px]">
          {actions.map(a => (
            <button
              key={a.type}
              type="button"
              onClick={() => run(a.type)}
              className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted/60 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-3 h-3 text-purple-500" />{a.label}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="w-full text-left px-3 py-2 text-xs text-muted-foreground rounded-lg hover:bg-muted/60">Cancel</button>
        </div>
      )}
    </div>
  );
}
