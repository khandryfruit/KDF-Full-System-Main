import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ChevronRight, FileText, Loader2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function PolicyPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: siteSettings } = useSiteSettings();
  const siteName = siteSettings?.siteName ?? "KDF Plus";

  const { data: policy, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/policies", slug],
    queryFn: () => fetch(`/api/policies/${slug}`).then(r => { if (!r.ok) throw new Error("Not found"); return r.json(); }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading policy...</span>
        </div>
      </div>
    );
  }

  if (isError || !policy) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/40" />
        <h1 className="text-xl font-bold text-gray-900">Page Not Found</h1>
        <p className="text-sm text-gray-500">This policy page doesn't exist or has been removed.</p>
        <Link href="/" className="text-sm font-medium hover:underline" style={{ color: "#5FA800" }}>← Back to Home</Link>
      </div>
    );
  }

  return (
    <>
      {policy.metaTitle && (
        <Helmet>
          <title>{policy.metaTitle} | {siteName}</title>
          {policy.metaDescription && <meta name="description" content={policy.metaDescription} />}
        </Helmet>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-8">
          <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-600 font-medium">{policy.title}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8 pb-8 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#5FA800" + "1a" }}>
            <FileText className="w-5 h-5" style={{ color: "#5FA800" }} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{policy.title}</h1>
            <p className="text-sm text-gray-400 mt-1">
              Last updated: {new Date(policy.updatedAt ?? policy.createdAt).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </div>

        {/* Content */}
        <div
          className="prose prose-sm sm:prose max-w-none text-gray-700
            prose-headings:text-gray-900 prose-headings:font-bold
            prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
            prose-p:leading-relaxed prose-p:text-gray-600
            prose-a:text-[#5FA800] prose-a:no-underline hover:prose-a:underline
            prose-ul:text-gray-600 prose-li:my-1
            prose-strong:text-gray-800"
          dangerouslySetInnerHTML={{ __html: policy.content }}
        />
      </div>
    </>
  );
}
