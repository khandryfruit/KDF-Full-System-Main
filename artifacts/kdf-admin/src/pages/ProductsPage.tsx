import { useState, useRef, useCallback } from "react";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useListCategories,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListProductsQueryKey } from "@workspace/api-client-react";
import { v4 as uuidv4 } from "uuid";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Search, Edit, Trash2, Upload, X, ImageIcon, Loader2,
  Tag, Package, Layers, DollarSign, Info, Palette, Sparkles,
  CheckCircle2, ExternalLink, Eye, ChevronDown, Globe,
} from "lucide-react";
import { AIGenerateButton, AIActionsMenu } from "@/components/AIGenerateButton";
import { RichDescriptionEditor } from "@/components/RichDescriptionEditor";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

/* ─── Types ─────────────────────────────────────────────── */
interface ProductVariant {
  id: string;
  name: string;
  value: string;
  hex?: string;
  price?: string;
  stock: number;
  sku?: string;
}

const VARIANT_TYPES = ["Weight", "Size", "Color", "Flavor", "Material", "Custom"] as const;

/* ─── Image helpers ──────────────────────────────────────── */
function getImageUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/objects/")) return `/api/storage${path}`;
  return path;
}

/* ─── Upload hook ────────────────────────────────────────── */
function useProductImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    setIsUploading(true);
    try {
      const token = localStorage.getItem("kdf_admin_token") ?? "";
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/uploads/image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { objectPath } = await res.json();
      return objectPath;
    } catch { return null; } finally { setIsUploading(false); }
  }, []);
  return { uploadFile, isUploading };
}

/* ─── Image Uploader component ────────────────────────────── */
function ImageUploader({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useProductImageUpload();
  const { toast } = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { toast({ variant: "destructive", title: `${file.name} is not an image` }); continue; }
      if (file.size > 5 * 1024 * 1024) { toast({ variant: "destructive", title: `${file.name} exceeds 5 MB` }); continue; }
      const path = await uploadFile(file);
      if (path) uploaded.push(path);
      else toast({ variant: "destructive", title: `Failed to upload ${file.name}` });
    }
    if (uploaded.length) onChange([...images, ...uploaded]);
  };

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-muted">
              <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" loading="lazy" />
              <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3 text-white" />
              </button>
              {i === 0 && <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold bg-black/50 text-white px-1 rounded">Main</span>}
            </div>
          ))}
        </div>
      )}
      <div
        className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
      >
        {isUploading
          ? <div className="flex flex-col items-center gap-2 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm">Uploading…</span></div>
          : <div className="flex flex-col items-center gap-2 text-muted-foreground"><Upload className="w-6 h-6" /><span className="text-sm font-medium">Click or drag images here</span><span className="text-xs">PNG, JPG, WEBP · Max 5 MB each · First image is main</span></div>
        }
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  );
}

/* ─── Group helpers ──────────────────────────────────────── */
function getGroups(variants: ProductVariant[]) {
  const order: string[] = [];
  const map = new Map<string, ProductVariant[]>();
  for (const v of variants) {
    if (!map.has(v.name)) { map.set(v.name, []); order.push(v.name); }
    map.get(v.name)!.push(v);
  }
  return order.map(type => ({ type, items: map.get(type)! }));
}

