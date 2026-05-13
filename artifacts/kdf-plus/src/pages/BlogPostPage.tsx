import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { useGetBlogPostBySlug } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calendar, Clock, Tag, ArrowLeft, BookOpen, Share2, Copy,
  Facebook, Twitter, Linkedin, MessageCircle, ChevronRight,
  ThumbsUp, Send, User, ChevronDown, ChevronUp, Eye,
  List, Check, AlertCircle,
} from "lucide-react";

const GREEN  = "#5FA800";
const ORANGE = "#F58300";

/* ─── Helpers ─────────────────────────────────────────────────── */
function readingTime(content: string) {
  const words = content.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function extractToc(html: string) {
  const items: { id: string; text: string; level: number }[] = [];
  const regex = /<h([23])[^>]*?(?:id="([^"]*)")?[^>]*>(.*?)<\/h[23]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const rawText = match[3].replace(/<[^>]+>/g, "");
    const id = match[2] || rawText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    items.push({ id, text: rawText, level });
  }
  return items;
}

function injectHeadingIds(html: string): string {
  return html.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/gi, (_, level, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, "");
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (attrs.includes("id=")) return `<h${level}${attrs}>${inner}</h${level}>`;
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });
}

function injectInContentAds(html: string, adCode: string): string {
  if (!adCode?.trim()) return html;
  const parts = html.split("</p>");
  if (parts.length < 4) return html;
  const mid = Math.floor(parts.length / 2);
  parts.splice(mid, 0, `</p><div class="blog-ad-incontent">${adCode}</div>`);
  return parts.join("</p>");
}

