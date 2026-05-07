import { useState, useRef, useCallback } from "react";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Upload, X, Loader2, ImageIcon, Search } from "lucide-react";
import { AIGenerateButton } from "@/components/AIGenerateButton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

function getImageUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/objects/")) return `/api/storage${path}`;
  return path;
}

function useCategoryImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const upload = useCallback(async (file: File): Promise<string | null> => {
    setIsUploading(true);
    try {
      const token = localStorage.getItem("kdf_admin_token");
      const res = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await res.json();
      const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
      if (!put.ok) throw new Error("Upload failed");
      return objectPath;
    } catch { return null; } finally { setIsUploading(false); }
  }, []);
  return { upload, isUploading };
}

function CategoryImageUploader({ value, altText, onImageChange, onAltChange }: {
  value: string;
  altText: string;
  onImageChange: (v: string) => void;
  onAltChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useCategoryImageUpload();
  const { toast } = useToast();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ variant: "destructive", title: "Not an image file" }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ variant: "destructive", title: "Image exceeds 5 MB" }); return; }
    const path = await upload(file);
    if (path) onImageChange(path);
    else toast({ variant: "destructive", title: "Upload failed" });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Category Image</Label>

      {value ? (
        <div className="relative group rounded-xl overflow-hidden border bg-muted" style={{ aspectRatio: "16/9" }}>
          <img src={getImageUrl(value)} alt={altText || "Category"} className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="bg-white text-gray-900 text-xs px-3 py-1.5 rounded-full font-medium hover:bg-gray-100 transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-3 h-3" /> Replace
            </button>
            <button
              type="button"
              onClick={() => onImageChange("")}
              className="bg-red-500 text-white text-xs px-3 py-1.5 rounded-full font-medium hover:bg-red-600 transition-colors flex items-center gap-1.5"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onClick={() => !isUploading && fileRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0] ?? null); }}
          onDragOver={(e) => e.preventDefault()}
        >
          {isUploading
            ? <div className="flex flex-col items-center gap-2 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-sm">Uploading…</span></div>
            : <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="w-8 h-8 opacity-40" />
                <span className="text-sm font-medium">Click or drag image here</span>
                <span className="text-xs">PNG, JPG, WEBP · Max 5 MB</span>
              </div>
          }
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Alt Text <span className="text-destructive">*</span></Label>
        <Input
          value={altText}
          placeholder='e.g. "Premium Cashews Category"'
          onChange={(e) => onAltChange(e.target.value)}
          className="text-sm"
        />
        <p className="text-[11px] text-muted-foreground">Describe the image for SEO and accessibility</p>
      </div>
    </div>
  );
}

const emptyForm = () => ({
  name: "",
  slug: "",
  icon: "",
  imageUrl: "",
  altText: "",
  color: "",
  parentId: undefined as number | undefined,
  sortOrder: 0,
  metaTitle: "",
  metaDescription: "",
  active: true,
});

