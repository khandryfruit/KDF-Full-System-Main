import { useState, useRef } from "react";
import {
  useListBanners, useCreateBanner, useUpdateBanner, useDeleteBanner,
  useListProducts, useListCategories,
  getListBannersQueryKey,
  normalizeListCache,
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
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiPublicUrl, getApiBase } from "@/lib/apiBase";
import { Link } from "wouter";

function storagePublicUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/objects/")) return apiPublicUrl(`/api/storage${path}`);
  const base = getApiBase().replace(/\/+$/, "");
  if (!base) return path.startsWith("/") ? path : `/${path}`;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function hasHeroStyleMedia(b: {
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  videoUrl?: string | null;
  mobileVideoUrl?: string | null;
}) {
  return !!(b.imageUrl || b.mobileImageUrl || b.videoUrl || b.mobileVideoUrl);
}

/** Gradient-only mid-page cards (no full hero image/video). */
function isPromoCard(b: { bgColor?: string | null; imageUrl?: string | null; mobileImageUrl?: string | null; videoUrl?: string | null; mobileVideoUrl?: string | null }) {
  if (hasHeroStyleMedia(b)) return false;
  const bg = typeof b?.bgColor === "string" ? b.bgColor.trim() : "";
  if (!bg || !bg.startsWith("from-")) return false;
  return true;
}

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
      const res = await fetch(apiPublicUrl("/api/storage/uploads/image"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`,
        },
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string; detail?: string };
        throw new Error(errData.detail ?? errData.error ?? `Upload failed (${res.status})`);
      }
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
          <img src={storagePublicUrl(value)} alt="Banner preview" className="w-full h-full object-cover" />
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
      const res = await fetch(apiPublicUrl("/api/storage/uploads/video"), {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; detail?: string };
        throw new Error(err.detail ?? err.error ?? "Upload failed");
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

function ProductMultiSelector({
  value,
  onChange,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [search, setSearch] = useState("");
  const { data } = useListProducts({ limit: 100 });
  const products = data?.items ?? [];
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const selected = products.filter((p) => value.includes(p.id));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <Label>Featured Products Under Timer</Label>
      <div className="rounded-xl border bg-background">
        <div className="p-2 border-b flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-2 border-b bg-muted/30">
            {selected.map((p) => (
              <Badge key={p.id} variant="secondary" className="gap-1">
                {p.name}
                <button type="button" onClick={() => toggle(p.id)} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
              </Badge>
            ))}
          </div>
        )}
        <div className="max-h-48 overflow-y-auto">
          {filtered.slice(0, 50).map((p) => (
            <button key={p.id} type="button" onClick={() => toggle(p.id)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-muted/50 flex items-center justify-between ${value.includes(p.id) ? "bg-primary/5 text-primary font-medium" : ""}`}>
              <span className="line-clamp-1">{p.name}</span>
              <span className="text-xs text-muted-foreground">#{p.id}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Leave empty to auto-show discount, featured, or best-selling products based on display mode.</p>
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

function CategoryMultiSelector({
  value,
  onChange,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const { data: categories } = useListCategories();
  const cats = Array.isArray(categories) ? categories : [];
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-2">
      <Label>Categories / Collections Under Timer</Label>
      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-xl border p-2">
        {cats.map((c) => (
          <button key={c.id} type="button" onClick={() => toggle(c.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${value.includes(c.id) ? "border-primary bg-primary/5 text-primary font-medium" : "hover:bg-muted/50"}`}>
            {c.name}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Used when display mode is Categories. Leave empty to show top categories.</p>
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
  label: "",
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
  aiMode: false,
  aiAutoUpdate: false,
  aiCampaign: "healthy_lifestyle",
  aiPrompt: "",
  aiRefreshCadence: "daily",
  approvedPromotionText: "",
  healthBenefitText: "",
  urgencyText: "",
  relatedKeywords: "",
  relatedProductIds: [] as number[],
  bannerStyle: "premium",
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

const HEADER_BANNER_EMPTY = {
  title: "",
  imageUrl: "",
  linkUrl: "/products",
  sortOrder: 0,
  active: true,
  platform: "both" as PlatformType,
};

const COUNTDOWN_EMPTY_FORM = {
  title: "Limited Time Offer",
  subtitle: "Premium nuts and dry fruits at special prices",
  label: "Flash Deal",
  imageUrl: "",
  mobileImageUrl: "",
  cta: "Shop Now",
  linkUrl: "/products",
  bgColor: "#0D2B00",
  textColor: "white",
  buttonBgColor: "#ffffff",
  buttonTextColor: "#0D2B00",
  countdownEndAt: "",
  startDate: "",
  endDate: "",
  offerProductIds: [] as number[],
  offerCategoryIds: [] as number[],
  offerMode: "discount_products",
  offerDisplayCount: 8,
  offerSort: "featured",
  showTimer: true,
  sortOrder: 0,
  active: true,
  platform: "both" as PlatformType,
};

const ICON_SUGGESTIONS = ["🚚", "🎁", "📦", "⚡", "🔥", "💎", "🌟", "🎉", "🎯", "🛍️", "💰", "🏷️"];
const AI_CAMPAIGNS = [
  ["ramadan", "Ramadan"],
  ["eid", "Eid"],
  ["winter", "Winter"],
  ["summer", "Summer"],
  ["healthy_lifestyle", "Healthy Lifestyle"],
  ["back_to_school", "Back to School"],
  ["gift_season", "Gift Season"],
  ["weekend_deals", "Weekend Deals"],
  ["bulk_buying", "Bulk Buying"],
] as const;

export default function BannersPage() {
  /* ── Shared state ── */
  const [activeTab, setActiveTab] = useState<"hero" | "countdown" | "promo" | "header">("hero");
  const { data: allBanners, isLoading } = useListBanners();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateBanner();
  const updateMutation = useUpdateBanner();
  const deleteMutation = useDeleteBanner();
  const listKey = getListBannersQueryKey();
  const invalidateBanners = () =>
    queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });

  const bannerRows: any[] = normalizeListCache(allBanners);

  const headerBanners = bannerRows.filter((b: any) => b.placement === "header");
  const countdownBanners = bannerRows.filter((b: any) => b.placement === "countdown_deal");
  /* Image/video rows always show under Hero (never as gradient promo cards). */
  const promoBanners = bannerRows.filter((b: any) => {
    if (b.placement === "header") return false;
    if (hasHeroStyleMedia(b)) return false;
    return b.placement === "promo" || isPromoCard(b);
  });
  const heroBanners = bannerRows.filter((b: any) => {
    if (b.placement === "header") return false;
    if (b.placement === "countdown_deal") return false;
    if (hasHeroStyleMedia(b)) return true;
    if (b.placement === "hero") return true;
    return b.placement !== "promo" && !isPromoCard(b);
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  /* ── Hero Banner state ── */
  const [heroOpen, setHeroOpen] = useState(false);
  const [heroEditId, setHeroEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [aiGenerating, setAiGenerating] = useState(false);

  function openHeroAdd() { setFormData({ ...EMPTY_FORM }); setHeroEditId(null); setHeroOpen(true); }
  function openAiHeroAdd() {
    setFormData({
      ...EMPTY_FORM,
      aiMode: true,
      aiAutoUpdate: true,
      aiCampaign: "healthy_lifestyle",
      title: "AI Smart Seasonal Picks",
      subtitle: "Generate safe seasonal homepage copy and matched products.",
      label: "AI Smart Pick",
      cta: "Shop Now",
      linkUrl: "/products",
      targetType: "page",
      platform: "website",
    });
    setHeroEditId(null);
    setHeroOpen(true);
  }
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
      label: banner.label ?? "",
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
      aiMode: banner.aiMode ?? false,
      aiAutoUpdate: banner.aiAutoUpdate ?? false,
      aiCampaign: banner.aiCampaign ?? "healthy_lifestyle",
      aiPrompt: banner.aiPrompt ?? "",
      aiRefreshCadence: banner.aiRefreshCadence ?? "daily",
      approvedPromotionText: banner.approvedPromotionText ?? "",
      healthBenefitText: banner.healthBenefitText ?? "",
      urgencyText: banner.urgencyText ?? "",
      relatedKeywords: Array.isArray(banner.relatedKeywords) ? banner.relatedKeywords.join(", ") : "",
      relatedProductIds: Array.isArray(banner.relatedProductIds) ? banner.relatedProductIds.map(Number) : [],
      bannerStyle: banner.bannerStyle ?? "premium",
    });
    setHeroEditId(banner.id);
    setHeroOpen(true);
  }
  function buildHeroPayload() {
    const { targetLabel: _l, ...rest } = formData;
    return {
      ...rest,
      placement: "hero" as const,
      bgColor: "",
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
      relatedKeywords: rest.relatedKeywords ? String(rest.relatedKeywords).split(",").map((v) => v.trim()).filter(Boolean) : [],
    };
  }
  function handleHeroSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.aiMode && !formData.imageUrl && !formData.videoUrl) {
      toast({ variant: "destructive", title: "Please upload a banner image or video" });
      return;
    }
    if (formData.targetType === "product" && !formData.targetId) {
      toast({ variant: "destructive", title: "Please select a product" });
      return;
    }
    if (formData.targetType === "category" && !formData.targetId) {
      toast({ variant: "destructive", title: "Please select a category" });
      return;
    }
    const payload = buildHeroPayload();
    if (import.meta.env.DEV) {
      // Temporary: trace full create flow in devtools
      console.debug("[BannersPage] hero save payload", payload);
    }
    if (heroEditId) {
      toast({ title: "Updating banner…" });
      updateMutation.mutate(
        { id: heroEditId, data: payload as any },
        {
          onSuccess: (updated) => {
            queryClient.setQueryData(listKey, (old: unknown) => {
              const list = normalizeListCache(old);
              return list.map((row: any) => (row.id === updated.id ? updated : row));
            });
            void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
            setHeroOpen(false);
            toast({ title: "Banner updated", description: "Changes are saved." });
          },
          onError: (err: unknown) => {
            console.error("[BannersPage] update banner failed", err);
            toast({
              variant: "destructive",
              title: "Failed to update banner",
              description: err instanceof Error ? err.message : "Request failed",
            });
          },
        },
      );
    } else {
      toast({ title: "Creating banner…", description: "Saving to database." });
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: (created) => {
            if (import.meta.env.DEV) {
              console.debug("[BannersPage] banner created", created);
            }
            queryClient.setQueryData(listKey, (old: unknown) => {
              const list = normalizeListCache(old);
              return [...list, created].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            });
            void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
            setHeroOpen(false);
            toast({ title: "Banner created", description: "It appears in the list below." });
          },
          onError: (err: unknown) => {
            console.error("[BannersPage] create banner failed", err);
            toast({
              variant: "destructive",
              title: "Failed to create banner",
              description: err instanceof Error ? err.message : "Check network tab for POST /api/banners",
            });
          },
        },
      );
    }
  }

  async function generateSmartHeroCopy() {
    setAiGenerating(true);
    try {
      const body = buildHeroPayload();
      const url = heroEditId ? `/api/admin/banners/${heroEditId}/ai-generate` : "/api/admin/banners/ai-preview";
      const res = await fetch(apiPublicUrl(url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}`,
        },
        body: JSON.stringify({ ...body, aiMode: true, aiAutoUpdate: formData.aiAutoUpdate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI generation failed");
      const generated = data.banner ?? data;
      setFormData((prev) => ({
        ...prev,
        aiMode: true,
        title: generated.title ?? prev.title,
        subtitle: generated.subtitle ?? prev.subtitle,
        label: generated.label ?? prev.label,
        cta: generated.cta ?? prev.cta,
        healthBenefitText: generated.healthBenefitText ?? prev.healthBenefitText,
        urgencyText: generated.urgencyText ?? prev.urgencyText,
        relatedKeywords: Array.isArray(generated.relatedKeywords) ? generated.relatedKeywords.join(", ") : prev.relatedKeywords,
        relatedProductIds: Array.isArray(generated.relatedProductIds) ? generated.relatedProductIds.map(Number) : prev.relatedProductIds,
        targetType: generated.targetType ?? prev.targetType,
        targetId: generated.targetId ?? prev.targetId,
      }));
      invalidateBanners();
      toast({ title: "AI banner generated", description: generated.safetyNotes ?? generated.aiSafetyNotes ?? "Strict offer rules applied." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI generation failed", description: e.message });
    } finally {
      setAiGenerating(false);
    }
  }

  /* ── Promo Card state ── */
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoEditId, setPromoEditId] = useState<number | null>(null);
  const [promoForm, setPromoForm] = useState({ ...PROMO_EMPTY_FORM });
  const [headerOpen, setHeaderOpen] = useState(false);
  const [headerEditId, setHeaderEditId] = useState<number | null>(null);
  const [headerForm, setHeaderForm] = useState({ ...HEADER_BANNER_EMPTY });
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [countdownEditId, setCountdownEditId] = useState<number | null>(null);
  const [countdownForm, setCountdownForm] = useState({ ...COUNTDOWN_EMPTY_FORM });

  function openCountdownAdd() {
    setCountdownForm({ ...COUNTDOWN_EMPTY_FORM });
    setCountdownEditId(null);
    setCountdownOpen(true);
  }
  function openCountdownEdit(banner: any) {
    setCountdownForm({
      ...COUNTDOWN_EMPTY_FORM,
      title: banner.title ?? COUNTDOWN_EMPTY_FORM.title,
      subtitle: banner.subtitle ?? "",
      label: banner.label ?? "Flash Deal",
      imageUrl: banner.imageUrl ?? "",
      mobileImageUrl: banner.mobileImageUrl ?? "",
      cta: banner.cta ?? "Shop Now",
      linkUrl: banner.linkUrl ?? "/products",
      bgColor: banner.bgColor ?? "#0D2B00",
      textColor: banner.textColor ?? "white",
      buttonBgColor: banner.buttonBgColor ?? "#ffffff",
      buttonTextColor: banner.buttonTextColor ?? "#0D2B00",
      countdownEndAt: banner.countdownEndAt ? new Date(banner.countdownEndAt).toISOString().slice(0, 16) : "",
      startDate: banner.startDate ? new Date(banner.startDate).toISOString().slice(0, 16) : "",
      endDate: banner.endDate ? new Date(banner.endDate).toISOString().slice(0, 16) : "",
      offerProductIds: Array.isArray(banner.offerProductIds) ? banner.offerProductIds.map(Number) : [],
      offerCategoryIds: Array.isArray(banner.offerCategoryIds) ? banner.offerCategoryIds.map(Number) : [],
      offerMode: banner.offerMode ?? "discount_products",
      offerDisplayCount: banner.offerDisplayCount ?? 8,
      offerSort: banner.offerSort ?? "featured",
      showTimer: banner.showTimer ?? true,
      sortOrder: banner.sortOrder ?? 0,
      active: banner.active ?? true,
      platform: (banner.platform ?? "both") as PlatformType,
    });
    setCountdownEditId(banner.id);
    setCountdownOpen(true);
  }
  function handleCountdownSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!countdownForm.title.trim()) {
      toast({ variant: "destructive", title: "Title is required" });
      return;
    }
    const payload = {
      ...countdownForm,
      placement: "countdown_deal" as const,
      title: countdownForm.title.trim(),
      subtitle: countdownForm.subtitle || undefined,
      label: countdownForm.label || undefined,
      imageUrl: countdownForm.imageUrl || undefined,
      mobileImageUrl: countdownForm.mobileImageUrl || undefined,
      linkUrl: countdownForm.linkUrl || "/products",
      countdownEndAt: countdownForm.countdownEndAt ? new Date(countdownForm.countdownEndAt).toISOString() : undefined,
      startDate: countdownForm.startDate ? new Date(countdownForm.startDate).toISOString() : undefined,
      endDate: countdownForm.endDate ? new Date(countdownForm.endDate).toISOString() : undefined,
      offerDisplayCount: Math.max(1, Math.min(12, Number(countdownForm.offerDisplayCount) || 8)),
    };
    const onSuccess = (saved: any) => {
      queryClient.setQueryData(listKey, (old: unknown) => {
        const list = normalizeListCache(old);
        const exists = list.some((row: any) => row.id === saved.id);
        return (exists ? list.map((row: any) => (row.id === saved.id ? saved : row)) : [...list, saved])
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      });
      void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
      setCountdownOpen(false);
      toast({ title: countdownEditId ? "Countdown banner updated" : "Countdown banner created", description: "Homepage deal section is saved." });
    };
    const onError = (err: unknown) => toast({ variant: "destructive", title: "Failed to save countdown banner", description: err instanceof Error ? err.message : "Request failed" });
    if (countdownEditId) updateMutation.mutate({ id: countdownEditId, data: payload as any }, { onSuccess, onError });
    else createMutation.mutate({ data: payload as any }, { onSuccess, onError });
  }

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
      placement: "promo" as const,
    };
    if (promoEditId) {
      toast({ title: "Updating promo card…" });
      updateMutation.mutate({ id: promoEditId, data: payload as any }, {
        onSuccess: (updated) => {
          queryClient.setQueryData(listKey, (old: unknown) => {
            const list = normalizeListCache(old);
            return list.map((row: any) => (row.id === updated.id ? updated : row));
          });
          void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
          setPromoOpen(false);
          toast({ title: "Promo card updated", description: "Saved." });
        },
        onError: (err: unknown) => {
          console.error("[BannersPage] update promo failed", err);
          toast({
            variant: "destructive",
            title: "Failed to update",
            description: err instanceof Error ? err.message : "Request failed",
          });
        },
      });
    } else {
      toast({ title: "Creating promo card…" });
      createMutation.mutate({ data: payload as any }, {
        onSuccess: (created) => {
          queryClient.setQueryData(listKey, (old: unknown) => {
            const list = normalizeListCache(old);
            return [...list, created].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          });
          void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
          setPromoOpen(false);
          toast({ title: "Promo card created", description: "Saved." });
        },
        onError: (err: unknown) => {
          console.error("[BannersPage] create promo failed", err);
          toast({
            variant: "destructive",
            title: "Failed to create",
            description: err instanceof Error ? err.message : "Request failed",
          });
        },
      });
    }
  }

  /* ── Header strip (under main nav on website) ── */
  function openHeaderAdd() {
    setHeaderForm({ ...HEADER_BANNER_EMPTY });
    setHeaderEditId(null);
    setHeaderOpen(true);
  }
  function openHeaderEdit(banner: any) {
    setHeaderForm({
      title: banner.title ?? "",
      imageUrl: banner.imageUrl ?? "",
      linkUrl: banner.linkUrl ?? "/products",
      sortOrder: banner.sortOrder ?? 0,
      active: banner.active ?? true,
      platform: (banner.platform ?? "both") as PlatformType,
    });
    setHeaderEditId(banner.id);
    setHeaderOpen(true);
  }
  function buildHeaderPayload() {
    return {
      title: headerForm.title?.trim() || "Header offer",
      imageUrl: headerForm.imageUrl,
      linkUrl: headerForm.linkUrl || undefined,
      platform: headerForm.platform || "both",
      placement: "header" as const,
      bgColor: "",
      sortOrder: headerForm.sortOrder,
      active: headerForm.active,
    };
  }
  function handleHeaderSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!headerForm.imageUrl?.trim()) {
      toast({ variant: "destructive", title: "Please upload a header banner image" });
      return;
    }
    const payload = buildHeaderPayload();
    if (headerEditId) {
      toast({ title: "Updating header banner…" });
      updateMutation.mutate(
        { id: headerEditId, data: payload as any },
        {
          onSuccess: (updated) => {
            queryClient.setQueryData(listKey, (old: unknown) => {
              const list = normalizeListCache(old);
              return list.map((row: any) => (row.id === updated.id ? updated : row));
            });
            void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
            setHeaderOpen(false);
            toast({ title: "Header banner updated" });
          },
          onError: (err: unknown) => {
            console.error("[BannersPage] update header failed", err);
            toast({
              variant: "destructive",
              title: "Failed to update",
              description: err instanceof Error ? err.message : "Request failed",
            });
          },
        },
      );
    } else {
      toast({ title: "Creating header banner…" });
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: (created) => {
            queryClient.setQueryData(listKey, (old: unknown) => {
              const list = normalizeListCache(old);
              return [...list, created].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            });
            void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
            setHeaderOpen(false);
            toast({ title: "Header banner created" });
          },
          onError: (err: unknown) => {
            console.error("[BannersPage] create header failed", err);
            toast({
              variant: "destructive",
              title: "Failed to create",
              description: err instanceof Error ? err.message : "Request failed",
            });
          },
        },
      );
    }
  }

  function handleDelete(id: number, type: "hero" | "countdown" | "promo" | "header") {
    if (!confirm(`Delete this ${type === "promo" ? "promo card" : type === "header" ? "header banner" : "banner"}?`)) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.setQueryData(listKey, (old: unknown) => {
          const list = normalizeListCache(old);
          return list.filter((row: any) => row.id !== id);
        });
        void queryClient.invalidateQueries({ queryKey: listKey, refetchType: "active" });
        toast({ title: "Deleted" });
      },
      onError: (err: unknown) => {
        console.error("[BannersPage] delete failed", err);
        toast({
          variant: "destructive",
          title: "Failed to delete",
          description: err instanceof Error ? err.message : "Request failed",
        });
      },
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
            Hero (home carousel), header strip under navigation, and promo cards — each type is saved separately.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {activeTab === "hero" && (
          <Dialog open={heroOpen} onOpenChange={setHeroOpen}>
            <DialogTrigger asChild>
              <Button onClick={openHeroAdd} variant="outline"><Plus className="w-4 h-4 mr-2" /> Add Hero Banner</Button>
            </DialogTrigger>
            <Button onClick={openAiHeroAdd} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              <Sparkles className="w-4 h-4 mr-2" /> Add AI Smart Banner
            </Button>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{heroEditId ? "Edit Hero Banner" : formData.aiMode ? "Add AI Smart Banner" : "Add Hero Banner"}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.aiMode ? "AI banners can run without an uploaded image and will generate safe seasonal copy." : <>Desktop: <strong>1200×400px</strong> · Mobile: <strong>600×300px</strong></>}
                </p>
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
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label className="flex items-center gap-2 text-sm font-bold text-emerald-900"><Sparkles className="w-4 h-4" /> AI Smart Banner</Label>
                      <p className="text-xs text-emerald-800 mt-1">AI can generate seasonal copy, match products, and refresh safely. It never invents discounts; only approved promotions can be used.</p>
                    </div>
                    <Switch checked={formData.aiMode} onCheckedChange={(c) => setFormData({ ...formData, aiMode: c })} />
                  </div>
                  {formData.aiMode && (
                    <div className="space-y-4">
                      <div className="grid md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Campaign</Label>
                          <select value={formData.aiCampaign} onChange={(e) => setFormData({ ...formData, aiCampaign: e.target.value })} className="w-full h-10 px-3 border rounded-lg bg-background text-sm">
                            {AI_CAMPAIGNS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Refresh</Label>
                          <select value={formData.aiRefreshCadence} onChange={(e) => setFormData({ ...formData, aiRefreshCadence: e.target.value })} className="w-full h-10 px-3 border rounded-lg bg-background text-sm">
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="seasonal">Seasonal</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-3 pt-6">
                          <Switch checked={formData.aiAutoUpdate} onCheckedChange={(c) => setFormData({ ...formData, aiAutoUpdate: c })} />
                          <div><Label className="text-xs">Auto update</Label><p className="text-[11px] text-muted-foreground">Scheduler refreshes copy</p></div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Approved Promotion Text</Label>
                        <Input value={formData.approvedPromotionText} onChange={(e) => setFormData({ ...formData, approvedPromotionText: e.target.value })} placeholder="Example: Free delivery above Rs.5000 (leave empty for health/seasonal copy)" />
                        <p className="text-[11px] text-muted-foreground">AI may mention only this or active approved coupons from admin. No fake offers.</p>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-1.5"><Label className="text-xs">AI Prompt / Direction</Label><Input value={formData.aiPrompt} onChange={(e) => setFormData({ ...formData, aiPrompt: e.target.value })} placeholder="Focus almonds, Eid gifts, healthy snacks..." /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Product Keywords</Label><Input value={formData.relatedKeywords} onChange={(e) => setFormData({ ...formData, relatedKeywords: e.target.value })} placeholder="almond, pistachio, gift pack" /></div>
                      </div>
                      <ProductMultiSelector value={formData.relatedProductIds} onChange={(ids) => setFormData({ ...formData, relatedProductIds: ids })} />
                      <Button type="button" variant="outline" className="w-full gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-100" onClick={generateSmartHeroCopy} disabled={aiGenerating}>
                        {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        Generate Safe AI Banner Copy
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Label</Label><Input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="Eid Gifts / Healthy Picks" /></div>
                  <div className="space-y-1.5"><Label>Title *</Label><Input required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Summer Sale — Premium Nuts" /></div>
                  <div className="space-y-1.5"><Label>Subtitle</Label><Input value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} placeholder="Up to 30% off on selected products" /></div>
                  <div className="space-y-1.5"><Label>CTA Button Text</Label><Input value={formData.cta} onChange={(e) => setFormData({ ...formData, cta: e.target.value })} placeholder="Shop Now" /></div>
                  {formData.aiMode && (
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-xs">Health Benefit Text</Label><Input value={formData.healthBenefitText} onChange={(e) => setFormData({ ...formData, healthBenefitText: e.target.value })} placeholder="Natural energy and better snacking" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">Urgency Text</Label><Input value={formData.urgencyText} onChange={(e) => setFormData({ ...formData, urgencyText: e.target.value })} placeholder="Fresh seasonal picks updated daily" /></div>
                    </div>
                  )}
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
          )}
          {activeTab === "countdown" && (
          <Dialog open={countdownOpen} onOpenChange={setCountdownOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCountdownAdd} className="bg-emerald-700 hover:bg-emerald-800 text-white"><Plus className="w-4 h-4 mr-2" /> Add Countdown Section</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{countdownEditId ? "Edit Countdown Banner" : "Add Countdown Banner"}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">Slim Shopify-style homepage offer banner with timer, CTA, products, and categories.</p>
              </DialogHeader>
              <form onSubmit={handleCountdownSubmit} className="space-y-5 py-2">
                <div className="grid md:grid-cols-2 gap-4">
                  <BannerImageUploader value={countdownForm.imageUrl} onChange={(url) => setCountdownForm({ ...countdownForm, imageUrl: url })} label="Desktop Banner Image" recommendedW={1400} recommendedH={360} aspectRatio="16/4" optional />
                  <BannerImageUploader value={countdownForm.mobileImageUrl} onChange={(url) => setCountdownForm({ ...countdownForm, mobileImageUrl: url })} label="Mobile Banner Image" recommendedW={760} recommendedH={360} aspectRatio="2/1" optional />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>Banner Title *</Label><Input required value={countdownForm.title} onChange={(e) => setCountdownForm({ ...countdownForm, title: e.target.value })} placeholder="Limited Time Offer" /></div>
                  <div className="space-y-1.5"><Label>Offer Label</Label><Input value={countdownForm.label} onChange={(e) => setCountdownForm({ ...countdownForm, label: e.target.value })} placeholder="Flash Deal" /></div>
                  <div className="space-y-1.5 md:col-span-2"><Label>Subtitle / Offer Text</Label><Input value={countdownForm.subtitle} onChange={(e) => setCountdownForm({ ...countdownForm, subtitle: e.target.value })} placeholder="Save more on premium nuts and dry fruits today" /></div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5"><Label>Button Text</Label><Input value={countdownForm.cta} onChange={(e) => setCountdownForm({ ...countdownForm, cta: e.target.value })} /></div>
                  <div className="space-y-1.5 md:col-span-2"><Label>Button Link</Label><Input value={countdownForm.linkUrl} onChange={(e) => setCountdownForm({ ...countdownForm, linkUrl: e.target.value })} placeholder="/products" /></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5"><Label>Background</Label><Input type="color" value={countdownForm.bgColor} onChange={(e) => setCountdownForm({ ...countdownForm, bgColor: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Text Color</Label><Input value={countdownForm.textColor} onChange={(e) => setCountdownForm({ ...countdownForm, textColor: e.target.value })} placeholder="white" /></div>
                  <div className="space-y-1.5"><Label>Button BG</Label><Input type="color" value={countdownForm.buttonBgColor} onChange={(e) => setCountdownForm({ ...countdownForm, buttonBgColor: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Button Text</Label><Input type="color" value={countdownForm.buttonTextColor} onChange={(e) => setCountdownForm({ ...countdownForm, buttonTextColor: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5"><Label>Countdown End</Label><Input type="datetime-local" value={countdownForm.countdownEndAt} onChange={(e) => setCountdownForm({ ...countdownForm, countdownEndAt: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Show From</Label><Input type="datetime-local" value={countdownForm.startDate} onChange={(e) => setCountdownForm({ ...countdownForm, startDate: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Hide After</Label><Input type="datetime-local" value={countdownForm.endDate} onChange={(e) => setCountdownForm({ ...countdownForm, endDate: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Content Mode</Label>
                    <select value={countdownForm.offerMode} onChange={(e) => setCountdownForm({ ...countdownForm, offerMode: e.target.value })} className="w-full h-10 px-3 border rounded-lg bg-background text-sm">
                      <option value="discount_products">Discount Products</option>
                      <option value="featured_products">Featured Products</option>
                      <option value="best_sellers">Best Sellers</option>
                      <option value="deals">Deals</option>
                      <option value="categories">Categories / Collections</option>
                    </select>
                  </div>
                  <div className="space-y-1.5"><Label>Display Count</Label><Input type="number" min={1} max={12} value={countdownForm.offerDisplayCount} onChange={(e) => setCountdownForm({ ...countdownForm, offerDisplayCount: parseInt(e.target.value) || 8 })} /></div>
                  <div className="space-y-1.5">
                    <Label>Sorting</Label>
                    <select value={countdownForm.offerSort} onChange={(e) => setCountdownForm({ ...countdownForm, offerSort: e.target.value })} className="w-full h-10 px-3 border rounded-lg bg-background text-sm">
                      <option value="featured">Featured First</option>
                      <option value="discount">Biggest Discount</option>
                      <option value="newest">Newest</option>
                      <option value="best_sellers">Best Sellers</option>
                    </select>
                  </div>
                </div>
                <ProductMultiSelector value={countdownForm.offerProductIds} onChange={(ids) => setCountdownForm({ ...countdownForm, offerProductIds: ids })} />
                <CategoryMultiSelector value={countdownForm.offerCategoryIds} onChange={(ids) => setCountdownForm({ ...countdownForm, offerCategoryIds: ids })} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5"><Label>Sort Order</Label><Input type="number" value={countdownForm.sortOrder} onChange={(e) => setCountdownForm({ ...countdownForm, sortOrder: parseInt(e.target.value) || 0 })} /></div>
                  <div className="flex items-center gap-3 pt-6"><Switch checked={countdownForm.showTimer} onCheckedChange={(c) => setCountdownForm({ ...countdownForm, showTimer: c })} /><div><Label>Show Timer</Label></div></div>
                  <div className="flex items-center gap-3 pt-6"><Switch checked={countdownForm.active} onCheckedChange={(c) => setCountdownForm({ ...countdownForm, active: c })} /><div><Label>Show Section</Label></div></div>
                  <div className="space-y-1.5"><Label>Platform</Label><select value={countdownForm.platform} onChange={(e) => setCountdownForm({ ...countdownForm, platform: e.target.value as PlatformType })} className="w-full h-10 px-3 border rounded-lg bg-background text-sm"><option value="both">Both</option><option value="website">Website</option><option value="mobile">Mobile</option></select></div>
                </div>
                <Button type="submit" className="w-full h-11" disabled={isBusy}>{isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{countdownEditId ? "Update Countdown Section" : "Create Countdown Section"}</Button>
              </form>
            </DialogContent>
          </Dialog>
          )}
          {activeTab === "promo" && (
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
          {activeTab === "header" && (
          <Dialog open={headerOpen} onOpenChange={setHeaderOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" onClick={openHeaderAdd}>
                <Plus className="w-4 h-4 mr-2" /> Add Header Banner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{headerEditId ? "Edit Header Banner" : "Add Header Banner"}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Slim strip under the main navigation. Recommended <strong>1200×120px</strong> (wide, short).
                </p>
              </DialogHeader>
              <form onSubmit={handleHeaderSubmit} className="space-y-4 py-2">
                <BannerImageUploader
                  value={headerForm.imageUrl}
                  onChange={(url) => setHeaderForm({ ...headerForm, imageUrl: url })}
                  label="Header image"
                  recommendedW={1200}
                  recommendedH={120}
                  aspectRatio="10 / 1"
                />
                <div className="space-y-1.5">
                  <Label>Title <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <Input
                    value={headerForm.title}
                    onChange={(e) => setHeaderForm({ ...headerForm, title: e.target.value })}
                    placeholder="E.g. Free delivery this week"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Link when clicked</Label>
                  <Input
                    value={headerForm.linkUrl}
                    onChange={(e) => setHeaderForm({ ...headerForm, linkUrl: e.target.value })}
                    placeholder="/products"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Platform</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {PLATFORM_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setHeaderForm({ ...headerForm, platform: opt.value })}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-center text-xs font-semibold transition-all ${
                          headerForm.platform === opt.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        <span>{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Sort order</Label>
                    <Input
                      type="number"
                      value={headerForm.sortOrder}
                      onChange={(e) =>
                        setHeaderForm({ ...headerForm, sortOrder: parseInt(e.target.value, 10) || 0 })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <Switch
                      checked={headerForm.active}
                      onCheckedChange={(c) => setHeaderForm({ ...headerForm, active: c })}
                    />
                    <div>
                      <Label>Active</Label>
                      <p className="text-xs text-muted-foreground">Visible on site</p>
                    </div>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isBusy}>
                  {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {headerEditId ? "Save header banner" : "Create header banner"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit border flex-wrap">
        <button
          onClick={() => setActiveTab("hero")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "hero" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          🖼️ Hero / AI Banners
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">{heroBanners.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab("countdown")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "countdown" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          ⏱ Countdown Deal
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200">{countdownBanners.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab("promo")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "promo" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          ✨ Promo Cards
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 bg-violet-50 text-violet-600 border-violet-200">{promoBanners.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab("header")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === "header" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          📣 Header strip
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">{headerBanners.length}</Badge>
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
                          <div className="w-36 h-12 bg-muted rounded-lg overflow-hidden border"><img src={storagePublicUrl(banner.imageUrl)} alt={banner.title} className="w-full h-full object-cover" /></div>
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
                      <div className="flex flex-col items-center gap-3">
                        <Sparkles className="w-8 h-8 text-emerald-600/40" />
                        <div>
                          <p className="font-semibold text-foreground">No hero or AI banners yet.</p>
                          <p className="text-xs text-muted-foreground mt-1">Click <strong>Add AI Smart Banner</strong> to create seasonal AI copy and matched products.</p>
                        </div>
                        <Button size="sm" onClick={openAiHeroAdd} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Add AI Smart Banner
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === "countdown" && (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-emerald-50 text-sm text-emerald-900">
            Premium homepage countdown section. Admin can control text, images, colors, timer, visibility, products, categories, count, and sorting.
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">Order</TableHead>
                <TableHead className="w-40">Preview</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Products / Categories</TableHead>
                <TableHead>Timer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(2)].map((_, i) => (
                  <TableRow key={i}>{[...Array(7)].map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
                ))
              ) : countdownBanners.length ? (
                countdownBanners.map((banner: any) => (
                  <TableRow key={banner.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">{banner.sortOrder}</TableCell>
                    <TableCell>
                      {banner.imageUrl ? (
                        <div className="w-36 h-12 bg-muted rounded-lg overflow-hidden border"><img src={storagePublicUrl(banner.imageUrl)} alt={banner.title} className="w-full h-full object-cover" /></div>
                      ) : (
                        <div className="w-36 h-12 rounded-lg border flex items-center justify-center text-xs font-bold text-white" style={{ background: banner.bgColor || "#0D2B00" }}>{banner.label || "Deal"}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm">{banner.title}</div>
                      {banner.subtitle && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{banner.subtitle}</div>}
                      <div className="text-xs text-muted-foreground mt-0.5">CTA: <span className="font-medium text-foreground">{banner.cta || "Shop Now"}</span></div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div><strong>{banner.offerDisplayCount ?? 8}</strong> items · {banner.offerMode ?? "discount_products"}</div>
                      <div>{Array.isArray(banner.offerProductIds) ? banner.offerProductIds.length : 0} products selected · {Array.isArray(banner.offerCategoryIds) ? banner.offerCategoryIds.length : 0} categories</div>
                    </TableCell>
                    <TableCell>
                      {banner.showTimer === false ? (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Hidden</Badge>
                      ) : banner.countdownEndAt ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{new Date(banner.countdownEndAt).toLocaleString()}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">No end date</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={banner.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}>
                        {banner.active ? "Visible" : "Hidden"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openCountdownEdit(banner)}><Edit className="w-4 h-4 text-muted-foreground" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(banner.id, "countdown")}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground text-sm">
                    <div className="flex flex-col items-center gap-2"><ImageOff className="w-8 h-8 opacity-20" />No countdown section yet. Click "Add Countdown Section" to create one.</div>
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

      {activeTab === "header" && (
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20 text-sm text-muted-foreground">
            Shown as a slim bar under the site header on KDF Plus. Use the{" "}
            <Link href="/video-banners" className="text-primary font-medium underline-offset-2 hover:underline">
              Video Banners
            </Link>{" "}
            page for full-width video heroes (separate from this strip).
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">Order</TableHead>
                <TableHead className="w-44">Preview</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(2)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : headerBanners.length ? (
                headerBanners.map((banner: any) => (
                  <TableRow key={banner.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">{banner.sortOrder}</TableCell>
                    <TableCell>
                      {banner.imageUrl ? (
                        <div className="w-40 h-10 bg-muted rounded border overflow-hidden">
                          <img
                            src={storagePublicUrl(banner.imageUrl)}
                            alt=""
                            className="w-full h-full object-cover object-center"
                          />
                        </div>
                      ) : (
                        <div className="w-40 h-10 rounded border flex items-center justify-center bg-muted">
                          <ImageOff className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{banner.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                      {banner.linkUrl ?? "—"}
                    </TableCell>
                    <TableCell>
                      {banner.platform === "mobile" && (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                          📱 Mobile
                        </Badge>
                      )}
                      {banner.platform === "website" && (
                        <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50">
                          🖥️ Website
                        </Badge>
                      )}
                      {(!banner.platform || banner.platform === "both") && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
                          🌐 Both
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          banner.active
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                        }
                      >
                        {banner.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openHeaderEdit(banner)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(banner.id, "header")}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground text-sm">
                    No header banners yet. Switch to this tab and click &quot;Add Header Banner&quot;.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
