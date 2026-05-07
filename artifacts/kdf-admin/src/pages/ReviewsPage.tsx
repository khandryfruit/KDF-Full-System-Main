import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Check, X, Trash2, Loader2, MessageSquare, Filter } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = (path: string) => `/api${path}`;
const getToken = () => localStorage.getItem("kdf_admin_token") ?? "";

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, { ...opts, headers: { ...(opts.headers ?? {}), Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" } });
}

interface Review {
  id: number;
  productId: number;
  productName: string | null;
  name: string;
  email: string | null;
  rating: number;
  comment: string;
  approved: boolean;
  createdAt: string;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");

  const { data: reviews = [], isLoading } = useQuery<Review[]>({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      const r = await authFetch(API("/admin/reviews"));
      if (!r.ok) throw new Error("Failed to load reviews");
      return r.json();
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => authFetch(API(`/admin/reviews/${id}/approve`), { method: "PUT" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-reviews"] }); toast({ title: "Review approved" }); },
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) => authFetch(API(`/admin/reviews/${id}/reject`), { method: "PUT" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-reviews"] }); toast({ title: "Review rejected" }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(API(`/admin/reviews/${id}`), { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-reviews"] }); toast({ title: "Review deleted" }); },
  });

  const filtered = reviews.filter(r => {
    if (filter === "pending") return !r.approved;
    if (filter === "approved") return r.approved;
    return true;
  });

  const pendingCount = reviews.filter(r => !r.approved).length;
  const approvedCount = reviews.filter(r => r.approved).length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Product Reviews</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Approve or reject customer reviews</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">{pendingCount} Pending</Badge>
            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">{approvedCount} Approved</Badge>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 border-b border-border pb-0">
          {([["all", "All Reviews"], ["pending", "Pending"], ["approved", "Approved"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${filter === val ? "border-[#5FA800] text-[#5FA800]" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
              {val === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 bg-orange-100 text-orange-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Reviews List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading reviews…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <MessageSquare className="w-10 h-10 opacity-30" />
            <p className="text-sm">No {filter === "all" ? "" : filter} reviews yet.</p>
            <p className="text-xs">Reviews are submitted through the product pages on your storefronts.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((review) => (
              <div key={review.id} className={`bg-card border rounded-xl p-5 ${!review.approved ? "border-orange-200 bg-orange-50/30" : "border-border"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1.5">
                      <span className="font-semibold text-sm">{review.name}</span>
                      {review.email && <span className="text-xs text-muted-foreground">{review.email}</span>}
                      <StarDisplay rating={review.rating} />
                      {review.approved ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] h-4 px-1.5">Approved</Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] h-4 px-1.5">Pending</Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{review.comment}</p>
                    <div className="flex items-center gap-3 mt-2">
                      {review.productName && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          📦 {review.productName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!review.approved ? (
                      <Button
                        size="sm"
                        className="h-8 gap-1 bg-[#5FA800] hover:bg-[#4d8a00] text-white"
                        onClick={() => approveMut.mutate(review.id)}
                        disabled={approveMut.isPending}
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 border-orange-300 text-orange-600 hover:bg-orange-50"
                        onClick={() => rejectMut.mutate(review.id)}
                        disabled={rejectMut.isPending}
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (confirm("Delete this review permanently?")) deleteMut.mutate(review.id);
                      }}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
