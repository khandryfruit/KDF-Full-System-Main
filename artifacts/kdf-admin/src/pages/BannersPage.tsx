import { useState, useRef } from "react";
import {
  useListBanners, useCreateBanner, useUpdateBanner, useDeleteBanner,
  useListProducts, useListCategories,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Edit, Trash2, Upload, ImageOff, Loader2, AlertCircle,
  CheckCircle2, Package, LayoutGrid, Link2, ChevronDown, Search, Video, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/* ── Banner Image Uploader ──────────────────────────── */
function BannerImageUploader({
  value,
  onChange,
  label,
  recommendedW,
  recommendedH,
  aspectRatio,
  optional,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  recommendedW: number;
  recommendedH: number;
  aspectRatio: string;
  optional?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [sizeWarning, setSizeWarning] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploadError("");
    setSizeWarning("");
    setUploadSuccess(false);

    await new Promise<void>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        if (img.width < recommendedW * 0.8 || img.height < recommendedH * 0.8) {
          setSizeWarning(
            `Image is ${img.width}×${img.height}px. Recommended: ${recommendedW}×${recommendedH}px for best quality.`
          );
        }
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/uploads/image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`,
        },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { objectPath } = await res.json();

      onChange(objectPath);
      setUploadSuccess(true);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">
        {label}{" "}
        {optional && <span className="text-muted-foreground font-normal text-xs">(optional)</span>}
        <span className="text-muted-foreground font-normal text-xs ml-1">
          · Rec: {recommendedW}×{recommendedH}px · PNG, JPG, WebP
        </span>
      </Label>

      {value ? (
        <div className="relative border rounded-xl overflow-hidden bg-muted" style={{ aspectRatio }}>
          <img src={value} alt="Banner preview" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => { onChange(""); setUploadSuccess(false); }}
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {!uploading && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full hover:bg-black/80 transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-3 h-3" /> Replace
            </button>
          )}
        </div>
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-muted-foreground/25 rounded-xl flex flex-col items-center justify-center gap-2 p-8 cursor-pointer hover:border-green-500/50 hover:bg-green-50/30 transition-all"
          style={{ aspectRatio }}
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/50" />
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Upload className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">Click to upload {label.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground/60">PNG, JPG, WebP · Max 10MB · Rec {recommendedW}×{recommendedH}px</p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {uploadError && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {uploadError}
        </div>
      )}
      {sizeWarning && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {sizeWarning}
        </div>
      )}
      {uploadSuccess && (
        <div className="flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle2 className="w-3.5 h-3.5" /> Image uploaded successfully
        </div>
      )}
    </div>
  );
}

/* ── Banner Video Uploader ──────────────────────────── */
function BannerVideoUploader({
  label, value, onChange,
}: { label: string; value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(""); setSuccess(false);
    if (file.size > 100 * 1024 * 1024) { setError("Video must be under 100MB"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/uploads/video", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const { objectPath } = await res.json();
      onChange(objectPath);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {value ? (
        <div className="relative rounded-xl overflow-hidden border bg-black" style={{ aspectRatio: "16/5" }}>
          <video src={value.startsWith("http") ? value : `/api/storage/objects/${value}`} className="w-full h-full object-cover opacity-80" muted loop autoPlay playsInline />
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="bg-white/90 text-xs px-3 py-1.5 rounded-full font-semibold hover:bg-white transition flex items-center gap-1.5">
              <Upload className="w-3 h-3" /> Replace
            </button>
            <button type="button" onClick={() => { onChange(""); setSuccess(false); }}
              className="bg-red-500/90 text-white text-xs px-3 py-1.5 rounded-full font-semibold hover:bg-red-500 transition flex items-center gap-1.5">
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
          <div className="absolute bottom-2 left-3 text-white/70 text-[10px] flex items-center gap-1">
            <Video className="w-3 h-3" /> Video set
          </div>
        </div>
      ) : (
        <div onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-muted-foreground/20 rounded-xl flex flex-col items-center justify-center gap-2 p-6 cursor-pointer hover:border-green-500/50 hover:bg-green-50/30 transition-all"
          style={{ aspectRatio: "16/5" }}>
          {uploading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" /> : (
            <>
              <Video className="w-6 h-6 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Click to upload {label.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground/60">MP4, WebM · Max 100MB</p>
            </>
          )}
        </div>
      )}
      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
      {success && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Video uploaded</p>}
    </div>
  );
}

/* ── Target Type Selector ───────────────────────────── */
type TargetType = "product" | "category" | "page" | "";

const TARGET_OPTIONS: { value: TargetType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: "product",
    label: "Product",
    icon: <Package className="w-4 h-4" />,
    description: "Link to a specific product page",
  },
  {
    value: "category",
    label: "Category",
    icon: <LayoutGrid className="w-4 h-4" />,
    description: "Open a category listing",
  },
  {
    value: "page",
    label: "Custom Page",
    icon: <Link2 className="w-4 h-4" />,
    description: "Any URL path (e.g. /products)",
  },
];

function TargetTypeSelector({
  value,
  onChange,
}: {
  value: TargetType;
  onChange: (v: TargetType) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Banner Target</Label>
      <div className="grid grid-cols-3 gap-2">
        {TARGET_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? "" : opt.value)}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
              value === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 text-muted-foreground"
            }`}
          >
            {opt.icon}
            <span className="text-xs font-semibold">{opt.label}</span>
          </button>
        ))}
      </div>
      {value && (
        <p className="text-xs text-muted-foreground">
          {TARGET_OPTIONS.find((o) => o.value === value)?.description}
        </p>
      )}
    </div>
  );
}

