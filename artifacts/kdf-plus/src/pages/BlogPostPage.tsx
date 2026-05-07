import { useParams, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { useGetBlogPostBySlug } from "@workspace/api-client-react";
import { Calendar, Clock, Tag, ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function readingTime(content: string) {
  const words = content.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { data: post, isLoading, isError } = useGetBlogPostBySlug(slug ?? "");

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 animate-pulse space-y-4">
        <div className="h-6 bg-muted rounded w-1/4" />
        <div className="h-10 bg-muted rounded w-3/4" />
        <div className="h-64 bg-muted rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 bg-muted rounded" style={{ width: `${80 + Math.random() * 20}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <BookOpen className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold">Post not found</h1>
        <p className="text-muted-foreground mt-2">
          This article doesn't exist or has been removed.
        </p>
        <Button variant="outline" className="mt-6 gap-2" onClick={() => setLocation("/blog")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Button>
      </div>
    );
  }

  const metaTitle = post.metaTitle || post.title;
  const metaDesc =
    post.metaDescription ||
    post.excerpt ||
    post.content.replace(/<[^>]+>/g, "").substring(0, 160);
  const canonicalUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDesc} />
        {post.keywords && <meta name="keywords" content={post.keywords} />}
        <link rel="canonical" href={canonicalUrl} />
        {/* Open Graph */}
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        {post.featuredImagePath && (
          <meta
            property="og:image"
            content={`/api/storage${post.featuredImagePath}`}
          />
        )}
        {/* Article meta */}
        <meta
          property="article:published_time"
          content={new Date(post.createdAt ?? Date.now()).toISOString()}
        />
        {post.tags &&
          post.tags.split(",").map((tag) => (
            <meta key={tag} property="article:tag" content={tag.trim()} />
          ))}
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Back */}
        <button
          onClick={() => setLocation("/blog")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </button>

        {/* Tags */}
        {post.tags && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.split(",").map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                <Tag className="h-2.5 w-2.5 mr-1" />
                {tag.trim()}
              </Badge>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {new Date(post.createdAt ?? Date.now()).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {readingTime(post.content)} min read
          </span>
        </div>

        {/* Featured image */}
        {post.featuredImagePath && (
          <div className="mt-8 rounded-2xl overflow-hidden">
            <img
              src={`/api/storage${post.featuredImagePath}`}
              alt={post.title}
              className="w-full max-h-[420px] object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Excerpt */}
        {post.excerpt && (
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed border-l-4 border-primary pl-4 italic">
            {post.excerpt}
          </p>
        )}

        {/* Content */}
        <div
          className="mt-8 prose prose-sm sm:prose max-w-none
            prose-headings:font-bold prose-headings:tracking-tight
            prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3
            prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-2
            prose-p:leading-relaxed prose-p:my-4
            prose-a:text-primary prose-a:underline hover:prose-a:no-underline
            prose-img:rounded-xl prose-img:my-6
            prose-ul:my-4 prose-li:my-1
            prose-strong:font-semibold
            prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Footer */}
        <div className="mt-12 pt-8 border-t">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {post.tags && (
              <div className="flex flex-wrap gap-1.5">
                {post.tags.split(",").map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    #{tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
            <Button variant="outline" className="gap-2" onClick={() => setLocation("/blog")}>
              <ArrowLeft className="h-4 w-4" />
              More Articles
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
