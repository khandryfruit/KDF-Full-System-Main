import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Plus, Edit, Trash2, Loader2, GripVertical,
  Youtube, Link2, Instagram, Smartphone, Eye, BarChart2,
  Video, X, Settings, Clock, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminApiUrl } from "@/lib/apiBase";

const GREEN = "#5FA800";
const token = () => localStorage.getItem("kdf_admin_token") ?? "";
const api   = (path: string, opts?: RequestInit) =>
  fetch(adminApiUrl(path), { headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, ...opts });

type Reel = {
  id: number; title: string; description?: string;
  cfStreamId?: string; cfAccountId?: string;
  directVideoUrl?: string; instagramUrl?: string; youtubeUrl?: string;
  thumbnailUrl?: string;
  autoplay: boolean; muted: boolean; loop: boolean;
  duration?: number;
  ctaLabel?: string; ctaUrl?: string; linkedProductId?: number;
  category?: string;
  sortOrder: number; active: boolean;
  viewCount: number; likeCount: number;
  startDate?: string; endDate?: string;
};

const emptyForm = (): Partial<Reel> => ({
  title: "", description: "",
  cfStreamId: "", cfAccountId: "",
  directVideoUrl: "", instagramUrl: "", youtubeUrl: "", thumbnailUrl: "",
  autoplay: true, muted: true, loop: true,
  ctaLabel: "", ctaUrl: "", category: "general",
  sortOrder: 0, active: true,
});

function sourceLabel(r: Reel) {
  if (r.cfStreamId) return { label: "Cloudflare", color: "bg-orange-100 text-orange-700" };
  if (r.directVideoUrl) return { label: "Direct URL", color: "bg-blue-100 text-blue-700" };
  if (r.instagramUrl) return { label: "Instagram", color: "bg-pink-100 text-pink-700" };
  if (r.youtubeUrl) return { label: "YouTube", color: "bg-red-100 text-red-700" };
  return { label: "No Source", color: "bg-gray-100 text-gray-600" };
}