/* ─── Reading Progress Bar ────────────────────────────────────── */
function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? Math.min(100, (scrolled / total) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-1 bg-gray-200/50">
      <div
        className="h-full transition-all duration-100 ease-out rounded-r-full"
        style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${GREEN}, ${ORANGE})` }}
      />
    </div>
  );
}

/* ─── Ad Slot ─────────────────────────────────────────────────── */
function AdSlot({ slot, ads }: { slot: string; ads: any[] }) {
  const ad = ads.find(a => a.position === slot && a.is_active && a.ad_code?.trim());
  if (!ad) return null;
  return (
    <div
      className="blog-ad-slot my-6 text-center overflow-hidden"
      dangerouslySetInnerHTML={{ __html: ad.ad_code }}
    />
  );
}

/* ─── Social Share Bar ────────────────────────────────────────── */
function SocialShareBar({ url, title, mobile }: { url: string; title: string; mobile?: boolean }) {
  const [copied, setCopied] = useState(false);
  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shares = [
    { label: "Facebook",  Icon: Facebook,       color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}` },
    { label: "WhatsApp",  Icon: MessageCircle,  color: "#25D366", href: `https://wa.me/?text=${encodedTitle}%20${encoded}` },
    { label: "Twitter/X", Icon: Twitter,        color: "#000",    href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encoded}` },
    { label: "LinkedIn",  Icon: Linkedin,       color: "#0A66C2", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}` },
  ];

  if (mobile) {
    return (
      <div
        className="fixed left-0 right-0 z-[500] sm:hidden"
        style={{
          bottom: "calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px))",
          background: "rgba(255,255,255,0.97)",
          borderTop: "1px solid #e5e7eb",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center justify-around px-4 py-2.5">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <Share2 className="w-3.5 h-3.5" /> Share
          </span>
          {shares.map(({ label, Icon, color, href }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}
              className="flex flex-col items-center gap-0.5 group">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                style={{ background: `${color}18`, color }}>
                <Icon className="w-4 h-4" />
              </div>
            </a>
          ))}
          <button onClick={copy} className="flex flex-col items-center gap-0.5 group" aria-label="Copy link">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
              style={{ background: copied ? `${GREEN}20` : "#f3f4f6", color: copied ? GREEN : "#6b7280" }}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden lg:flex flex-col items-center gap-3 sticky top-28">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 rotate-[-90deg] mb-2 whitespace-nowrap">Share</span>
      {shares.map(({ label, Icon, color, href }) => (
        <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}
          className="group w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-sm"
          style={{ background: `${color}15`, color }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = color; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}15`; (e.currentTarget as HTMLElement).style.color = color; }}>
          <Icon className="w-4 h-4" />
        </a>
      ))}
      <button onClick={copy} aria-label="Copy link"
        className="group w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-sm"
        style={{ background: copied ? `${GREEN}20` : "#f3f4f620", color: copied ? GREEN : "#9ca3af" }}>
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ─── Table of Contents ───────────────────────────────────────── */
function TableOfContents({ items }: { items: { id: string; text: string; level: number }[] }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("");

  useEffect(() => {
    if (!items.length) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) { setActive(e.target.id); break; }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  if (!items.length) return null;

  return (
    <nav className="rounded-2xl border border-gray-100 overflow-hidden mb-8 shadow-sm"
      style={{ background: "linear-gradient(135deg, #f8fdf4 0%, #fff 100%)" }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 font-bold text-sm"
        style={{ color: GREEN }}>
        <span className="flex items-center gap-2">
          <List className="w-4 h-4" />
          Table of Contents
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <ol className="px-5 pb-4 space-y-1 border-t border-gray-100">
          {items.map(({ id, text, level }) => (
            <li key={id} style={{ paddingLeft: level === 3 ? "1rem" : "0" }}>
              <a href={`#${id}`}
                className="flex items-start gap-2 py-1.5 text-sm transition-all duration-150 group"
                style={{ color: active === id ? GREEN : "#6b7280" }}
                onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                  style={{ color: active === id ? GREEN : "#d1d5db" }} />
                <span className={`leading-snug group-hover:text-gray-900 ${active === id ? "font-semibold" : ""}`}>{text}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

/* ─── Comment form ────────────────────────────────────────────── */
interface CommentFormProps {
  postId: number;
  parentId?: number | null;
  parentName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}
function CommentForm({ postId, parentId = null, parentName, onSuccess, onCancel }: CommentFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    setState("loading");
    try {
      const r = await fetch("/api/blog-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, parentId, name: name.trim(), email: email.trim(), content: content.trim() }),
      });
      if (!r.ok) throw new Error();
      setState("done");
      onSuccess?.();
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl border border-green-100 bg-green-50">
        <Check className="w-5 h-5 flex-shrink-0" style={{ color: GREEN }} />
        <div>
          <p className="font-semibold text-sm text-gray-800">Comment submitted!</p>
          <p className="text-xs text-gray-500 mt-0.5">It will appear after moderation.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {parentName && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <MessageCircle className="w-3.5 h-3.5" /> Replying to <strong>{parentName}</strong>
          {onCancel && <button type="button" onClick={onCancel} className="ml-2 text-red-400 hover:text-red-600">✕</button>}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name *" required maxLength={80}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-green-200 focus:border-transparent bg-white" />
        </div>
        <div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" maxLength={120}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-green-200 focus:border-transparent bg-white" />
        </div>
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write your comment…" required rows={4} maxLength={2000}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-green-200 focus:border-transparent bg-white resize-none" />
      {state === "error" && (
        <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Failed to submit. Please try again.</p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={state === "loading"}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: GREEN }}>
          {state === "loading" ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
          Post Comment
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>}
      </div>
    </form>
  );
}

/* ─── Comment Thread ──────────────────────────────────────────── */
function CommentItem({ comment, postId, depth = 0, refetch }: { comment: any; postId: number; depth?: number; refetch: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(comment.likes ?? 0);
  const replies = comment._replies ?? [];

  const handleLike = async () => {
    if (liked) return;
    setLiked(true);
    setLikes((n: number) => n + 1);
    await fetch(`/api/blog-comments/${comment.id}/like`, { method: "POST" });
  };

  return (
    <div className={depth > 0 ? "ml-8 border-l-2 pl-5" : ""} style={{ borderColor: depth > 0 ? "#e5e7eb" : "transparent" }}>
      <div className="flex gap-3 py-4">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{ background: `${GREEN}18`, color: GREEN }}>
          {comment.name?.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-gray-900">{comment.name}</span>
            <span className="text-[11px] text-gray-400">
              {new Date(comment.created_at).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{comment.content}</p>
          <div className="flex items-center gap-3 mt-2">
            <button onClick={handleLike} disabled={liked}
              className={`flex items-center gap-1 text-xs transition-colors ${liked ? "text-green-600 font-semibold" : "text-gray-400 hover:text-green-600"}`}>
              <ThumbsUp className="w-3.5 h-3.5" />{likes}
            </button>
            {depth === 0 && (
              <button onClick={() => setReplyOpen(o => !o)}
                className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                <MessageCircle className="w-3.5 h-3.5" />Reply
              </button>
            )}
          </div>
          {replyOpen && (
            <div className="mt-3">
              <CommentForm postId={postId} parentId={comment.id} parentName={comment.name}
                onSuccess={() => { setReplyOpen(false); refetch(); }}
                onCancel={() => setReplyOpen(false)} />
            </div>
          )}
        </div>
      </div>
      {replies.map((r: any) => (
        <CommentItem key={r.id} comment={r} postId={postId} depth={depth + 1} refetch={refetch} />
      ))}
    </div>
  );
}

/* ─── Comments Section ────────────────────────────────────────── */
function CommentsSection({ postId }: { postId: number }) {
  const { data: rawComments = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/blog-comments", postId],
    queryFn: () => fetch(`/api/blog-comments?postId=${postId}`).then(r => r.ok ? r.json() : []),
    staleTime: 30 * 1000,
  });

  const threaded = rawComments
    .filter(c => !c.parent_id)
    .map(c => ({ ...c, _replies: rawComments.filter(r => r.parent_id === c.id) }));

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <MessageCircle className="w-5 h-5" style={{ color: GREEN }} />
        Comments <span className="text-sm font-normal text-gray-400 ml-1">({rawComments.length})</span>
      </h2>

      {threaded.length === 0 ? (
        <div className="text-center py-10 rounded-2xl border border-dashed border-gray-200 mb-6">
          <MessageCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No comments yet. Be the first to share your thoughts!</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 overflow-hidden mb-6 divide-y divide-gray-100 bg-white">
          {threaded.map(c => (
            <div key={c.id} className="px-5">
              <CommentItem comment={c} postId={postId} refetch={refetch} />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 p-5 bg-gray-50/60">
        <h3 className="font-bold text-sm text-gray-800 mb-4 flex items-center gap-2">
          <User className="w-4 h-4" style={{ color: GREEN }} /> Leave a Comment
        </h3>
        <CommentForm postId={postId} onSuccess={refetch} />
      </div>
    </section>
  );
}

/* ─── Related Posts ───────────────────────────────────────────── */
function RelatedPosts({ currentSlug, tags }: { currentSlug: string; tags?: string }) {
  const tag = tags?.split(",")[0]?.trim();
  const { data } = useQuery<any>({
    queryKey: ["/api/blog-posts-related", tag],
    queryFn: () => fetch(`/api/blog-posts?limit=4&status=published${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`).then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });
  const posts = (data?.posts ?? []).filter((p: any) => p.slug !== currentSlug).slice(0, 3);
  if (!posts.length) return null;

  return (
    <section className="mt-12 pt-8 border-t border-gray-100">
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <BookOpen className="w-5 h-5" style={{ color: ORANGE }} />
        Related Articles
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {posts.map((post: any) => (
          <Link key={post.id} href={`/blog/${post.slug}`}
            className="group rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-200 bg-white">
            <div className="h-36 overflow-hidden bg-gray-50">
              {post.featuredImagePath ? (
                <img src={`/api/storage${post.featuredImagePath}`} alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-gray-200" />
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-sm leading-snug text-gray-900 group-hover:text-green-700 transition-colors line-clamp-2">{post.title}</h3>
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(post.createdAt ?? post.created_at ?? Date.now()).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                <span className="mx-1">·</span>
                <Clock className="w-3 h-3" />{readingTime(post.content)} min
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─── Main Page ───────────────────────────────────────────────── */
export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { data: post, isLoading, isError } = useGetBlogPostBySlug(slug ?? "");
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: ads = [] } = useQuery<any[]>({
    queryKey: ["/api/blog-ads"],
    queryFn: () => fetch("/api/blog-ads").then(r => r.ok ? r.json() : []),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <>
        <ReadingProgressBar />
        <div className="max-w-4xl mx-auto px-4 py-12 animate-pulse space-y-5">
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="h-10 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/4" />
          <div className="h-72 bg-gray-100 rounded-2xl" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
          ))}
        </div>
      </>
    );
  }

  if (isError || !post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <BookOpen className="h-16 w-16 mx-auto mb-4" style={{ color: "#d1d5db" }} />
        <h1 className="text-2xl font-bold text-gray-900">Article not found</h1>
        <p className="text-gray-500 mt-2">This article doesn't exist or has been removed.</p>
        <button onClick={() => setLocation("/blog")}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: GREEN }}>
          <ArrowLeft className="h-4 w-4" />Back to Blog
        </button>
      </div>
    );
  }

  const metaTitle    = post.metaTitle || post.title;
  const metaDesc     = post.metaDescription || post.excerpt || post.content.replace(/<[^>]+>/g, "").substring(0, 160);
  const canonicalUrl = typeof window !== "undefined" ? window.location.href : `https://khanbabadryfruits.com/blog/${post.slug}`;
  const imgUrl       = post.featuredImagePath ? `/api/storage${post.featuredImagePath}` : null;
  const publishDate  = new Date(post.createdAt ?? Date.now()).toISOString();
  const readMins     = readingTime(post.content);
  const toc          = extractToc(post.content);
  const inContent1Ad = ads.find(a => a.position === "in_content_1" && a.is_active && a.ad_code?.trim());
  const processedHtml = injectHeadingIds(
    inContent1Ad ? injectInContentAds(post.content, inContent1Ad.ad_code) : post.content
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": canonicalUrl,
        "headline": post.title,
        "description": metaDesc,
        "datePublished": publishDate,
        "dateModified": new Date(post.updatedAt ?? post.createdAt ?? Date.now()).toISOString(),
        "author": { "@type": "Organization", "name": "KDF NUTS", "url": "https://khanbabadryfruits.com" },
        "publisher": {
          "@type": "Organization",
          "name": "KDF NUTS",
          "logo": { "@type": "ImageObject", "url": "https://khanbabadryfruits.com/logo.png" },
        },
        ...(imgUrl ? { "image": { "@type": "ImageObject", "url": `https://khanbabadryfruits.com${imgUrl}` } } : {}),
        "keywords": post.keywords ?? post.tags ?? "",
        "articleBody": post.content.replace(/<[^>]+>/g, ""),
        "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home",  "item": "https://khanbabadryfruits.com" },
          { "@type": "ListItem", "position": 2, "name": "Blog",  "item": "https://khanbabadryfruits.com/blog" },
          { "@type": "ListItem", "position": 3, "name": post.title, "item": canonicalUrl },
        ],
      },
    ],
  };

  return (
    <>
      <ReadingProgressBar />

      <Helmet>
        <title>{metaTitle} – KDF NUTS Blog</title>
        <meta name="description" content={metaDesc} />
        {post.keywords && <meta name="keywords" content={post.keywords} />}
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="KDF NUTS" />
        {imgUrl && <meta property="og:image" content={`https://khanbabadryfruits.com${imgUrl}`} />}
        <meta property="article:published_time" content={publishDate} />
        <meta property="article:author" content="KDF NUTS" />
        {post.tags?.split(",").map((t: string) => (
          <meta key={t} property="article:tag" content={t.trim()} />
        ))}
        <meta name="twitter:card" content={imgUrl ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDesc} />
        {imgUrl && <meta name="twitter:image" content={`https://khanbabadryfruits.com${imgUrl}`} />}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* Mobile share bar */}
      <SocialShareBar url={canonicalUrl} title={post.title} mobile />

      <article className="pb-20 sm:pb-0">

        {/* ── Hero Image ────────────────────────────────────────── */}
        {imgUrl && (
          <div className="w-full max-h-[480px] overflow-hidden" style={{ background: "#f1f5f9" }}>
            <img src={imgUrl} alt={post.title}
              className="w-full max-h-[480px] object-cover" loading="eager" fetchPriority="high" />
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8 lg:gap-12 py-10">

            {/* ── Left: Share Sidebar ─────────────────────────── */}
            <aside className="hidden lg:block w-14 flex-shrink-0">
              <SocialShareBar url={canonicalUrl} title={post.title} />
            </aside>

            {/* ── Main Article ────────────────────────────────── */}
            <main className="flex-1 min-w-0 max-w-3xl">

              {/* Breadcrumb */}
              <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-5">
                <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
                <ChevronRight className="w-3 h-3" />
                <Link href="/blog" className="hover:text-gray-600 transition-colors">Blog</Link>
                <ChevronRight className="w-3 h-3" />
                <span className="text-gray-600 truncate max-w-[200px]">{post.title}</span>
              </nav>

              {/* Tags */}
              {post.tags && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {post.tags.split(",").map((tag: string) => (
                    <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag.trim())}`}
                      className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80"
                      style={{ background: `${GREEN}15`, color: GREEN }}>
                      <Tag className="w-2.5 h-2.5" />{tag.trim()}
                    </Link>
                  ))}
                </div>
              )}

              {/* Title */}
              <h1 className="text-3xl sm:text-4xl font-black leading-tight tracking-tight text-gray-900 mb-5">
                {post.title}
              </h1>

              {/* Meta bar */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 pb-6 mb-6 border-b border-gray-100">
                <span className="flex items-center gap-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: GREEN }}>K</div>
                  <span className="font-medium text-gray-700">KDF NUTS</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" style={{ color: GREEN }} />
                  {new Date(post.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" style={{ color: ORANGE }} />
                  {readMins} min read
                </span>
                {post.views > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-gray-400" />
                    {post.views.toLocaleString()} views
                  </span>
                )}
              </div>

              {/* Top Ad */}
              <AdSlot slot="top_banner" ads={ads} />

              {/* Excerpt */}
              {post.excerpt && (
                <div className="mb-6 px-5 py-4 rounded-2xl text-base leading-relaxed italic font-medium text-gray-700"
                  style={{ background: `${GREEN}0c`, borderLeft: `4px solid ${GREEN}` }}>
                  {post.excerpt}
                </div>
              )}

              {/* Table of Contents */}
              <TableOfContents items={toc} />

              {/* Article Content */}
              <div ref={contentRef}
                className="blog-content prose max-w-none
                  prose-headings:font-black prose-headings:tracking-tight prose-headings:text-gray-900
                  prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                  prose-h3:text-xl prose-h3:mt-7 prose-h3:mb-3
                  prose-p:text-gray-700 prose-p:leading-[1.85] prose-p:my-4 prose-p:text-[1.0625rem]
                  prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                  prose-img:rounded-2xl prose-img:shadow-md prose-img:my-8
                  prose-ul:my-5 prose-ol:my-5 prose-li:my-2 prose-li:text-gray-700
                  prose-strong:font-bold prose-strong:text-gray-900
                  prose-blockquote:border-l-4 prose-blockquote:not-italic prose-blockquote:font-medium
                  prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:not-italic"
                style={{ "--tw-prose-links": GREEN } as any}
                dangerouslySetInnerHTML={{ __html: processedHtml }}
              />

              {/* Bottom Ad */}
              <AdSlot slot="bottom_banner" ads={ads} />

              {/* Tags footer */}
              {post.tags && (
                <div className="mt-10 pt-6 border-t border-gray-100 flex flex-wrap gap-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide self-center mr-1">Tags:</span>
                  {post.tags.split(",").map((t: string) => (
                    <Link key={t} href={`/blog?tag=${encodeURIComponent(t.trim())}`}
                      className="px-3 py-1 rounded-full text-xs border transition-all hover:border-green-400 hover:text-green-700"
                      style={{ borderColor: "#e5e7eb", color: "#6b7280" }}>
                      #{t.trim()}
                    </Link>
                  ))}
                </div>
              )}

              {/* Author box */}
              <div className="mt-10 p-5 sm:p-6 rounded-2xl border border-gray-100 flex gap-4 items-start shadow-sm bg-gradient-to-br from-gray-50 to-white">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-black text-xl shadow"
                  style={{ background: `linear-gradient(135deg, ${GREEN}, #3d7000)` }}>K</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">KDF NUTS Team</p>
                  <p className="text-xs text-gray-500 mt-0.5 mb-2">Health & Nutrition Experts · Pakistan's Premium Dry Fruits Brand</p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    We're passionate about bringing you the freshest premium dry fruits from Pakistan's finest farms. Our team shares health tips, recipes, and nutrition guides to help you live better.
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <a href={import.meta.env.BASE_URL} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90 text-white" style={{ background: GREEN }}>
                      Visit Store
                    </a>
                    <a href={`${import.meta.env.BASE_URL}blog`} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                      More Articles →
                    </a>
                  </div>
                </div>
              </div>

              {/* Related Posts */}
              <RelatedPosts currentSlug={post.slug} tags={post.tags} />

              {/* Comments */}
              <CommentsSection postId={post.id} />

            </main>

            {/* ── Right Sidebar ────────────────────────────────── */}
            <aside className="hidden xl:block w-64 flex-shrink-0">
              <div className="sticky top-24 space-y-6">
                {/* Sidebar Ad */}
                <AdSlot slot="sidebar_sticky" ads={ads} />

                {/* Back to Blog */}
                <div className="rounded-2xl border border-gray-100 p-4 bg-white shadow-sm">
                  <button onClick={() => setLocation("/blog")}
                    className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80 w-full"
                    style={{ color: GREEN }}>
                    <ArrowLeft className="w-4 h-4" />All Articles
                  </button>
                </div>

                {/* Share */}
                <div className="rounded-2xl border border-gray-100 p-4 bg-white shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5" />Share this article
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { label: "Facebook", color: "#1877F2", Icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}` },
                      { label: "WhatsApp", color: "#25D366", Icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(post.title + " " + canonicalUrl)}` },
                      { label: "Twitter",  color: "#000",    Icon: Twitter,       href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(canonicalUrl)}` },
                    ].map(({ label, color, Icon, href }) => (
                      <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}
                        className="flex-1 py-2 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
                        style={{ background: `${color}15`, color }}>
                        <Icon className="w-4 h-4" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

          </div>
        </div>
      </article>

      <style>{`
        .blog-content h2 { color: #111827; border-bottom: 2px solid ${GREEN}30; padding-bottom: 0.5rem; }
        .blog-content h3 { color: #1f2937; }
        .blog-content blockquote { background: ${GREEN}08; border-radius: 0.75rem; padding: 1rem 1.5rem; margin: 1.5rem 0; border-left-color: ${GREEN}; color: #374151; }
        .blog-content ul li::marker { color: ${GREEN}; }
        .blog-content ol li::marker { color: ${GREEN}; font-weight: 700; }
        .blog-content a { color: ${GREEN}; }
        .blog-content strong { color: #111827; }
        .blog-content img { width: 100%; }
        .blog-ad-incontent { text-align: center; margin: 2rem 0; min-height: 90px; }
      `}</style>
    </>
  );
}