/* ─── Variant Value Row ──────────────────────────────────── */
function VariantValueRow({ variant, isColor, onChange, onRemove }: {
  variant: ProductVariant;
  isColor: boolean;
  onChange: (v: ProductVariant) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_88px_72px_100px_32px] gap-2 items-center py-2 px-3 border-b last:border-0 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-2">
        {isColor && (
          <div className="relative flex-shrink-0 w-7 h-7 rounded-full border-2 border-white shadow cursor-pointer overflow-hidden">
            <input
              type="color"
              value={variant.hex || "#5FA800"}
              onChange={(e) => onChange({ ...variant, hex: e.target.value })}
              className="absolute inset-0 w-12 h-12 -translate-x-2 -translate-y-2 cursor-pointer opacity-0"
            />
            <div className="w-full h-full rounded-full" style={{ backgroundColor: variant.hex || "#5FA800" }} />
          </div>
        )}
        <Input
          className="h-8 text-xs"
          placeholder={isColor ? "e.g. Forest Green" : "e.g. 250g"}
          value={variant.value}
          onChange={(e) => onChange({ ...variant, value: e.target.value })}
        />
      </div>
      <Input
        className="h-8 text-xs"
        type="number"
        min="0"
        step="0.01"
        placeholder="Price"
        value={variant.price || ""}
        onChange={(e) => onChange({ ...variant, price: e.target.value })}
      />
      <Input
        className="h-8 text-xs"
        type="number"
        min="0"
        placeholder="Stock"
        value={variant.stock}
        onChange={(e) => onChange({ ...variant, stock: parseInt(e.target.value) || 0 })}
      />
      <Input
        className="h-8 text-xs"
        placeholder="SKU (opt.)"
        value={variant.sku || ""}
        onChange={(e) => onChange({ ...variant, sku: e.target.value })}
      />
      <button
        type="button"
        onClick={onRemove}
        className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── Variation Group Card ───────────────────────────────── */
function VariationGroupCard({ type, items, usedTypes, onTypeChange, onAddValue, onUpdateValue, onRemoveValue, onRemoveGroup }: {
  type: string;
  items: ProductVariant[];
  usedTypes: string[];
  onTypeChange: (newType: string) => void;
  onAddValue: () => void;
  onUpdateValue: (id: string, v: ProductVariant) => void;
  onRemoveValue: (id: string) => void;
  onRemoveGroup: () => void;
}) {
  const isColor = type === "Color";
  const groupStock = items.reduce((s, v) => s + (v.stock || 0), 0);

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm">
      {/* Group Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40 border-b">
        <div className="flex items-center gap-2.5">
          {isColor
            ? <Palette className="w-4 h-4 text-purple-500 flex-shrink-0" />
            : <Layers className="w-4 h-4 text-[#5FA800] flex-shrink-0" />
          }
          <Select
            value={type}
            onValueChange={(val) => {
              if (!usedTypes.includes(val) || val === type) onTypeChange(val);
            }}
          >
            <SelectTrigger className="h-8 w-36 text-xs font-semibold bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIANT_TYPES.map(t => (
                <SelectItem key={t} value={t} disabled={usedTypes.includes(t) && t !== type}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {items.length} option{items.length !== 1 ? "s" : ""} · {groupStock} in stock
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2.5" onClick={onAddValue}>
            <Plus className="w-3 h-3 mr-1" /> Add Value
          </Button>
          <button
            type="button"
            onClick={onRemoveGroup}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove entire group"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[1fr_88px_72px_100px_32px] gap-2 px-3 py-1.5 bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        <span>{isColor ? "Color Name" : "Value"}</span>
        <span>Price (Rs.)</span>
        <span>Stock</span>
        <span>SKU</span>
        <span />
      </div>

      {/* Value Rows */}
      <div>
        {items.map(item => (
          <VariantValueRow
            key={item.id}
            variant={item}
            isColor={isColor}
            onChange={(updated) => onUpdateValue(item.id, updated)}
            onRemove={() => onRemoveValue(item.id)}
          />
        ))}
      </div>

      {/* Color swatches preview */}
      {isColor && items.some(v => v.hex) && (
        <div className="px-3 py-2.5 bg-muted/10 border-t flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-medium">Preview:</span>
          {items.filter(v => v.value || v.hex).map(v => (
            <div key={v.id} className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: v.hex || "#ccc" }} />
              <span className="text-xs text-muted-foreground">{v.value || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Form state ──────────────────────────────────────────── */
const emptyForm = () => ({
  name: "", slug: "", description: "", price: "", originalPrice: "",
  stock: 0, categoryId: undefined as number | undefined,
  featured: false, active: true,
  images: [] as string[],
  tags: [] as string[],
  variants: [] as ProductVariant[],
  weight: "", unit: "gram",
  metaTitle: "", metaDescription: "", altText: "",
});

/* ─── Main Page ───────────────────────────────────────────── */
export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [tagInput, setTagInput] = useState("");
  const [createdProduct, setCreatedProduct] = useState<{ id: number; slug: string; name: string } | null>(null);

  const { data: response, isLoading } = useListProducts({ page, limit: 10, search });
  const { data: categoriesRes } = useListCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const [form, setForm] = useState(emptyForm());

  const handleOpenAdd = () => {
    setForm(emptyForm());
    setEditingId(null);
    setActiveTab("basic");
    setCreatedProduct(null);
    setIsOpen(true);
  };

  const handleOpenEdit = (p: any) => {
    setForm({
      name: p.name, slug: p.slug, description: p.description || "",
      price: p.price, originalPrice: p.originalPrice || "",
      stock: p.stock, categoryId: p.categoryId,
      featured: p.featured, active: p.active,
      images: Array.isArray(p.images) ? p.images : [],
      tags: Array.isArray(p.tags) ? p.tags : [],
      variants: Array.isArray(p.variants) ? p.variants : [],
      weight: p.weight || "", unit: p.unit || "gram",
      metaTitle: p.metaTitle || "", metaDescription: p.metaDescription || "", altText: p.altText || "",
    });
    setEditingId(p.id);
    setActiveTab("basic");
    setIsOpen(true);
  };

  const addVariationGroup = () => {
    const usedTypes = new Set(form.variants.map(v => v.name));
    const nextType = (["Weight", "Size", "Color", "Flavor", "Material", "Custom"] as const).find(t => !usedTypes.has(t)) ?? "Custom";
    setForm(f => ({
      ...f,
      variants: [...f.variants, { id: uuidv4(), name: nextType, value: "", stock: 0 }],
    }));
  };

  const addValueToGroup = (type: string) => {
    setForm(f => ({
      ...f,
      variants: [...f.variants, { id: uuidv4(), name: type, value: "", stock: 0 }],
    }));
  };

  const updateGroupType = (oldType: string, newType: string) => {
    setForm(f => ({
      ...f,
      variants: f.variants.map(v => v.name === oldType ? { ...v, name: newType } : v),
    }));
  };

  const updateVariantById = (id: string, updated: ProductVariant) => {
    setForm(f => ({ ...f, variants: f.variants.map(v => v.id === id ? updated : v) }));
  };

  const removeVariantById = (id: string) => {
    setForm(f => ({ ...f, variants: f.variants.filter(v => v.id !== id) }));
  };

  const removeGroup = (type: string) => {
    setForm(f => ({ ...f, variants: f.variants.filter(v => v.name !== type) }));
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput("");
  };

  const totalVariantStock = form.variants.reduce((s, v) => s + (v.stock || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) {
      toast({ variant: "destructive", title: "Name and price are required" });
      setActiveTab("basic");
      return;
    }
    const effectiveStock = form.variants.length > 0 ? totalVariantStock : form.stock;
    // Sanitize slug before submission — same rules as generateSlugFromName on the server
    const rawSlug = form.slug || form.name;
    const cleanSlug = rawSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const payload = {
      ...form,
      slug: cleanSlug,
      stock: effectiveStock,
      originalPrice: form.originalPrice || undefined,
      weight: form.weight || undefined,
      unit: form.unit || undefined,
    };
    const opts = {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        if (editingId) {
          setIsOpen(false);
          toast({ title: "Product updated" });
        } else {
          setCreatedProduct({ id: data.id, slug: data.slug, name: data.name });
        }
      },
      onError: () => toast({ variant: "destructive", title: "Failed to save product" }),
    };
    if (editingId) updateMutation.mutate({ id: editingId, data: payload }, opts);
    else createMutation.mutate({ data: payload as any }, opts);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this product?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); toast({ title: "Deleted" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to delete" }),
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenAdd} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" /> Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
              <DialogTitle className="text-xl">{editingId ? "Edit Product" : "Add Product"}</DialogTitle>
            </DialogHeader>

            {/* ── Success screen ── */}
            {createdProduct && (
              <div className="flex flex-col items-center justify-center px-8 py-12 gap-6 flex-1">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-green-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Product created!</h3>
                  <p className="text-muted-foreground text-sm">"{createdProduct.name}" has been added to your store.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                  <Button
                    type="button"
                    className="flex-1 gap-2"
                    onClick={() => window.open(`/kdf-nuts/products/${createdProduct.slug}`, "_blank")}
                  >
                    <Eye className="w-4 h-4" /> View on Website
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => { setCreatedProduct(null); setForm(emptyForm()); setActiveTab("basic"); }}
                  >
                    <Plus className="w-4 h-4" /> Add Another
                  </Button>
                </div>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => { setIsOpen(false); setCreatedProduct(null); }}
                >
                  Back to product list
                </button>
              </div>
            )}

            {/* ── Product form ── */}
            {!createdProduct && (
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              {/* Tab progress bar */}
              <div className="mx-6 mt-4 flex-shrink-0">
                <div className="flex items-center gap-1 mb-3">
                  {(["basic","pricing","variations","images","seo"] as const).map((tab, i) => {
                    const done =
                      tab === "basic" ? !!(form.name && form.description) :
                      tab === "pricing" ? !!form.price :
                      tab === "images" ? form.images.length > 0 :
                      tab === "seo" ? !!form.metaTitle :
                      false;
                    const active = activeTab === tab;
                    return (
                      <div key={tab} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`h-1 w-full rounded-full transition-colors ${done ? "bg-green-500" : active ? "bg-primary" : "bg-muted"}`} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
                <TabsList className="mx-6 flex-shrink-0 grid grid-cols-5 h-9">
                  <TabsTrigger value="basic" className="text-xs gap-1">
                    {form.name && form.description ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Info className="w-3.5 h-3.5" />}Basic
                  </TabsTrigger>
                  <TabsTrigger value="pricing" className="text-xs gap-1">
                    {form.price ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <DollarSign className="w-3.5 h-3.5" />}Pricing
                  </TabsTrigger>
                  <TabsTrigger value="variations" className="text-xs gap-1">
                    {form.variants.length > 0 ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Layers className="w-3.5 h-3.5" />}Variations
                  </TabsTrigger>
                  <TabsTrigger value="images" className="text-xs gap-1">
                    {form.images.length > 0 ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <ImageIcon className="w-3.5 h-3.5" />}Images
                  </TabsTrigger>
                  <TabsTrigger value="seo" className="text-xs gap-1">
                    {form.metaTitle ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Search className="w-3.5 h-3.5" />}SEO
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 py-4">

                  {/* ── Basic Info ── */}
                  <TabsContent value="basic" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Product Name <span className="text-destructive">*</span></Label>
                        <Input
                          required
                          value={form.name}
                          placeholder="e.g. Premium Cashews 500g"
                          onChange={(e) => {
                            const name = e.target.value;
                            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                            setForm(f => ({ ...f, name, slug: f.slug || slug }));
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Slug</Label>
                        <Input
                          value={form.slug}
                          placeholder="auto-generated"
                          onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            if (!raw) return;
                            const clean = raw
                              .toLowerCase()
                              .trim()
                              .replace(/[^a-z0-9\s-]/g, "")
                              .replace(/\s+/g, "-")
                              .replace(/-+/g, "-")
                              .replace(/^-|-$/g, "");
                            setForm(f => ({ ...f, slug: clean }));
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <RichDescriptionEditor
                        value={form.description}
                        onChange={(html) => setForm(f => ({ ...f, description: html }))}
                        productName={form.name}
                        categoryName={(categoriesRes as any[])?.find((c: any) => c.id === form.categoryId)?.name ?? ""}
                        showSeoScore={true}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select
                        value={form.categoryId?.toString()}
                        onValueChange={(v) => setForm(f => ({ ...f, categoryId: parseInt(v) }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {(categoriesRes as any[])?.map((c: any) => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />Tags</Label>
                      <div className="flex gap-2">
                        <Input
                          value={tagInput}
                          placeholder="Add a tag…"
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
                      </div>
                      {form.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {form.tags.map((t) => (
                            <Badge key={t} variant="secondary" className="gap-1 pr-1">
                              {t}
                              <button type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))} className="hover:text-destructive">
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator />
                    <div className="flex gap-6">
                      <div className="flex items-center gap-2.5">
                        <Switch checked={form.active} onCheckedChange={(c) => setForm(f => ({ ...f, active: c }))} />
                        <Label>Active</Label>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Switch checked={form.featured} onCheckedChange={(c) => setForm(f => ({ ...f, featured: c }))} />
                        <Label>Featured</Label>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ── Pricing ── */}
                  <TabsContent value="pricing" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Selling Price (Rs.) <span className="text-destructive">*</span></Label>
                        <Input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.price}
                          placeholder="0.00"
                          onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Original / MRP (Rs.)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.originalPrice}
                          placeholder="0.00"
                          onChange={(e) => setForm(f => ({ ...f, originalPrice: e.target.value }))}
                        />
                        {form.originalPrice && form.price && Number(form.originalPrice) > Number(form.price) && (
                          <p className="text-xs text-[#5FA800]">
                            {Math.round(((Number(form.originalPrice) - Number(form.price)) / Number(form.originalPrice)) * 100)}% discount
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Base Stock</Label>
                        <Input
                          type="number"
                          min="0"
                          value={form.stock}
                          onChange={(e) => setForm(f => ({ ...f, stock: parseInt(e.target.value) || 0 }))}
                        />
                        {form.variants.length > 0 && (
                          <p className="text-xs text-muted-foreground">Auto-calculated from variations: <strong>{totalVariantStock}</strong></p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Weight</Label>
                        <Input
                          value={form.weight}
                          placeholder="e.g. 500"
                          onChange={(e) => setForm(f => ({ ...f, weight: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Unit</Label>
                        <Select value={form.unit} onValueChange={(v) => setForm(f => ({ ...f, unit: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gram">gram</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="piece">piece</SelectItem>
                            <SelectItem value="liter">liter</SelectItem>
                            <SelectItem value="ml">ml</SelectItem>
                            <SelectItem value="box">box</SelectItem>
                            <SelectItem value="pack">pack</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {form.weight && (
                      <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                        Product weight: <strong>{form.weight} {form.unit}</strong>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── Variations ── */}
                  <TabsContent value="variations" className="mt-0 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Product Variations</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Group options by type — each value gets its own price &amp; stock
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addVariationGroup}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Variation Group
                      </Button>
                    </div>

                    {getGroups(form.variants).length === 0 ? (
                      <div className="border-2 border-dashed rounded-xl p-10 text-center text-muted-foreground">
                        <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-semibold">No variation groups yet</p>
                        <p className="text-xs mt-1 mb-4 max-w-xs mx-auto">
                          Create groups like <strong>Weight</strong> (250g / 500g / 1kg) or <strong>Color</strong> (Red / Green) — each value has its own price and stock
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={addVariationGroup}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add First Group
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {getGroups(form.variants).map(({ type, items }) => (
                          <VariationGroupCard
                            key={type}
                            type={type}
                            items={items}
                            usedTypes={getGroups(form.variants).map(g => g.type)}
                            onTypeChange={(newType) => updateGroupType(type, newType)}
                            onAddValue={() => addValueToGroup(type)}
                            onUpdateValue={(id, v) => updateVariantById(id, v)}
                            onRemoveValue={(id) => removeVariantById(id)}
                            onRemoveGroup={() => removeGroup(type)}
                          />
                        ))}
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 px-1">
                          <span>
                            {getGroups(form.variants).length} group{getGroups(form.variants).length !== 1 ? "s" : ""} · {form.variants.length} total option{form.variants.length !== 1 ? "s" : ""}
                          </span>
                          <span>Total stock: <strong className="text-foreground">{totalVariantStock}</strong></span>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* ── Images ── */}
                  <TabsContent value="images" className="mt-0 space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-0.5">Product Images</p>
                      <p className="text-xs text-muted-foreground mb-3">First image is used as the main product photo</p>
                      <ImageUploader
                        images={form.images}
                        onChange={(imgs) => setForm(f => ({ ...f, images: imgs }))}
                      />
                    </div>
                  </TabsContent>

                  {/* ── SEO ── */}
                  <TabsContent value="seo" className="mt-0 space-y-5">
                    {/* Auto-fill banner */}
                    {!form.metaTitle && !form.metaDescription && form.name && (
                      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                        <div className="flex items-center gap-2 text-blue-700">
                          <Info className="w-4 h-4" />
                          <span>Auto-fill SEO fields from product info?</span>
                        </div>
                        <Button
                          type="button" size="sm" variant="outline"
                          className="text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                          onClick={() => setForm(f => ({
                            ...f,
                            metaTitle: f.metaTitle || (f.name ? `${f.name} — KDF NUTS` : ""),
                            metaDescription: f.metaDescription || (f.description?.replace(/<[^>]+>/g, "").substring(0, 155) || `Buy ${f.name} online at KDF NUTS — Premium dry fruits delivered to your door.`),
                            altText: f.altText || f.name,
                          }))}
                        >
                          Auto-fill
                        </Button>
                      </div>
                    )}

                    {/* Meta Title */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Meta Title <span className="text-xs text-muted-foreground ml-1">(shown in Google)</span></Label>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs tabular-nums ${(form.metaTitle?.length ?? 0) > 60 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                            {form.metaTitle?.length ?? 0}/60
                          </span>
                          <AIGenerateButton
                            type="product-seo"
                            context={{ name: form.name, category: (categoriesRes as any[])?.find((c: any) => c.id === form.categoryId)?.name ?? "", keywords: form.tags.join(", ") }}
                            label="Generate (AI)"
                            onResult={(r: any) => setForm(f => ({
                              ...f,
                              metaTitle: r.metaTitle ?? f.metaTitle,
                              metaDescription: r.metaDescription ?? f.metaDescription,
                            }))}
                          />
                        </div>
                      </div>
                      <Input
                        value={form.metaTitle}
                        onChange={(e) => setForm(f => ({ ...f, metaTitle: e.target.value }))}
                        placeholder={form.name ? `${form.name} — KDF NUTS` : "e.g. Premium Cashews 500g — KDF NUTS"}
                        maxLength={70}
                      />
                      <p className="text-xs text-muted-foreground">Target 50–60 characters for best Google visibility.</p>
                    </div>

                    {/* Meta Description */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Meta Description <span className="text-xs text-muted-foreground ml-1">(max 160 chars)</span></Label>
                        <span className={`text-xs tabular-nums ${(form.metaDescription?.length ?? 0) > 160 ? "text-destructive font-semibold" : (form.metaDescription?.length ?? 0) > 130 ? "text-orange-500" : "text-muted-foreground"}`}>
                          {form.metaDescription?.length ?? 0}/160
                        </span>
                      </div>
                      <Textarea
                        rows={3}
                        value={form.metaDescription}
                        onChange={(e) => setForm(f => ({ ...f, metaDescription: e.target.value }))}
                        placeholder="Short, compelling summary for Google search results (max 160 chars)"
                        maxLength={180}
                        className="resize-none text-sm"
                      />
                      <p className="text-xs text-muted-foreground">Shown under the title in Google. Make it persuasive.</p>
                    </div>

                    {/* Alt Text */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Image Alt Text <span className="text-xs text-muted-foreground ml-1">(for SEO & accessibility)</span></Label>
                        <AIGenerateButton
                          type="alt-text"
                          context={{ name: form.name, description: form.description }}
                          label="Generate (AI)"
                          onResult={(r: any) => setForm(f => ({ ...f, altText: r.altText ?? r.text ?? f.altText }))}
                        />
                      </div>
                      <Input
                        value={form.altText}
                        onChange={(e) => setForm(f => ({ ...f, altText: e.target.value }))}
                        placeholder={form.name ? `${form.name} — Premium dry fruits from KDF NUTS` : "Describe the main product image"}
                      />
                      <p className="text-xs text-muted-foreground">Describes images to search engines and screen readers.</p>
                    </div>

                    {/* Google Search Preview */}
                    {(form.metaTitle || form.name) && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Google Preview</p>
                        <div className="border rounded-xl p-4 bg-white space-y-1 shadow-sm">
                          <p className="text-xs text-green-700 font-medium">kdfnuts.com › products › {form.slug || "product"}</p>
                          <p className="text-[15px] text-blue-700 font-medium leading-snug">
                            {form.metaTitle || (form.name ? `${form.name} — KDF NUTS` : "Product Title")}
                          </p>
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {form.metaDescription || "No meta description set. Add one to improve click-through rates."}
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20 flex-shrink-0">
                <div className="text-xs text-muted-foreground">
                  {form.variants.length > 0 && <span>{form.variants.length} variation{form.variants.length !== 1 ? "s" : ""} · </span>}
                  {form.images.length > 0 && <span>{form.images.length} image{form.images.length !== 1 ? "s" : ""} · </span>}
                  {form.tags.length > 0 && <span>{form.tags.length} tag{form.tags.length !== 1 ? "s" : ""}</span>}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingId ? "Update Product" : "Create Product"}
                  </Button>
                </div>
              </div>
            </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="flex items-center relative w-full sm:w-96">
        <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
        <Input placeholder="Search products…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Variations</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[200, 80, 50, 60, 60, 80].map((w, j) => (
                    <TableCell key={j}><Skeleton className={`h-4 w-[${w}px]`} /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : response?.items?.length ? (
              response.items.map((product) => {
                const variants = (product as any).variants as ProductVariant[] | undefined;
                const varCount = variants?.length ?? 0;
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {(product as any).images?.[0] ? (
                          <img
                            src={getImageUrl((product as any).images[0])}
                            alt={product.name}
                            loading="lazy"
                            className="w-10 h-10 rounded-lg object-cover border bg-muted flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg border bg-muted flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-sm leading-tight">{product.name}</div>
                          <div className="text-xs text-muted-foreground">{product.slug}</div>
                          {(product as any).tags?.length > 0 && (
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                              {((product as any).tags as string[]).slice(0, 2).map((t: string) => (
                                <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">Rs. {product.price}</div>
                      {product.originalPrice && (
                        <div className="text-xs line-through text-muted-foreground">Rs. {product.originalPrice}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.stock > 10 ? "secondary" : "destructive"} className="text-xs">
                        {product.stock}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {varCount > 0 ? (
                        <div className="space-y-1">
                          <Badge variant="outline" className="text-xs gap-1">
                            <Layers className="w-3 h-3" /> {varCount} vars
                          </Badge>
                          {variants?.some(v => v.name === "Color") && (
                            <div className="flex gap-1">
                              {variants.filter(v => v.name === "Color").slice(0, 4).map(v => (
                                <div key={v.id} title={v.value} className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: v.hex || "#ccc" }} />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={`w-fit text-xs ${product.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500"}`}>
                          {product.active ? "Active" : "Inactive"}
                        </Badge>
                        {product.featured && <Badge variant="default" className="w-fit text-xs">Featured</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          title="View on website"
                          onClick={() => window.open(`/kdf-nuts/products/${(product as any).slug || product.id}`, "_blank")}
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(product)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No products found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {response && response.total > 10 && (
        <div className="flex justify-center items-center gap-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(response.total / 10)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(response.total / 10)} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
