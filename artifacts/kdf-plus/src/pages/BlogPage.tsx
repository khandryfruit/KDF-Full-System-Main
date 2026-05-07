import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { useListBlogPosts } from "@workspace/api-client-react";
import { Calendar, Clock, Tag, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function readingTime(content: string) {
  const words = content.replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default function BlogPage() {
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
  const { data, isLoading } = useListBlogPosts({ status: "published", page, limit: 9 });

  const posts = data?.posts ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <>
      <Helmet>
        <title>Blog – KDF NUTS</title>
        <meta
          name="description"
          content="Read the latest articles on nutrition, health, and natural snacks from KDF NUTS."
        />
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Blog & Articles</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Discover tips on nutrition, health benefits of natural nuts, recipes, and more.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-card overflow-hidden animate-pulse">
                <div className="h-48 bg-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookOpen className="h-14 w-14 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">No articles yet</h2>
            <p className="text-muted-foreground mt-2">Check back soon for helpful content.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post, idx) => (
                <article
                  key={post.id}
                  onClick={() => setLocation(`/blog/${post.slug}`)}
                  className={`group rounded-2xl border bg-card overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer h-full flex flex-col ${idx === 0 ? "sm:col-span-2 lg:col-span-1" : ""}`}
                >
                    {post.featuredImagePath ? (
                      <div className="relative overflow-hidden h-48">
                        <img
                          src={`/api/storage${post.featuredImagePath}`}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        <BookOpen className="h-10 w-10 text-primary/30" />
                      </div>
                    )}
                    <div className="p-5 flex flex-col flex-1">
                      {post.tags && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {post.tags
                            .split(",")
                            .slice(0, 2)
                            .map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-xs font-normal"
                              >
                                {tag.trim()}
                              </Badge>
                            ))}
                        </div>
                      )}
                      <h2 className="font-semibold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(post.createdAt ?? Date.now()).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {readingTime(post.content)} min read
                        </span>
                      </div>
                    </div>
                </article>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-10">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