function ReelThumbnail({ reel }: { reel: Reel }) {
  if (reel.thumbnailUrl) {
    const src = reel.thumbnailUrl.startsWith("http") ? reel.thumbnailUrl : `/api/storage/objects/${reel.thumbnailUrl}`;
    return <img src={src} alt={reel.title} className="w-full h-full object-cover" />;
  }
  if (reel.directVideoUrl) {
    return <video src={reel.directVideoUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
      <Smartphone className="w-6 h-6 text-gray-500" />
    </div>
  );
}

export default function MobileReelsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<Reel | null>(null);
  const [form, setForm]       = useState(emptyForm());
  const [activeTab, setActiveTab] = useState<"source" | "display" | "cta" | "schedule">("source");

  const { data: reels = [], isLoading } = useQuery<Reel[]>({
    queryKey: ["admin-mobile-reels"],
    queryFn: () => api("/admin/mobile-reels").then(r => r.json()),
  });

  const create = useMutation({
    mutationFn: (data: any) => api("/admin/mobile-reels", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-mobile-reels"] }); toast({ title: "Reel created!" }); setOpen(false); },
    onError: () => toast({ title: "Error", description: "Failed to create reel", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api(`/admin/mobile-reels/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-mobile-reels"] }); toast({ title: "Reel updated!" }); setOpen(false); },
    onError: () => toast({ title: "Error", description: "Failed to update", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/admin/mobile-reels/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-mobile-reels"] }); toast({ title: "Deleted" }); },
  });

  function openNew() {
    setEditing(null); setForm(emptyForm()); setActiveTab("source"); setOpen(true);
  }

  function openEdit(r: Reel) {
    setEditing(r); setForm({ ...r }); setActiveTab("source"); setOpen(true);
  }

  function handleSave() {
    if (!form.title) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (editing) update.mutate({ id: editing.id, data: form });
    else create.mutate(form);
  }

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const TABS = [
    { id: "source",   label: "Video Source", icon: Video },
    { id: "display",  label: "Settings",     icon: Settings },
    { id: "cta",      label: "CTA & Link",   icon: Link2 },
    { id: "schedule", label: "Schedule",     icon: Clock },
  ] as const;

  const CATEGORIES = ["general", "products", "promotions", "brand", "tutorials", "seasonal"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone className="w-6 h-6" style={{ color: GREEN }} /> Mobile Reels Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            TikTok/Instagram-style vertical video reels for mobile users
          </p>
        </div>
        <Button onClick={openNew} style={{ background: GREEN }} className="text-white gap-2">
          <Plus className="w-4 h-4" /> Add Reel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Reels",  value: reels.length },
          { label: "Active",       value: reels.filter(r => r.active).length },
          { label: "Total Views",  value: reels.reduce((s, r) => s + r.viewCount, 0).toLocaleString() },
          { label: "Total Likes",  value: reels.reduce((s, r) => s + r.likeCount, 0).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />)}
        </div>
      ) : reels.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <Smartphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No reels yet</p>
          <p className="text-gray-400 text-sm mb-4">Add vertical videos for mobile users</p>
          <Button onClick={openNew} style={{ background: GREEN }} className="text-white">
            <Plus className="w-4 h-4 mr-1" /> Add First Reel
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {reels.map(r => {
            const src = sourceLabel(r);
            return (
              <div key={r.id} className="relative group rounded-2xl overflow-hidden bg-gray-900 shadow-sm hover:shadow-xl transition-shadow cursor-pointer"
                style={{ aspectRatio: "9/16" }}>
                <ReelThumbnail reel={r} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Status badges */}
                <div className="absolute top-2 left-2 right-2 flex justify-between">
                  <Badge className={`text-[9px] px-1.5 py-0.5 ${src.color}`}>{src.label}</Badge>
                  {!r.active && <Badge className="text-[9px] bg-gray-800 text-gray-300 px-1.5 py-0.5">Inactive</Badge>}
                </div>

                {/* Info */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-xs font-semibold line-clamp-2 mb-1">{r.title}</p>
                  <div className="flex items-center gap-2 text-white/60 text-[10px]">
                    <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{r.viewCount}</span>
                    <span className="flex items-center gap-0.5"><BarChart2 className="w-3 h-3" />{r.likeCount}</span>
                  </div>
                </div>

                {/* Hover actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => openEdit(r)}
                    className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/40 transition-colors">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { if (confirm("Delete reel?")) remove.mutate(r.id); }}
                    className="w-8 h-8 rounded-full bg-red-500/70 backdrop-blur flex items-center justify-center text-white hover:bg-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5" style={{ color: GREEN }} />
              {editing ? "Edit Reel" : "New Mobile Reel"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Title *</Label>
                <Input value={form.title ?? ""} onChange={e => set("title", e.target.value)} placeholder="Reel title" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)}
                  placeholder="Short description..." rows={2} className="text-sm" />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id as any)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === id ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  <Icon className="w-3 h-3" />{label}
                </button>
              ))}
            </div>

            {/* Source tab */}
            {activeTab === "source" && (
              <div className="space-y-3">
                <div className="border border-orange-200 rounded-xl p-3 bg-orange-50/40 space-y-2">
                  <p className="text-xs font-semibold text-orange-700 flex items-center gap-1">
                    <Play className="w-3 h-3" /> Cloudflare Stream (Best)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={form.cfStreamId ?? ""} onChange={e => set("cfStreamId", e.target.value)}
                      placeholder="Stream ID" className="h-8 text-xs" />
                    <Input value={form.cfAccountId ?? ""} onChange={e => set("cfAccountId", e.target.value)}
                      placeholder="Account/Customer ID" className="h-8 text-xs" />
                  </div>
                </div>
                <div className="border border-blue-200 rounded-xl p-3 bg-blue-50/40 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> Direct Video URL
                  </p>
                  <Input value={form.directVideoUrl ?? ""} onChange={e => set("directVideoUrl", e.target.value)}
                    placeholder="https://cdn.example.com/reel.mp4" className="h-8 text-xs" />
                </div>
                <div className="border border-pink-200 rounded-xl p-3 bg-pink-50/40 space-y-2">
                  <p className="text-xs font-semibold text-pink-700 flex items-center gap-1">
                    <Instagram className="w-3 h-3" /> Instagram Reel URL
                  </p>
                  <Input value={form.instagramUrl ?? ""} onChange={e => set("instagramUrl", e.target.value)}
                    placeholder="https://www.instagram.com/reel/..." className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Thumbnail Image URL</Label>
                  <Input value={form.thumbnailUrl ?? ""} onChange={e => set("thumbnailUrl", e.target.value)}
                    placeholder="https://... or storage path" className="h-8 text-xs" />
                </div>
                {/* Preview */}
                {(form.directVideoUrl || form.thumbnailUrl) && (
                  <div className="flex justify-center">
                    <div className="relative rounded-xl overflow-hidden bg-black" style={{ width: 120, aspectRatio: "9/16" }}>
                      {form.directVideoUrl
                        ? <video src={form.directVideoUrl} className="w-full h-full object-cover" muted autoPlay loop playsInline />
                        : form.thumbnailUrl && <img src={form.thumbnailUrl.startsWith("http") ? form.thumbnailUrl : `/api/storage/objects/${form.thumbnailUrl}`}
                            className="w-full h-full object-cover" alt="thumb" />
                      }
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Display tab */}
            {activeTab === "display" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "autoplay", label: "Autoplay",  desc: "Auto-play on scroll" },
                    { key: "muted",    label: "Muted",     desc: "Required for autoplay" },
                    { key: "loop",     label: "Loop",      desc: "Repeat reel" },
                    { key: "active",   label: "Active",    desc: "Show to users" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                      <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-gray-500">{desc}</p></div>
                      <Switch checked={!!(form as any)[key]} onCheckedChange={v => set(key as any, v)} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Select value={form.category ?? "general"} onValueChange={v => set("category", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sort Order</Label>
                    <Input type="number" value={form.sortOrder ?? 0} onChange={e => set("sortOrder", parseInt(e.target.value))} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            )}

            {/* CTA tab */}
            {activeTab === "cta" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">CTA Button Label</Label>
                    <Input value={form.ctaLabel ?? ""} onChange={e => set("ctaLabel", e.target.value)}
                      placeholder="Shop Now" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">CTA URL</Label>
                    <Input value={form.ctaUrl ?? ""} onChange={e => set("ctaUrl", e.target.value)}
                      placeholder="/products/product-slug" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Linked Product ID (optional)</Label>
                    <Input type="number" value={form.linkedProductId ?? ""} onChange={e => set("linkedProductId", e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Product ID for quick add-to-cart" className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            )}

            {/* Schedule tab */}
            {activeTab === "schedule" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Schedule when this reel is visible.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Date</Label>
                    <Input type="datetime-local" value={form.startDate ? new Date(form.startDate).toISOString().slice(0, 16) : ""}
                      onChange={e => set("startDate", e.target.value || undefined)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Date</Label>
                    <Input type="datetime-local" value={form.endDate ? new Date(form.endDate).toISOString().slice(0, 16) : ""}
                      onChange={e => set("endDate", e.target.value || undefined)} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} disabled={create.isPending || update.isPending}
                style={{ background: GREEN }} className="flex-1 text-white">
                {(create.isPending || update.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? "Save Changes" : "Create Reel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
