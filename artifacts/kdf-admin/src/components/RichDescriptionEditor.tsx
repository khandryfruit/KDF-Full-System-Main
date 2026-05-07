import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, List, Link2, Heading2, Heading3,
  Code2, Undo, Redo, Maximize2, Minimize2, Sparkles, Loader2,
  CheckCircle, AlertCircle, ChevronDown, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

async function callAI(type: string, ctx: Record<string, string>): Promise<Record<string, string>> {
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

/* ─── SEO Score ─────────────────────────────────────────────────── */
function computeSeoScore(html: string, productName: string): { score: number; tips: string[] } {
  const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const keyword = productName.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const tips: string[] = [];
  let score = 0;

  if (wordCount >= 100) { score += 25; } else { tips.push(`Add more content — currently ${wordCount} words (aim for 100+)`); }
  if (keyword && text.includes(keyword.split(" ")[0] ?? "")) { score += 20; } else if (keyword) { tips.push(`Include the product name "${productName}" in the description`); }
  if (/<h[23]/i.test(html)) { score += 20; } else { tips.push("Add H2 or H3 headings to structure the content"); }
  if (/<ul/i.test(html)) { score += 15; } else { tips.push("Add bullet points to highlight key benefits"); }
  if (/<strong/i.test(html)) { score += 10; } else { tips.push("Bold important keywords for emphasis"); }
  if (wordCount <= 350) { score += 10; } else { tips.push("Content is a bit long — consider trimming to under 350 words"); }

  return { score, tips };
}

function SeoPanel({ html, productName }: { html: string; productName: string }) {
  const { score, tips } = computeSeoScore(html, productName);
  const color = score >= 80 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-500";
  const bg = score >= 80 ? "bg-green-50 border-green-200" : score >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
  const label = score >= 80 ? "Good" : score >= 50 ? "Needs Work" : "Poor";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${bg} mt-2`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-700">SEO Score</span>
        <span className={`text-xs font-bold ${color}`}>{score}/100 — {label}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 rounded-full mb-2">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${score >= 80 ? "bg-green-500" : score >= 50 ? "bg-yellow-400" : "bg-red-400"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {tips.length > 0 && (
        <ul className="space-y-0.5">
          {tips.slice(0, 3).map((t, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-yellow-500" />
              {t}
            </li>
          ))}
          {tips.length === 0 && (
            <li className="flex items-center gap-1.5 text-[11px] text-green-700">
              <CheckCircle className="w-3 h-3" /> Great! Description is well-optimized.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ─── Toolbar button ─────────────────────────────────────────────── */
function ToolBtn({
  onClick, active, title, children, disabled,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-7 w-7 rounded flex items-center justify-center transition-colors disabled:opacity-40 ${
        active
          ? "bg-gray-800 text-white"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── AI Actions dropdown ────────────────────────────────────────── */
const AI_ACTIONS = [
  { type: "fix-grammar",       label: "Fix Grammar",        icon: "✏️", desc: "Fix spelling & grammar" },
  { type: "seo-optimize",      label: "SEO Optimize",       icon: "🔍", desc: "Structure for Google ranking" },
  { type: "high-converting",   label: "High-Converting",    icon: "🚀", desc: "Boost conversions with sales copy" },
  { type: "expand",            label: "Expand Content",     icon: "📝", desc: "Add more detail" },
  { type: "shorten",           label: "Make Shorter",       icon: "✂️", desc: "Remove fluff" },
  { type: "rewrite",           label: "Rewrite",            icon: "🔄", desc: "Fresh rewrite" },
];

function AIActionsDropdown({
  html, productName, category, onResult, disabled,
}: {
  html: string; productName: string; category: string;
  onResult: (html: string) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const run = async (type: string) => {
    setOpen(false);
    setRunning(type);
    try {
      const r = await callAI(type, {
        existingContent: html,
        name: productName,
        category,
      });
      const result = r.content ?? r.description ?? "";
      if (result) { onResult(result); toast({ title: "Content updated by AI" }); }
      else { throw new Error("No content returned"); }
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI failed", description: e.message });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled || !!running || !html}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded px-2 py-1 transition-colors disabled:opacity-40 border border-purple-200"
      >
        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        Improve <ChevronDown className="w-2.5 h-2.5 ml-0.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 min-w-[210px]">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide px-2 pb-1.5 pt-0.5 font-semibold">AI Actions</p>
          {AI_ACTIONS.map(a => (
            <button
              key={a.type}
              type="button"
              onClick={() => run(a.type)}
              className="w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-purple-50 transition-colors flex items-start gap-2.5 group"
            >
              <span className="text-sm leading-none mt-0.5">{a.icon}</span>
              <div>
                <div className="font-medium text-gray-800 group-hover:text-purple-700">{a.label}</div>
                <div className="text-[10px] text-gray-400">{a.desc}</div>
              </div>
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1.5 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="w-full text-left px-2.5 py-1.5 text-xs text-gray-400 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Editor ────────────────────────────────────────────────── */
interface RichDescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
  productName?: string;
  categoryName?: string;
  showSeoScore?: boolean;
}

export function RichDescriptionEditor({
  value, onChange, productName = "", categoryName = "", showSeoScore = true,
}: RichDescriptionEditorProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlRaw, setHtmlRaw] = useState(value);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-blue-600 underline" } }),
      Placeholder.configure({ placeholder: "Write an engaging product description…" }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      setHtmlRaw(html);
    },
  });

  /* sync external value changes (e.g. AI result) into editor */
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value);
      setHtmlRaw(value);
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    const prev = editor?.getAttributes("link").href ?? "";
    const url = window.prompt("Enter URL", prev);
    if (url === null) return;
    if (url === "") { editor?.chain().focus().unsetLink().run(); return; }
    editor?.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const handleHtmlApply = () => {
    editor?.commands.setContent(htmlRaw);
    onChange(htmlRaw);
    setHtmlMode(false);
  };

  const generateFresh = async () => {
    setGenerating(true);
    try {
      const r = await callAI("product-description-human", { name: productName, category: categoryName });
      const html = r.description ?? r.content ?? "";
      if (html) { onChange(html); editor?.commands.setContent(html); }
      else throw new Error("No content returned");
      toast({ title: "Description generated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI generation failed", description: e.message });
    } finally { setGenerating(false); }
  };

  const wrapperClass = fullscreen
    ? "fixed inset-0 z-[100] bg-white flex flex-col"
    : "border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm";

  const currentHtml = editor?.getHTML() ?? value;

  return (
    <div className={wrapperClass}>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2.5 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        {/* Format buttons */}
        <ToolBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </ToolBtn>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} title="Bullet List">
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={setLink} active={editor?.isActive("link")} title="Insert Link">
          <Link2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolBtn onClick={() => editor?.chain().focus().undo().run()} title="Undo">
          <Undo className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor?.chain().focus().redo().run()} title="Redo">
          <Redo className="w-3.5 h-3.5" />
        </ToolBtn>

        {/* Spacer */}
        <div className="flex-1" />

        {/* HTML toggle */}
        <button
          type="button"
          onClick={() => { setHtmlMode(m => !m); }}
          title="Toggle HTML source"
          className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${htmlMode ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-500 hover:border-gray-400"}`}
        >
          {"</>"}
        </button>

        {/* Fullscreen */}
        <ToolBtn onClick={() => setFullscreen(f => !f)} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </ToolBtn>
      </div>

      {/* ── AI Action bar ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border-b border-purple-100 flex-wrap">
        <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wide">AI</span>
        <button
          type="button"
          onClick={generateFresh}
          disabled={generating}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-700 hover:bg-white rounded px-2 py-1 transition-colors disabled:opacity-50 border border-purple-200 bg-white shadow-sm"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Generate Fresh
        </button>
        <AIActionsDropdown
          html={currentHtml}
          productName={productName}
          category={categoryName}
          onResult={(html) => { onChange(html); editor?.commands.setContent(html); setHtmlRaw(html); }}
          disabled={generating}
        />
      </div>

      {/* ── Editor area ── */}
      <div className={`flex-1 ${fullscreen ? "overflow-y-auto" : ""}`}>
        {htmlMode ? (
          <div className="relative h-full">
            <textarea
              className="w-full h-full min-h-[180px] p-3 font-mono text-xs resize-none outline-none bg-gray-900 text-green-300"
              value={htmlRaw}
              onChange={(e) => setHtmlRaw(e.target.value)}
              spellCheck={false}
            />
            <div className="absolute bottom-2 right-2 flex gap-1.5">
              <button type="button" onClick={() => setHtmlMode(false)} className="text-[11px] px-2 py-1 rounded bg-gray-600 text-gray-200 hover:bg-gray-500">Cancel</button>
              <button type="button" onClick={handleHtmlApply} className="text-[11px] px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700">Apply</button>
            </div>
          </div>
        ) : (
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none p-3 min-h-[160px] focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap_p]:my-1.5 [&_.tiptap_h2]:text-base [&_.tiptap_h2]:font-bold [&_.tiptap_h3]:text-sm [&_.tiptap_h3]:font-semibold [&_.tiptap_ul]:pl-4 [&_.tiptap_li]:my-0.5"
          />
        )}
      </div>

      {/* ── SEO panel (inside fullscreen, below editor when normal) ── */}
      {showSeoScore && !htmlMode && currentHtml && currentHtml !== "<p></p>" && (
        <div className={fullscreen ? "px-4 pb-4" : ""}>
          <SeoPanel html={currentHtml} productName={productName} />
        </div>
      )}
    </div>
  );
}