/* ── Product Search Dropdown ────────────────────────── */
function ProductSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number | null, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useListProducts({ limit: 100 });
  const products = data?.items ?? [];
  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  const selected = products.find((p) => p.id === value);

  return (
    <div className="space-y-1.5 relative">
      <Label>Select Product *</Label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-10 px-3 border rounded-lg text-sm flex items-center justify-between bg-background hover:bg-muted/50 transition-colors"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.name : "Choose a product…"}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No products found</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p.id, p.name); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between ${
                    value === p.id ? "bg-primary/5 text-primary font-medium" : ""
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">#{p.id}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Category Dropdown ──────────────────────────────── */
function CategorySelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number | null, name: string) => void;
}) {
  const { data: categories } = useListCategories();
  const cats = Array.isArray(categories) ? categories : [];
  const selected = cats.find((c) => c.id === value);

  return (
    <div className="space-y-1.5">
      <Label>Select Category *</Label>
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) => {
            const id = e.target.value ? parseInt(e.target.value) : null;
            const cat = cats.find((c) => c.id === id);
            onChange(id, cat?.name ?? "");
          }}
          className="w-full h-10 px-3 border rounded-lg text-sm bg-background appearance-none pr-8 cursor-pointer"
        >
          <option value="">Choose a category…</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      {selected && (
        <p className="text-xs text-muted-foreground">
          Slug: <code className="bg-muted px-1 rounded">{selected.slug}</code>
        </p>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────── */
type PlatformType = "mobile" | "website" | "both";

const PLATFORM_OPTIONS: { value: PlatformType; label: string; icon: string; description: string }[] = [
  { value: "mobile", label: "Mobile App", icon: "📱", description: "KDF NUTS mobile app only" },
  { value: "website", label: "Website", icon: "🖥️", description: "KDF Plus web store only" },
  { value: "both", label: "Both", icon: "🌐", description: "Show on all platforms" },
];

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  imageUrl: "",
  mobileImageUrl: "",
  videoUrl: "",
  mobileVideoUrl: "",
  videoAutoplay: true,
  videoMuted: true,
  videoLoop: true,
  cta: "Shop Now",
  sortOrder: 0,
  active: true,
  platform: "both" as PlatformType,
  targetType: "" as TargetType,
  targetId: null as number | null,
  targetLabel: "",
  linkUrl: "",
  countdownEndAt: "",
  startDate: "",
  endDate: "",
};

/* ── Promo Card Constants ───────────────────────────── */
const PROMO_GRADIENT_PRESETS = [
  { label: "Green (Free Delivery)", value: "from-[#166534] to-[#14532d]", preview: "linear-gradient(135deg,#166534,#14532d)" },
  { label: "Purple-Pink (Gift Packs)", value: "from-[#7c3aed] to-[#be185d]", preview: "linear-gradient(135deg,#7c3aed,#be185d)" },
  { label: "Teal-Blue (Bulk Orders)", value: "from-[#0f766e] to-[#0369a1]", preview: "linear-gradient(135deg,#0f766e,#0369a1)" },
  { label: "Orange-Red (Hot Deal)", value: "from-[#c2410c] to-[#991b1b]", preview: "linear-gradient(135deg,#c2410c,#991b1b)" },
  { label: "Navy-Indigo (Premium)", value: "from-[#1e3a5f] to-[#3730a3]", preview: "linear-gradient(135deg,#1e3a5f,#3730a3)" },
  { label: "Gold-Amber (Special)", value: "from-[#92400e] to-[#78350f]", preview: "linear-gradient(135deg,#92400e,#78350f)" },
];

const PROMO_EMPTY_FORM = {
  label: "",
  title: "",
  subtitle: "",
  cta: "Shop Now →",
  bgColor: PROMO_GRADIENT_PRESETS[0].value,
  linkUrl: "/products",
  sortOrder: 0,
  active: true,
};

const ICON_SUGGESTIONS = ["🚚", "🎁", "📦", "⚡", "🔥", "💎", "🌟", "🎉", "🎯", "🛍️", "💰", "🏷️"];

export default function BannersPage() {
  /* ── Shared state ── */
  const [activeTab, setActiveTab] = useState<"hero" | "promo">("hero");
  const { data: allBanners, isLoading } = useListBanners();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateBanner();
  const updateMutation = useUpdateBanner();
  const deleteMutation = useDeleteBanner();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/banners"] });

  /* split banners: promo = has bgColor set */
  const heroBanners = (allBanners ?? []).filter((b: any) => !b.bgColor || b.bgColor === "");
  const promoBanners = (allBanners ?? []).filter((b: any) => b.bgColor && b.bgColor !== "");

  const isBusy = createMutation.isPending || updateMutation.isPending;

  /* ── Hero Banner state ── */
  const [heroOpen, setHeroOpen] = useState(false);
  const [heroEditId, setHeroEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  function openHeroAdd() { setFormData({ ...EMPTY_FORM }); setHeroEditId(null); setHeroOpen(true); }
  function openHeroEdit(banner: any) {
    setFormData({
      title: banner.title ?? "",
      subtitle: banner.subtitle ?? "",
      imageUrl: banner.imageUrl ?? "",
      mobileImageUrl: banner.mobileImageUrl ?? "",
      videoUrl: banner.videoUrl ?? "",
      mobileVideoUrl: banner.mobileVideoUrl ?? "",
      videoAutoplay: banner.videoAutoplay ?? true,
      videoMuted: banner.videoMuted ?? true,
      videoLoop: banner.videoLoop ?? true,
      cta: banner.cta ?? "Shop Now",
      sortOrder: banner.sortOrder ?? 0,
      active: banner.active ?? true,
      platform: (banner.platform ?? "both") as PlatformType,
      targetType: (banner.targetType ?? "") as TargetType,
      targetId: banner.targetId ?? null,
      targetLabel: "",
      linkUrl: banner.linkUrl ?? "",
      countdownEndAt: banner.countdownEndAt ? new Date(banner.countdownEndAt).toISOString().slice(0, 16) : "",
      startDate: banner.startDate ? new Date(banner.startDate).toISOString().slice(0, 16) : "",
      endDate: banner.endDate ? new Date(banner.endDate).toISOString().slice(0, 16) : "",
    });
    setHeroEditId(banner.id);
    setHeroOpen(true);
  }
  function buildHeroPayload() {
    const { targetLabel: _l, ...rest } = formData;
    return {
      ...rest,
      platform: rest.platform || "both",
      targetType: rest.targetType || undefined,
      targetId: rest.targetId ?? undefined,
      linkUrl: rest.targetType === "page" ? rest.linkUrl : undefined,
      mobileImageUrl: rest.mobileImageUrl || undefined,
      videoUrl: rest.videoUrl || undefined,
      mobileVideoUrl: rest.mobileVideoUrl || undefined,
      countdownEndAt: rest.countdownEndAt ? new Date(rest.countdownEndAt).toISOString() : undefined,
      startDate: rest.startDate ? new Date(rest.startDate).toISOString() : undefined,
      endDate: rest.endDate ? new Date(rest.endDate).toISOString() : undefined,
    };
  }
  function handleHeroSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.imageUrl && !formData.videoUrl) { toast({ variant: "destructive", title: "Please upload a banner image or video" }); return; }
    if (formData.targetType === "product" && !formData.targetId) { toast({ variant: "destructive", title: "Please select a product" }); return; }
    if (formData.targetType === "category" && !formData.targetId) { toast({ variant: "destructive", title: "Please select a category" }); return; }
    const payload = buildHeroPayload();
    if (heroEditId) {
      updateMutation.mutate({ id: heroEditId, data: payload as any }, {
        onSuccess: () => { invalidate(); setHeroOpen(false); toast({ title: "Banner updated" }); },
        onError: () => toast({ variant: "destructive", title: "Failed to update banner" }),
      });
    } else {
      createMutation.mutate({ data: payload as any }, {
        onSuccess: () => { invalidate(); setHeroOpen(false); toast({ title: "Banner created" }); },
        onError: () => toast({ variant: "destructive", title: "Failed to create banner" }),
      });
    }
  }

  /* ── Promo Card state ── */
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoEditId, setPromoEditId] = useState<number | null>(null);
  const [promoForm, setPromoForm] = useState({ ...PROMO_EMPTY_FORM });

  function openPromoAdd() { setPromoForm({ ...PROMO_EMPTY_FORM }); setPromoEditId(null); setPromoOpen(true); }
  function openPromoEdit(banner: any) {
    setPromoForm({
      label: banner.label ?? "",
      title: banner.title ?? "",
      subtitle: banner.subtitle ?? "",
      cta: banner.cta ?? "Shop Now →",
      bgColor: banner.bgColor ?? PROMO_GRADIENT_PRESETS[0].value,
      linkUrl: banner.linkUrl ?? "/products",
      sortOrder: banner.sortOrder ?? 0,
      active: banner.active ?? true,
    });
    setPromoEditId(banner.id);
    setPromoOpen(true);
  }
  function handlePromoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promoForm.title) { toast({ variant: "destructive", title: "Title is required" }); return; }
    const payload = {
      title: promoForm.title,
      subtitle: promoForm.subtitle || undefined,
      label: promoForm.label || undefined,
      cta: promoForm.cta || "Shop Now →",
      bgColor: promoForm.bgColor,
      linkUrl: promoForm.linkUrl || undefined,
      sortOrder: promoForm.sortOrder,
      active: promoForm.active,
      platform: "mobile" as PlatformType,
    };
    if (promoEditId) {
      updateMutation.mutate({ id: promoEditId, data: payload as any }, {
        onSuccess: () => { invalidate(); setPromoOpen(false); toast({ title: "Promo card updated ✅" }); },
        onError: () => toast({ variant: "destructive", title: "Failed to update" }),
      });
    } else {
      createMutation.mutate({ data: payload as any }, {
        onSuccess: () => { invalidate(); setPromoOpen(false); toast({ title: "Promo card created ✅" }); },
        onError: () => toast({ variant: "destructive", title: "Failed to create" }),
      });
    }
  }

  function handleDelete(id: number, type: "hero" | "promo") {
    if (!confirm(`Delete this ${type === "promo" ? "promo card" : "banner"}?`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: "Deleted" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to delete" }),
    });
  }

  function getTargetBadge(banner: any) {
    if (banner.targetType === "product") return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50"><Package className="w-3 h-3 mr-1" />Product #{banner.targetId}</Badge>;
    if (banner.targetType === "category") return <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50"><LayoutGrid className="w-3 h-3 mr-1" />Category #{banner.targetId}</Badge>;
    if (banner.targetType === "page" && banner.linkUrl) return <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50"><Link2 className="w-3 h-3 mr-1" />{banner.linkUrl}</Badge>;
    return <span className="text-xs text-muted-foreground">No target</span>;
  }

  /* live preview gradient from bgColor class */
  function getPreviewStyle(bgColor: string) {
    const preset = PROMO_GRADIENT_PRESETS.find(p => p.value === bgColor);
    return preset ? preset.preview : "linear-gradient(135deg,#166534,#14532d)";
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Banners</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage hero banners &amp; mid-page promo cards
          </p>
        </div>
        {activeTab === "hero" ? (
          <Dialog open={heroOpen} onOpenChange={setHeroOpen}>
            <DialogTrigger asChild>
              <Button onClick={openHeroAdd}><Plus className="w-4 h-4 mr-2" /> Add Hero Banner</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{heroEditId ? "Edit Hero Banner" : "Add Hero Banner"}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">Desktop: <strong>1200×400px</strong> · Mobile: <strong>600×300px</strong></p>
              </DialogHeader>
              <form onSubmit={handleHeroSubmit} className="space-y-5 py-2">
                <BannerImageUploader value={formData.imageUrl} onChange={(url) => setFormData({ ...formData, imageUrl: url })} label="🖥️ Desktop Banner Image" recommendedW={1200} recommendedH={400} aspectRatio="3/1" />
                <BannerImageUploader value={formData.mobileImageUrl} onChange={(url) => setFormData({ ...formData, mobileImageUrl: url })} label="📱 Mobile Banner Image" recommendedW={600} recommendedH={300} aspectRatio="2/1" optional />
                <div className="h-px bg-border" />
                <div className="space-y-3">
                  <div className="flex items-center gap-2"><Video className="w-4 h-4 text-muted-foreground" /><Label className="text-sm font-semibold">🎬 Video Banner (optional)</Label></div>
                  <p className="text-xs text-muted-foreground -mt-1">Video replaces image. Supports MP4, WebM.</p>
                  <BannerVideoUploader label="Desktop Video" value={formData.videoUrl} onChange={(url) => setFormData({ ...formData, videoUrl: url })} />
                  <BannerVideoUploader label="Mobile Video (optional)" value={formData.mobileVideoUrl} onChange={(url) => setFormData({ ...formData, mobileVideoUrl: url })} />
                  {(formData.videoUrl || formData.mobileVideoUrl) && (
                    <div className="flex items-center gap-4 flex-wrap">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none"><input type="checkbox" checked={formData.videoAutoplay} onChange={e => setFormData({ ...formData, videoAutoplay: e.target.checked })} className="rounded" />Autoplay</label>
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none"><input type="checkbox" checked={formData.videoMuted} onChange={e => setFormData({ ...formData, videoMuted: e.target.checked })} className="rounded" />Muted</label>
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none"><input type="checkbox" checked={formData.videoLoop} onChange={e => setFormData({ ...formData, videoLoop: e.target.checked })} className="rounded" />Loop</label>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Title *</Label><Input required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Summer Sale — Premium Nuts" /></div>
                  <div className="space-y-1.5"><Label>Subtitle</Label><Input value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} placeholder="Up to 30% off on selected products" /></div>
                  <div className="space-y-1.5"><Label>CTA Button Text</Label><Input value={formData.cta} onChange={(e) => setFormData({ ...formData, cta: e.target.value })} placeholder="Shop Now" /></div>
                </div>
                <div className="h-px bg-border" />
                <TargetTypeSelector value={formData.targetType} onChange={(v) => setFormData({ ...formData, targetType: v, targetId: null, targetLabel: "", linkUrl: "" })} />
                {formData.targetType === "product" && <ProductSelector value={formData.targetId} onChange={(id, name) => setFormData({ ...formData, targetId: id, targetLabel: name })} />}
                {formData.targetType === "category" && <CategorySelector value={formData.targetId} onChange={(id, name) => setFormData({ ...formData, targetId: id, targetLabel: name })} />}
                {formData.targetType === "page" && (
                  <div className="space-y-1.5">
                    <Label>URL Path *</Label>
                    <Input required={formData.targetType === "page"} value={formData.linkUrl} onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })} placeholder="/products?category=cashews" />
                    <p className="text-xs text-muted-foreground">Enter a relative path starting with /</p>
                  </div>
                )}
                <div className="h-px bg-border" />
                <div className="space-y-2">
                  <Label>Display Platform</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {PLATFORM_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => setFormData({ ...formData, platform: opt.value })}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${formData.platform === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/50 text-muted-foreground"}`}>
                        <span className="text-lg leading-none">{opt.icon}</span>
                        <span className="text-xs font-semibold">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={formData.sortOrder} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} /><p className="text-xs text-muted-foreground">Lower = shown first</p></div>
                  <div className="flex items-center gap-3 pt-6"><Switch checked={formData.active} onCheckedChange={(c) => setFormData({ ...formData, active: c })} /><div><Label>Active</Label><p className="text-xs text-muted-foreground">Show on storefront</p></div></div>
                </div>
                <div className="h-px bg-border" />
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">⏱️ Countdown &amp; Schedule (Optional)</Label>
                  <div className="space-y-1.5"><Label className="text-xs">Countdown End Date &amp; Time</Label><Input type="datetime-local" value={formData.countdownEndAt} onChange={(e) => setFormData({ ...formData, countdownEndAt: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Show From</Label><Input type="datetime-local" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Hide After</Label><Input type="datetime-local" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} /></div>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11" disabled={isBusy}>
                  {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {heroEditId ? "Update Banner" : "Create Banner"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
            <DialogTrigger asChild>
              <Button onClick={openPromoAdd} className="bg-violet-600 hover:bg-violet-700 text-white"><Plus className="w-4 h-4 mr-2" /> Add Promo Card</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{promoEditId ? "Edit Promo Card" : "Add Promo Card"}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">Mid-page animated cards shown between product sections on the mobile app</p>
              </DialogHeader>
              <form onSubmit={handlePromoSubmit} className="space-y-5 py-2">

                {/* Live Preview */}
                <div className="rounded-2xl overflow-hidden h-28 relative flex items-center px-5 gap-4 shadow-lg" style={{ background: getPreviewStyle(promoForm.bgColor) }}>
                  <div className="text-4xl leading-none select-none">
                    {promoForm.label?.match(/^\p{Emoji}/u)?.[0] ?? "🚀"}
                  </div>
                  <div className="flex-1 min-w-0">
                    {promoForm.label && <div className="text-white/80 text-xs font-bold uppercase tracking-widest mb-0.5 truncate">{promoForm.label}</div>}
                    <div className="text-white text-lg font-black leading-tight truncate">{promoForm.title || "Your Title Here"}</div>
                    {promoForm.subtitle && <div className="text-white/70 text-xs mt-0.5 truncate">{promoForm.subtitle}</div>}
                  </div>
                  <div className="bg-white/20 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0">{promoForm.cta || "Shop Now →"}</div>
                </div>
                <p className="text-xs text-muted-foreground text-center -mt-3">↑ Live preview</p>

                <div className="h-px bg-border" />

                {/* Label & Icon */}
                <div className="space-y-1.5">
                  <Label>Label Text <span className="text-muted-foreground font-normal text-xs">(shown above title — include emoji at start)</span></Label>
                  <Input value={promoForm.label} onChange={(e) => setPromoForm({ ...promoForm, label: e.target.value })} placeholder="🚚 FREE DELIVERY" />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ICON_SUGGESTIONS.map(icon => (
                      <button key={icon} type="button"
                        onClick={() => {
                          const text = promoForm.label.replace(/^\p{Emoji}\s*/u, "");
                          setPromoForm({ ...promoForm, label: `${icon} ${text}` });
                        }}
                        className="text-lg leading-none w-8 h-8 rounded-lg border hover:bg-muted transition-colors flex items-center justify-center"
                      >{icon}</button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input required value={promoForm.title} onChange={(e) => setPromoForm({ ...promoForm, title: e.target.value })} placeholder="Free Delivery on All Orders" />
                </div>

                {/* Subtitle */}
                <div className="space-y-1.5">
                  <Label>Subtitle <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Input value={promoForm.subtitle} onChange={(e) => setPromoForm({ ...promoForm, subtitle: e.target.value })} placeholder="Across Pakistan · 60–72 hrs" />
                </div>

                {/* CTA */}
                <div className="space-y-1.5">
                  <Label>Button Text</Label>
                  <Input value={promoForm.cta} onChange={(e) => setPromoForm({ ...promoForm, cta: e.target.value })} placeholder="Shop Now →" />
                </div>

                <div className="h-px bg-border" />

                {/* Gradient */}
                <div className="space-y-2">
                  <Label>Card Color</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {PROMO_GRADIENT_PRESETS.map((preset) => (
                      <button key={preset.value} type="button"
                        onClick={() => setPromoForm({ ...promoForm, bgColor: preset.value })}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${promoForm.bgColor === preset.value ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-muted-foreground/40"}`}
                      >
                        <div className="w-full h-8 rounded-lg" style={{ background: preset.preview }} />
                        <span className="text-[10px] font-medium text-center leading-tight text-muted-foreground">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Link */}
                <div className="space-y-1.5">
                  <Label>Link URL <span className="text-muted-foreground font-normal text-xs">(where to go on tap)</span></Label>
                  <Input value={promoForm.linkUrl} onChange={(e) => setPromoForm({ ...promoForm, linkUrl: e.target.value })} placeholder="/products" />
                </div>

                {/* Sort & Active */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Position <span className="text-muted-foreground font-normal text-xs">(0 = first)</span></Label>
                    <Input type="number" min={0} max={10} value={promoForm.sortOrder} onChange={(e) => setPromoForm({ ...promoForm, sortOrder: parseInt(e.target.value) || 0 })} />
                    <p className="text-xs text-muted-foreground">0=1st card, 1=2nd card, 2=3rd card</p>
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <Switch checked={promoForm.active} onCheckedChange={(c) => setPromoForm({ ...promoForm, active: c })} />
                    <div><Label>Active</Label><p className="text-xs text-muted-foreground">Show on app</p></div>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11 bg-violet-600 hover:bg-violet-700" disabled={isBusy}>
                  {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {promoEditId ? "Update Promo Card" : "Create Promo Card"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit border">
        <button
          onClick={() => setActiveTab("hero")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "hero" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          🖼️ Hero Banners
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">{heroBanners.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab("promo")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "promo" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          ✨ Promo Cards
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 bg-violet-50 text-violet-600 border-violet-200">{promoBanners.length}</Badge>
        </button>
      </div>

      {/* ── Hero Banners Tab ── */}
      {activeTab === "hero" && (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">Order</TableHead>
                <TableHead className="w-40">Preview</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(3)].map((_, i) => (
                    <TableRow key={i}>{[...Array(7)].map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
                  ))
                : heroBanners.length
                ? heroBanners.map((banner: any) => (
                    <TableRow key={banner.id} className="group">
                      <TableCell className="font-mono text-sm text-muted-foreground">{banner.sortOrder}</TableCell>
                      <TableCell>
                        {banner.imageUrl ? (
                          <div className="w-36 h-12 bg-muted rounded-lg overflow-hidden border"><img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" /></div>
                        ) : (
                          <div className="w-36 h-12 rounded-lg border flex items-center justify-center bg-muted"><ImageOff className="w-4 h-4 text-muted-foreground/40" /></div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-sm">{banner.title}</div>
                        {banner.subtitle && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{banner.subtitle}</div>}
                        {banner.cta && <div className="text-xs text-muted-foreground mt-0.5">CTA: <span className="font-medium text-foreground">"{banner.cta}"</span></div>}
                      </TableCell>
                      <TableCell>{getTargetBadge(banner)}</TableCell>
                      <TableCell>
                        {banner.platform === "mobile" && <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">📱 Mobile</Badge>}
                        {banner.platform === "website" && <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50">🖥️ Website</Badge>}
                        {(!banner.platform || banner.platform === "both") && <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">🌐 Both</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={banner.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}>
                          {banner.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openHeroEdit(banner)}><Edit className="w-4 h-4 text-muted-foreground" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(banner.id, "hero")}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-muted-foreground text-sm">
                      <div className="flex flex-col items-center gap-2"><ImageOff className="w-8 h-8 opacity-20" />No hero banners yet. Click "Add Hero Banner" to create one.</div>
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Promo Cards Tab ── */}
      {activeTab === "promo" && (
        <div className="space-y-4">
          <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm text-violet-800 flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5">✨</span>
            <div>
              <strong>Promo Cards</strong> appear between product sections on the mobile homepage (FREE DELIVERY, GIFT PACKS, BULK ORDERS position).
              They use gradient backgrounds — no image needed. Cards with <strong>Position 0</strong> appear first, <strong>1</strong> second, <strong>2</strong> third.
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
            </div>
          ) : promoBanners.length === 0 ? (
            <div className="border-2 border-dashed border-violet-200 rounded-2xl h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <span className="text-4xl">✨</span>
              <p className="text-sm font-medium">No promo cards yet</p>
              <p className="text-xs">Click "Add Promo Card" to create your first one</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {promoBanners
                .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                .map((banner: any) => (
                <div key={banner.id} className="relative rounded-2xl overflow-hidden shadow-md group">
                  {/* Card Preview */}
                  <div className="h-28 flex items-center px-5 gap-4 relative" style={{ background: getPreviewStyle(banner.bgColor) }}>
                    <div className="text-4xl leading-none select-none">
                      {banner.label?.match(/^\p{Emoji}/u)?.[0] ?? "🚀"}
                    </div>
                    <div className="flex-1 min-w-0">
                      {banner.label && <div className="text-white/80 text-xs font-bold uppercase tracking-widest mb-0.5 truncate">{banner.label}</div>}
                      <div className="text-white text-base font-black leading-tight truncate">{banner.title}</div>
                      {banner.subtitle && <div className="text-white/70 text-xs mt-0.5 truncate">{banner.subtitle}</div>}
                    </div>
                    <div className="bg-white/20 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0">{banner.cta ?? "Shop Now →"}</div>
                    {/* Hover actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openPromoEdit(banner)} className="h-8 text-xs gap-1.5"><Edit className="w-3.5 h-3.5" /> Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(banner.id, "promo")} className="h-8 text-xs gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                    </div>
                  </div>
                  {/* Footer */}
                  <div className="bg-card border border-t-0 rounded-b-2xl px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">pos {banner.sortOrder}</span>
                      {banner.linkUrl && <span className="truncate max-w-[120px]">{banner.linkUrl}</span>}
                    </div>
                    <Badge variant="outline" className={banner.active ? "bg-green-50 text-green-700 border-green-200 text-[10px]" : "bg-gray-50 text-gray-500 border-gray-200 text-[10px]"}>
                      {banner.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