export default function CategoriesPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tab, setTab] = useState("general");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());

  const { data: response, isLoading } = useListCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const allCategories = (response as any[]) ?? [];
  const filtered = search
    ? allCategories.filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.toLowerCase().includes(search.toLowerCase()))
    : allCategories;

  const parentOptions = allCategories.filter((c: any) => !editingId || c.id !== editingId);

  const getCategoryPath = (cat: any): string => {
    if (!cat.parentId) return cat.name;
    const parent = allCategories.find((c: any) => c.id === cat.parentId);
    return parent ? `${getCategoryPath(parent)} › ${cat.name}` : cat.name;
  };

  const handleOpenAdd = () => {
    setForm(emptyForm());
    setEditingId(null);
    setTab("general");
    setIsOpen(true);
  };

  const handleOpenEdit = (cat: any) => {
    setForm({
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon || "",
      imageUrl: cat.imageUrl || "",
      altText: cat.altText || "",
      color: cat.color || "",
      parentId: cat.parentId ?? undefined,
      sortOrder: cat.sortOrder,
      metaTitle: cat.metaTitle || "",
      metaDescription: cat.metaDescription || "",
      active: cat.active,
    });
    setEditingId(cat.id);
    setTab("general");
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      parentId: form.parentId ?? null,
      icon: form.icon || undefined,
      imageUrl: form.imageUrl || undefined,
      altText: form.altText || undefined,
      color: form.color || undefined,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
    };
    const opts = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        setIsOpen(false);
        toast({ title: editingId ? "Category updated" : "Category created" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to save category" }),
    };
    if (editingId) updateMutation.mutate({ id: editingId, data: payload as any }, opts);
    else createMutation.mutate({ data: payload as any }, opts);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this category? Products in it will be uncategorized.")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/categories"] }); toast({ title: "Deleted" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to delete" }),
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const metaTitleLen = form.metaTitle.length;
  const metaDescLen = form.metaDescription.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenAdd}>
              <Plus className="w-4 h-4 mr-2" /> Add Category
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
              <DialogTitle className="text-xl">{editingId ? "Edit Category" : "Add Category"}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 overflow-hidden">
                <TabsList className="mx-6 mt-4 grid grid-cols-2 h-9 flex-shrink-0">
                  <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
                  <TabsTrigger value="seo" className="text-xs">Image &amp; SEO</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                  {/* ── General ── */}
                  <TabsContent value="general" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Name <span className="text-destructive">*</span></Label>
                        <Input
                          required
                          value={form.name}
                          placeholder="e.g. Dry Fruits"
                          onChange={(e) => {
                            const name = e.target.value;
                            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                            setForm(f => ({ ...f, name, slug: f.slug || slug }));
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Slug <span className="text-destructive">*</span></Label>
                        <Input
                          required
                          value={form.slug}
                          placeholder="dry-fruits"
                          onChange={(e) => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Parent Category</Label>
                      <Select
                        value={form.parentId?.toString() ?? "__none__"}
                        onValueChange={(v) => setForm(f => ({ ...f, parentId: v === "__none__" ? undefined : parseInt(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None (top-level)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None (top-level)</SelectItem>
                          {parentOptions.map((c: any) => (
                            <SelectItem key={c.id} value={c.id.toString()}>{getCategoryPath(c)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Leave empty for a main category; select a parent for sub-categories</p>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Icon Name</Label>
                        <Input
                          value={form.icon}
                          placeholder="e.g. 🥜 or almond"
                          onChange={(e) => setForm(f => ({ ...f, icon: e.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">Emoji or icon identifier</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Color</Label>
                        <div className="flex items-center gap-2">
                          <div className="relative w-9 h-9 rounded-lg border overflow-hidden cursor-pointer flex-shrink-0">
                            <input
                              type="color"
                              value={form.color || "#5FA800"}
                              onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                              className="absolute inset-0 w-14 h-14 -translate-x-2 -translate-y-2 cursor-pointer opacity-0"
                            />
                            <div className="w-full h-full rounded-lg" style={{ backgroundColor: form.color || "#e5e7eb" }} />
                          </div>
                          <Input
                            value={form.color}
                            placeholder="#5FA800"
                            onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Sort Order</Label>
                        <Input
                          type="number"
                          min={0}
                          value={form.sortOrder}
                          onChange={(e) => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Switch checked={form.active} onCheckedChange={(c) => setForm(f => ({ ...f, active: c }))} />
                      <Label>Active</Label>
                    </div>
                  </TabsContent>

                  {/* ── Image & SEO ── */}
                  <TabsContent value="seo" className="mt-0 space-y-5">
                    <CategoryImageUploader
                      value={form.imageUrl}
                      altText={form.altText}
                      onImageChange={(v) => setForm(f => ({ ...f, imageUrl: v }))}
                      onAltChange={(v) => setForm(f => ({ ...f, altText: v }))}
                    />

                    <Separator />

                    <div className="flex justify-end mb-1">
                      <AIGenerateButton
                        type="category-description"
                        context={{ name: form.name }}
                        label="Generate SEO (AI)"
                        onResult={(r) => setForm(f => ({
                          ...f,
                          metaTitle: r.metaTitle ?? f.metaTitle,
                          metaDescription: r.metaDescription ?? f.metaDescription,
                        }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Meta Title</Label>
                        <span className={`text-xs ${metaTitleLen > 60 ? "text-destructive" : metaTitleLen > 50 ? "text-orange-500" : "text-muted-foreground"}`}>
                          {metaTitleLen}/60
                        </span>
                      </div>
                      <Input
                        value={form.metaTitle}
                        placeholder={form.name ? `${form.name} — Premium Nuts & Dry Fruits` : "e.g. Cashews — Premium Quality"}
                        onChange={(e) => setForm(f => ({ ...f, metaTitle: e.target.value }))}
                        maxLength={70}
                      />
                      <p className="text-xs text-muted-foreground">Target 50–60 characters for best Google ranking</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>Meta Description</Label>
                        <span className={`text-xs ${metaDescLen > 160 ? "text-destructive" : metaDescLen > 120 ? "text-orange-500" : "text-muted-foreground"}`}>
                          {metaDescLen}/160
                        </span>
                      </div>
                      <Textarea
                        rows={3}
                        value={form.metaDescription}
                        placeholder={form.name ? `Shop premium ${form.name.toLowerCase()} online. Free delivery on orders above Rs. 1,500.` : "Describe this category for search engines…"}
                        onChange={(e) => setForm(f => ({ ...f, metaDescription: e.target.value }))}
                        maxLength={180}
                        className="resize-none"
                      />
                      <p className="text-xs text-muted-foreground">Target 120–160 characters. Shown in Google search results.</p>
                    </div>

                    {(form.metaTitle || form.metaDescription) && (
                      <div className="rounded-xl border bg-muted/30 p-4">
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Google Preview</p>
                        <p className="text-[#1a0dab] text-sm font-medium line-clamp-1 hover:underline cursor-pointer">
                          {form.metaTitle || form.name || "Category Name"}
                        </p>
                        <p className="text-xs text-[#006621] mt-0.5">kdfplus.com/products?category={form.slug || "category-slug"}</p>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {form.metaDescription || "No description yet."}
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20 flex-shrink-0">
                <p className="text-xs text-muted-foreground">
                  {form.parentId ? "Sub-category" : "Top-level category"}
                  {form.imageUrl && " · Has image"}
                  {form.metaTitle && " · SEO set"}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingId ? "Update Category" : "Create Category"}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search categories…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>SEO</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <TableRow key={i}>
                  {[200, 100, 60, 80, 60, 80].map((w, j) => (
                    <TableCell key={j}><Skeleton className={`h-4 w-[${w}px]`} /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length ? (
              filtered.map((cat: any) => {
                const parent = cat.parentId ? allCategories.find((c: any) => c.id === cat.parentId) : null;
                const hasSeo = !!(cat.metaTitle || cat.metaDescription);
                return (
                  <TableRow key={cat.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {cat.color && (
                          <div className="w-3 h-3 rounded-full flex-shrink-0 border" style={{ backgroundColor: cat.color }} />
                        )}
                        <div>
                          <div className="font-medium text-sm">{cat.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{cat.slug}</div>
                        </div>
                        {cat.icon && <span className="text-base ml-1">{cat.icon}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {parent ? (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{parent.name}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {cat.imageUrl ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border bg-muted flex-shrink-0">
                          <img src={getImageUrl(cat.imageUrl)} alt={cat.altText || cat.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg border bg-muted flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasSeo ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">SEO set</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-400">No SEO</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${cat.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500"}`}
                      >
                        {cat.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(cat)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(cat.id)}>
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
                  {search ? `No categories matching "${search}"` : "No categories yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
