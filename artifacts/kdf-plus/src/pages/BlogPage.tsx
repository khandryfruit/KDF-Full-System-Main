import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Helmet } from "react-helmet-async";
import { useListBlogPosts } from "@workspace/api-client-react";
import { Calendar, Clock, Tag, BookOpen, TrendingUp, Rss, Search, X } from "lucide-react";

const GREEN  = "#5FA800";
const ORANGE = "#F58300";

function readingTime(content: string) {
  const words = content.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function PostCard({ post, featured }: { post: any; featured?: boolean }) {
  const [, setLocation] = useLocation();
  const img = post.featuredImagePath ? `/api/storage${post.featuredImagePath}` : null;
  const date = new Date(post.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const mins = readingTime(post.content);

  if (featured) {
    return (
      <article onClick={() => setLocation(`/blog/${post.slug}`)}
        className="group cursor-pointer rounded-3xl overflow-hidden border border-gray-100 hover:shadow-xl transition-all duration-300 bg-white flex flex-col sm:flex-row">
        <div className="sm:w-1/2 h-56 sm:h-auto overflow-hidden bg-gray-50 flex-shrink-0">
          {img ? (
            <img src={img} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="eager" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: `${GREEN}08` }}>
              <BookOpen className="w-12 h-12" style={{ color: `${GREEN}40` }} />
            </div>
          )}
        </div>
        <div className="flex flex-col justify-between p-6 sm:p-8 flex-1">
          <div>
            {post.tags && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {post.tags.split(",").slice(0, 2).map((t: string) => (
                  <span key={t} className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: `${GREEN}15`, color: GREEN }}>
                    {t.trim()}
                  </span>
                ))}
                <span className="px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ background: ORANGE }}>
                  Featured
                </span>
              </div>
            )}
            <h2 className="text-2xl sm:text-3xl font-black leading-tight text-gray-900 group-hover:text-green-700 transition-colors mb-3">
              {post.title}
            </h2>
            {post.excerpt && (
              <p className="text-gray-500 leading-relaxed line-clamp-3">{post.excerpt}</p>
            )}
          </div>
          <div className="flex items-center gap-4 mt-5 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{date}</span>
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{mins} min read</span>
            {post.views > 0 && (
              <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />{post.views.toLocaleString()} views</span>
            )}
            <span className="ml-auto flex items-center gap-1 font-semibold text-sm" style={{ color: GREEN }}>
              Read article →
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article onClick={() => setLocation(`/blog/${post.slug}`)}
      className="group cursor-pointer rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-200 bg-white h-full flex flex-col">
      <div className="h-48 overflow-hidden bg-gray-50 flex-shrink-0">
        {img ? (
          <img src={img} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `${GREEN}06` }}>
            <BookOpen className="w-8 h-8" style={{ color: `${GREEN}30` }} />
          </div>
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        {post.tags && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {post.tags.split(",").slice(0, 2).map((t: string) => (
              <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: `${GREEN}12`, color: GREEN }}>{t.trim()}</span>
            ))}
          </div>
        )}
        <h2 className="font-bold text-base leading-snug text-gray-900 group-hover:text-green-700 transition-colors line-clamp-2 flex-1">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="text-sm text-gray-500 mt-2 line-clamp-2">{post.excerpt}</p>
        )}
        <div className="flex items-center gap-3 mt-4 text-xs text-gray-400 pt-3 border-t border-gray-50">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{date}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{mins} min</span>
          <span className="ml-auto font-semibold" style={{ color: GREEN }}>Read →</span>
        </div>
      </div>
    </article>
  );
}

const ALL_TAGS = ["Health", "Nutrition", "Dry Fruits", "Recipes", "Almonds", "Cashews", "Walnuts"];

export default function BlogPage() {
  const [page, setPage]         = useState(1);
  const [searchQ, setSearchQ]   = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const { data, isLoading } = useListBlogPosts({ status: "published", page, limit: 9 });
  const posts = (data?.posts ?? []).filter((p: any) => {
    if (activeTag && !p.tags?.toLowerCase().includes(activeTag.toLowerCase())) return false;
    if (searchQ && !p.title.toLowerCase().includes(searchQ.toLowerCase()) && !p.excerpt?.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });
  const totalPages = data?.totalPages ?? 1;
  const featured = posts[0];
  const rest     = posts.slice(1);

  return (
    <>
      <Helmet>
        <title>Blog & Articles – KDF NUTS</title>
        <meta name="description" content="Discover tips on nutrition, health benefits of natural nuts, dry fruits recipes, and more from KDF NUTS experts." />
        <meta property="og:title" content="Blog – KDF NUTS" />
        <meta property="og:description" content="Nutrition tips, dry fruit guides & healthy living articles." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://khanbabadryfruits.com/blog" />
      </Helmet>

      {/* ── Hero banner ──────────────────────────────────────── */}
      <div className="relative overflow-hidden py-14 sm:py-20"
        style={{ background: "linear-gradient(135deg, #0f2400 0%, #1a3d00 50%, #0a1a00 100%)" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div className="relative max-w-6xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4" style={{ background: `${GREEN}30`, color: GREEN }}>
            <Rss className="w-3.5 h-3.5" />KDF NUTS Blog
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">
            Healthy Living,<br />
            <span style={{ color: GREEN }}>Naturally.</span>
          </h1>
          <p className="text-white/60 max-w-xl mx-auto text-base mb-8">
            Nutrition tips, dry fruit guides, health benefits, and delicious recipes from Pakistan's premium dry fruits brand.
          </p>
          {/* Search */}
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Search articles…"
              className="w-full pl-11 pr-10 py-3 rounded-2xl text-sm outline-none bg-white shadow-lg"
            />
            {searchQ && (
              <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Tag Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <button onClick={() => setActiveTag(null)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={!activeTag ? { background: GREEN, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}>
            All
          </button>
          {ALL_TAGS.map(tag => (
            <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={activeTag === tag ? { background: GREEN, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}>
              {tag}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-white overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-100" />
                <div className="p-5 space-y-3">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-5 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookOpen className="h-16 w-16 mb-4" style={{ color: "#e5e7eb" }} />
            <h2 className="text-xl font-bold text-gray-700">No articles found</h2>
            <p className="text-gray-400 mt-2 text-sm">
              {searchQ ? `No results for "${searchQ}"` : "Check back soon for helpful content."}
            </p>
            {(searchQ || activeTag) && (
              <button onClick={() => { setSearchQ(""); setActiveTag(null); }}
                className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: GREEN }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Featured post */}
            {featured && !searchQ && !activeTag && page === 1 && (
              <div className="mb-8">
                <PostCard post={featured} featured />
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {(searchQ || activeTag || page > 1 ? posts : rest).map((post: any) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-12">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40 hover:border-green-400"
                  style={{ borderColor: "#e5e7eb", color: "#374151" }}>
                  ← Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className="w-9 h-9 rounded-xl text-sm font-semibold transition-all"
                      style={p === page ? { background: GREEN, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}>
                      {p}
                    </button>
                  ))}
                </div>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40 hover:border-green-400"
                  style={{ borderColor: "#e5e7eb", color: "#374151" }}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
