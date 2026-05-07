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
  CheckCircle2, Package, LayoutGrid, Link2, ChevronDown, Search,
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

export default function BannersPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const { data: banners, isLoading } = useListBanners();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateBanner();
  const updateMutation = useUpdateBanner();
  const deleteMutation = useDeleteBanner();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/banners"] });

  function openAdd() {
    setFormData({ ...EMPTY_FORM });
    setEditingId(null);
    setIsOpen(true);
  }

  function openEdit(banner: any) {
    setFormData({
      title: banner.title ?? "",
      subtitle: banner.subtitle ?? "",
      imageUrl: banner.imageUrl ?? "",
      mobileImageUrl: banner.mobileImageUrl ?? "",
      cta: banner.cta ?? "Shop Now",
      sortOrder: banner.sortOrder ?? 0,
      active: banner.active ?? true,
      platform: (banner.platform ?? "both") as PlatformType,
      targetType: (banner.targetType ?? "") as TargetType,
      targetId: banner.targetId ?? null,
      targetLabel: "",
      linkUrl: banner.linkUrl ?? "",
      countdownEndAt: (banner as any).countdownEndAt ? new Date((banner as any).countdownEndAt).toISOString().slice(0, 16) : "",
      startDate: (banner as any).startDate ? new Date((banner as any).startDate).toISOString().slice(0, 16) : "",
      endDate: (banner as any).endDate ? new Date((banner as any).endDate).toISOString().slice(0, 16) : "",
    });
    setEditingId(banner.id);
    setIsOpen(true);
  }

  function buildPayload() {
    const { targetLabel: _l, ...rest } = formData;
    return {
      ...rest,
      platform: rest.platform || "both",
      targetType: rest.targetType || undefined,
      targetId: rest.targetId ?? undefined,
      linkUrl: rest.targetType === "page" ? rest.linkUrl : undefined,
      mobileImageUrl: rest.mobileImageUrl || undefined,
      countdownEndAt: rest.countdownEndAt ? new Date(rest.countdownEndAt).toISOString() : undefined,
      startDate: rest.startDate ? new Date(rest.startDate).toISOString() : undefined,
      endDate: rest.endDate ? new Date(rest.endDate).toISOString() : undefined,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.imageUrl) {
      toast({ variant: "destructive", title: "Please upload a banner image" });
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
    const payload = buildPayload();
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload as any },
        {
          onSuccess: () => { invalidate(); setIsOpen(false); toast({ title: "Banner updated" }); },
          onError: () => toast({ variant: "destructive", title: "Failed to update banner" }),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => { invalidate(); setIsOpen(false); toast({ title: "Banner created" }); },
          onError: () => toast({ variant: "destructive", title: "Failed to create banner" }),
        }
      );
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this banner?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Banner deleted" }); },
        onError: () => toast({ variant: "destructive", title: "Failed to delete" }),
      }
    );
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  function getTargetBadge(banner: any) {
    if (banner.targetType === "product") return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50"><Package className="w-3 h-3 mr-1" />Product #{banner.targetId}</Badge>;
    if (banner.targetType === "category") return <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50"><LayoutGrid className="w-3 h-3 mr-1" />Category #{banner.targetId}</Badge>;
    if (banner.targetType === "page" && banner.linkUrl) return <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50"><Link2 className="w-3 h-3 mr-1" />{banner.linkUrl}</Badge>;
    return <span className="text-xs text-muted-foreground">No target</span>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Banners</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage homepage banners · Link to products, categories, or custom pages
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4 mr-2" /> Add Banner
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Banner" : "Add Banner"}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Desktop: <strong>1200×400px</strong> · Mobile: <strong>600×300px</strong> · PNG, JPG, WebP
              </p>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5 py-2">

              {/* 1. Desktop Image Upload */}
              <BannerImageUploader
                value={formData.imageUrl}
                onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                label="🖥️ Desktop Banner Image"
                recommendedW={1200}
                recommendedH={400}
                aspectRatio="3/1"
              />

              {/* 1b. Mobile Image Upload */}
              <BannerImageUploader
                value={formData.mobileImageUrl}
                onChange={(url) => setFormData({ ...formData, mobileImageUrl: url })}
                label="📱 Mobile Banner Image"
                recommendedW={600}
                recommendedH={300}
                aspectRatio="2/1"
                optional
              />

              {/* 2. Content */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Summer Sale — Premium Nuts"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Subtitle</Label>
                  <Input
                    value={formData.subtitle}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                    placeholder="Up to 30% off on selected products"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>CTA Button Text</Label>
                  <Input
                    value={formData.cta}
                    onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
                    placeholder="Shop Now"
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* 3. Target selection */}
              <TargetTypeSelector
                value={formData.targetType}
                onChange={(v) =>
                  setFormData({ ...formData, targetType: v, targetId: null, targetLabel: "", linkUrl: "" })
                }
              />

              {formData.targetType === "product" && (
                <ProductSelector
                  value={formData.targetId}
                  onChange={(id, name) => setFormData({ ...formData, targetId: id, targetLabel: name })}
                />
              )}

              {formData.targetType === "category" && (
                <CategorySelector
                  value={formData.targetId}
                  onChange={(id, name) => setFormData({ ...formData, targetId: id, targetLabel: name })}
                />
              )}

              {formData.targetType === "page" && (
                <div className="space-y-1.5">
                  <Label>URL Path *</Label>
                  <Input
                    required={formData.targetType === "page"}
                    value={formData.linkUrl}
                    onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                    placeholder="/products?category=cashews"
                  />
                  <p className="text-xs text-muted-foreground">Enter a relative path starting with /</p>
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* 4. Platform */}
              <div className="space-y-2">
                <Label>Display Platform</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, platform: opt.value })}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                        formData.platform === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-muted-foreground/50 text-muted-foreground"
                      }`}
                    >
                      <span className="text-lg leading-none">{opt.icon}</span>
                      <span className="text-xs font-semibold">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM_OPTIONS.find(o => o.value === formData.platform)?.description}
                </p>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* 5. Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">Lower = shown first</p>
                </div>
                <div className="space-y-1.5 flex flex-col justify-center">
                  <div className="flex items-center gap-3 pt-4">
                    <Switch
                      checked={formData.active}
                      onCheckedChange={(c) => setFormData({ ...formData, active: c })}
                    />
                    <div>
                      <Label>Active</Label>
                      <p className="text-xs text-muted-foreground">Show on storefront</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* 6. Countdown & Schedule */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">⏱️ Countdown & Schedule (Optional)</Label>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Countdown End Date & Time</Label>
                    <Input
                      type="datetime-local"
                      value={formData.countdownEndAt}
                      onChange={(e) => setFormData({ ...formData, countdownEndAt: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Shows a live countdown timer on this banner until this date/time</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Show From (optional)</Label>
                      <Input
                        type="datetime-local"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Hide After (optional)</Label>
                      <Input
                        type="datetime-local"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full h-11" disabled={isBusy}>
                {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? "Update Banner" : "Create Banner"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
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
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : banners?.length
              ? banners.map((banner) => (
                  <TableRow key={banner.id} className="group">
                    <TableCell className="font-mono text-sm text-muted-foreground">{banner.sortOrder}</TableCell>
                    <TableCell>
                      {banner.imageUrl ? (
                        <div className="w-36 h-12 bg-muted rounded-lg overflow-hidden border">
                          <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-36 h-12 rounded-lg border flex items-center justify-center bg-muted">
                          <ImageOff className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-sm">{banner.title}</div>
                      {banner.subtitle && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{banner.subtitle}</div>
                      )}
                      {banner.cta && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          CTA: <span className="font-medium text-foreground">"{banner.cta}"</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getTargetBadge(banner)}</TableCell>
                    <TableCell>
                      {banner.platform === "mobile" && (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">📱 Mobile</Badge>
                      )}
                      {banner.platform === "website" && (
                        <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50">🖥️ Website</Badge>
                      )}
                      {(!banner.platform || banner.platform === "both") && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">🌐 Both</Badge>
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
                        <Button variant="ghost" size="icon" onClick={() => openEdit(banner)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(banner.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <ImageOff className="w-8 h-8 opacity-20" />
                      No banners yet. Click "Add Banner" to create your first one.
                    </div>
                  </TableCell>
                </TableRow>
              )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
