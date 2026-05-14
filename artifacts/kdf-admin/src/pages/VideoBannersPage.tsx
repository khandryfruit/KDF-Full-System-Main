import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Plus, Edit, Trash2, Eye, EyeOff, GripVertical, Loader2,
  Youtube, Cloud, Link2, Image as ImageIcon, Monitor, Smartphone,
  ChevronDown, ChevronUp, Video, Settings, Zap, AlertCircle, X,
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

const GREEN  = "#5FA800";
const token  = () => localStorage.getItem("kdf_admin_token") ?? "";
const api    = (path: string, opts?: RequestInit) =>
  fetch(adminApiUrl(path), { headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" }, ...opts });

type CTA = { label: string; url: string; style: "primary" | "secondary" | "outline" };
type VideoBanner = {
  id: number; title: string; subtitle?: string;
  cfStreamId?: string; cfAccountId?: string;
  youtubeUrl?: string; youtubeThumbnail?: string;
  directVideoUrl?: string; mobileVideoUrl?: string;
  fallbackImageUrl?: string; mobileFallbackImageUrl?: string;
  autoplay: boolean; muted: boolean; loop: boolean; showControls: boolean;
  ctaButtons: CTA[]; platform: string; sortOrder: number;
  active: boolean; isPriority: boolean;
  startDate?: string; endDate?: string;
  overlayOpacity?: number; textPosition?: string;
};

const emptyForm = (): Partial<VideoBanner> => ({
  title: "", subtitle: "", cfStreamId: "", cfAccountId: "",
  youtubeUrl: "", directVideoUrl: "", mobileVideoUrl: "",
  fallbackImageUrl: "", mobileFallbackImageUrl: "",
  autoplay: true, muted: true, loop: true, showControls: false,
  ctaButtons: [], platform: "both", sortOrder: 0, active: true, isPriority: false,
  overlayOpacity: 50, textPosition: "left",
});

function sourceLabel(b: VideoBanner) {
  if (b.cfStreamId) return { label: "Cloudflare", color: "bg-orange-100 text-orange-700" };
  if (b.youtubeUrl) return { label: "YouTube", color: "bg-red-100 text-red-700" };
  if (b.directVideoUrl) return { label: "Direct URL", color: "bg-blue-100 text-blue-700" };
  return { label: "Image Only", color: "bg-gray-100 text-gray-600" };
}

function getCloudflareEmbedUrl(streamId: string, accountId: string) {
  return `https://customer-${accountId}.cloudflarestream.com/${streamId}/iframe?autoplay=true&muted=true&loop=true&preload=true`;
}

function getYoutubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ── CTA Button Editor ── */
function CTAEditor({ value, onChange }: { value: CTA[]; onChange: (v: CTA[]) => void }) {
  const add = () => onChange([...value, { label: "Shop Now", url: "/products", style: "primary" }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof CTA, val: string) =>
    onChange(value.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  return (
    <div className="space-y-2">
      {value.map((cta, i) => (
        <div key={i} className="flex gap-2 items-center bg-gray-50 rounded-lg p-2">
          <Input value={cta.label} onChange={e => update(i, "label", e.target.value)} placeholder="Label" className="h-8 text-xs flex-1" />
          <Input value={cta.url}   onChange={e => update(i, "url",   e.target.value)} placeholder="/products" className="h-8 text-xs flex-1" />
          <select value={cta.style} onChange={e => update(i, "style", e.target.value as any)}
            className="h-8 text-xs border border-input rounded-md px-2 bg-white">
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="outline">Outline</option>
          </select>
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full h-8 text-xs">
        <Plus className="w-3 h-3 mr-1" /> Add CTA Button
      </Button>
    </div>
  );
}

/* ── Video Preview ── */
function VideoPreview({ banner }: { banner: Partial<VideoBanner> }) {
  if (banner.cfStreamId && banner.cfAccountId) {
    return (
      <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
        <iframe
          src={getCloudflareEmbedUrl(banner.cfStreamId, banner.cfAccountId)}
          className="w-full h-full"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (banner.youtubeUrl) {
    const ytId = getYoutubeId(banner.youtubeUrl);
    if (ytId) return (
      <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=0&mute=1&loop=1`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      </div>
    );
  }
  if (banner.directVideoUrl) {
    return (
      <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
        <video src={banner.directVideoUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
      </div>
    );
  }
  if (banner.fallbackImageUrl) {
    return (
      <div className="relative rounded-xl overflow-hidden aspect-video bg-gray-100">
        <img src={banner.fallbackImageUrl.startsWith("http") ? banner.fallbackImageUrl : `/api/storage/objects/${banner.fallbackImageUrl}`}
          className="w-full h-full object-cover" alt="Fallback" />
      </div>
    );
  }
  return (
    <div className="rounded-xl aspect-video bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
      <Video className="w-8 h-8 mr-2" /> No preview — add a video source
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════ */
export default function VideoBannersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<VideoBanner | null>(null);
  const [form, setForm]       = useState(emptyForm());
  const [activeTab, setActiveTab] = useState<"source" | "display" | "cta" | "schedule">("source");

  const { data: banners = [], isLoading } = useQuery<VideoBanner[]>({
    queryKey: ["admin-video-banners"],
    queryFn: () => api("/admin/video-banners").then(r => r.json()),
  });

  const create = useMutation({
    mutationFn: (data: any) => api("/admin/video-banners", { method: "POST", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-video-banners"] }); toast({ title: "Video banner created!" }); setOpen(false); },
    onError: () => toast({ title: "Error", description: "Failed to create", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api(`/admin/video-banners/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-video-banners"] }); toast({ title: "Banner updated!" }); setOpen(false); },
    onError: () => toast({ title: "Error", description: "Failed to update", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api(`/admin/video-banners/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-video-banners"] }); toast({ title: "Deleted" }); },
  });

  const toggleActive = (b: VideoBanner) =>
    update.mutate({ id: b.id, data: { active: !b.active } });

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setActiveTab("source");
    setOpen(true);
  }

  function openEdit(b: VideoBanner) {
    setEditing(b);
    setForm({ ...b });
    setActiveTab("source");
    setOpen(true);
  }

  function handleSave() {
    if (!form.title) { toast({ title: "Title required", variant: "destructive" }); return; }
    if (editing) update.mutate({ id: editing.id, data: form });
    else create.mutate(form);
  }

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const TABS = [
    { id: "source",   label: "Video Source", icon: Video },
    { id: "display",  label: "Display",       icon: Monitor },
    { id: "cta",      label: "CTA Buttons",   icon: Zap },
    { id: "schedule", label: "Schedule",       icon: Settings },
  ] as const;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Video className="w-6 h-6" style={{ color: GREEN }} /> Video Banner Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cloudflare Stream, YouTube, or direct video — cinematic hero banners for your homepage
          </p>
        </div>
        <Button onClick={openNew} style={{ background: GREEN }} className="text-white gap-2">
          <Plus className="w-4 h-4" /> Add Video Banner
        </Button>
      </div>

      {/* ── Info cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Cloud, color: "text-orange-500", bg: "bg-orange-50", label: "Cloudflare Stream", desc: "Best quality — adaptive bitrate + CDN" },
          { icon: Youtube, color: "text-red-500", bg: "bg-red-50", label: "YouTube Embed", desc: "Easy to setup — use any YouTube URL" },
          { icon: Link2, color: "text-blue-500", bg: "bg-blue-50", label: "Direct Video URL", desc: "MP4, WebM — any publicly accessible URL" },
        ].map(({ icon: Icon, color, bg, label, desc }) => (
          <div key={label} className={`${bg} rounded-xl p-4 flex items-start gap-3`}>
            <Icon className={`w-5 h-5 mt-0.5 ${color}`} />
            <div><p className="font-semibold text-sm text-gray-800">{label}</p><p className="text-xs text-gray-600 mt-0.5">{desc}</p></div>
          </div>
        ))}
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <Video className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No video banners yet</p>
          <p className="text-gray-400 text-sm mb-4">Add your first cinematic video banner</p>
          <Button onClick={openNew} style={{ background: GREEN }} className="text-white"><Plus className="w-4 h-4 mr-1" /> Add Video Banner</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((b, idx) => {
            const src = sourceLabel(b);
            return (
              <div key={b.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex gap-4 items-center shadow-sm hover:shadow-md transition-shadow">
                <GripVertical className="w-5 h-5 text-gray-300 cursor-grab flex-shrink-0" />
                <div className="w-32 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                  <VideoPreview banner={b} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{b.title}</h3>
                    {b.isPriority && <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">Priority</Badge>}
                    <Badge className={`text-[10px] ${src.color}`}>{src.label}</Badge>
                  </div>
                  {b.subtitle && <p className="text-xs text-gray-500 truncate">{b.subtitle}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{b.platform}</span>
                    <span>Order: {b.sortOrder}</span>
                    {b.ctaButtons?.length > 0 && <span>{b.ctaButtons.length} CTA</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Switch checked={b.active} onCheckedChange={() => toggleActive(b)} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                    <Edit className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600"
                    onClick={() => { if (confirm("Delete this video banner?")) remove.mutate(b.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5" style={{ color: GREEN }} />
              {editing ? "Edit Video Banner" : "New Video Banner"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Title *</Label>
                <Input value={form.title ?? ""} onChange={e => set("title", e.target.value)} placeholder="Summer Collection Video" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Subtitle</Label>
                <Input value={form.subtitle ?? ""} onChange={e => set("subtitle", e.target.value)} placeholder="Tagline displayed over the video" />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === id ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* Tab: Source */}
            {activeTab === "source" && (
              <div className="space-y-4">
                {/* Cloudflare */}
                <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-orange-500" />
                    <span className="font-semibold text-sm text-orange-700">Cloudflare Stream (Recommended)</span>
                    <Badge className="bg-orange-100 text-orange-600 text-[10px]">Best Quality</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Stream Video ID</Label>
                      <Input value={form.cfStreamId ?? ""} onChange={e => set("cfStreamId", e.target.value)}
                        placeholder="abc123xyz..." className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Account ID / Customer Subdomain</Label>
                      <Input value={form.cfAccountId ?? ""} onChange={e => set("cfAccountId", e.target.value)}
                        placeholder="abc123" className="h-8 text-sm" />
                      <p className="text-[10px] text-gray-500">From: customer-<strong>XXX</strong>.cloudflarestream.com</p>
                    </div>
                  </div>
                </div>

                {/* YouTube */}
                <div className="border border-red-200 rounded-xl p-4 bg-red-50/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" />
                    <span className="font-semibold text-sm text-red-700">YouTube (Fallback)</span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">YouTube URL</Label>
                    <Input value={form.youtubeUrl ?? ""} onChange={e => set("youtubeUrl", e.target.value)}
                      placeholder="https://youtube.com/watch?v=..." className="h-8 text-sm" />
                  </div>
                </div>

                {/* Direct */}
                <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-blue-500" />
                    <span className="font-semibold text-sm text-blue-700">Direct Video URL</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Desktop Video URL</Label>
                      <Input value={form.directVideoUrl ?? ""} onChange={e => set("directVideoUrl", e.target.value)}
                        placeholder="https://cdn.example.com/banner.mp4" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mobile Video URL</Label>
                      <Input value={form.mobileVideoUrl ?? ""} onChange={e => set("mobileVideoUrl", e.target.value)}
                        placeholder="Mobile version (vertical)" className="h-8 text-sm" />
                    </div>
                  </div>
                </div>

                {/* Fallback */}
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-gray-500" />
                    <span className="font-semibold text-sm">Fallback Image</span>
                    <span className="text-xs text-gray-400">(shown while video loads)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Desktop Fallback</Label>
                      <Input value={form.fallbackImageUrl ?? ""} onChange={e => set("fallbackImageUrl", e.target.value)}
                        placeholder="image path or URL" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Mobile Fallback</Label>
                      <Input value={form.mobileFallbackImageUrl ?? ""} onChange={e => set("mobileFallbackImageUrl", e.target.value)}
                        placeholder="mobile image path or URL" className="h-8 text-sm" />
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Live Preview</Label>
                  <VideoPreview banner={form} />
                </div>
              </div>
            )}

            {/* Tab: Display */}
            {activeTab === "display" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div><p className="text-sm font-medium">Autoplay</p><p className="text-xs text-gray-500">Start playing automatically</p></div>
                    <Switch checked={form.autoplay ?? true} onCheckedChange={v => set("autoplay", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div><p className="text-sm font-medium">Muted</p><p className="text-xs text-gray-500">Required for autoplay</p></div>
                    <Switch checked={form.muted ?? true} onCheckedChange={v => set("muted", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div><p className="text-sm font-medium">Loop</p><p className="text-xs text-gray-500">Repeat video continuously</p></div>
                    <Switch checked={form.loop ?? true} onCheckedChange={v => set("loop", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div><p className="text-sm font-medium">Show Controls</p><p className="text-xs text-gray-500">Video player controls</p></div>
                    <Switch checked={form.showControls ?? false} onCheckedChange={v => set("showControls", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div><p className="text-sm font-medium">Priority Banner</p><p className="text-xs text-gray-500">Show above others</p></div>
                    <Switch checked={form.isPriority ?? false} onCheckedChange={v => set("isPriority", v)} />
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div><p className="text-sm font-medium">Active</p><p className="text-xs text-gray-500">Show on website</p></div>
                    <Switch checked={form.active ?? true} onCheckedChange={v => set("active", v)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Platform</Label>
                    <Select value={form.platform ?? "both"} onValueChange={v => set("platform", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Both</SelectItem>
                        <SelectItem value="desktop">Desktop Only</SelectItem>
                        <SelectItem value="mobile">Mobile Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Text Position</Label>
                    <Select value={form.textPosition ?? "left"} onValueChange={v => set("textPosition", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sort Order</Label>
                    <Input type="number" value={form.sortOrder ?? 0} onChange={e => set("sortOrder", parseInt(e.target.value))} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Overlay Opacity: {form.overlayOpacity ?? 50}%</Label>
                  <input type="range" min={0} max={90} step={5} value={form.overlayOpacity ?? 50}
                    onChange={e => set("overlayOpacity", parseInt(e.target.value))}
                    className="w-full accent-green-600" />
                  <p className="text-[10px] text-gray-400">Dark overlay on video for text readability</p>
                </div>
              </div>
            )}

            {/* Tab: CTA */}
            {activeTab === "cta" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Add up to 3 call-to-action buttons displayed over the video.</p>
                <CTAEditor value={form.ctaButtons ?? []} onChange={v => set("ctaButtons", v)} />
              </div>
            )}

            {/* Tab: Schedule */}
            {activeTab === "schedule" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">Optionally schedule when this video banner is visible.</p>
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
                {(create.isPending || update.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? "Save Changes" : "Create Banner")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
