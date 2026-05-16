import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, Search, Trash2, Tag, FolderOpen, Loader2, ImageIcon,
  AlertTriangle, HardDrive, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  deleteMediaAsset,
  fetchMediaFolders,
  fetchMediaList,
  fetchMediaUsage,
  mediaSrc,
  updateMediaAsset,
  uploadMediaBulk,
  type MediaAsset,
  type MediaFolder,
  type MediaUsageRef,
} from "@/lib/mediaApi";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MediaLibraryPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("products");
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [usage, setUsage] = useState<MediaUsageRef[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForce, setDeleteForce] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMediaList({
        folderSlug: activeFolder,
        search: search.trim() || undefined,
        tags: tagFilter.trim() || undefined,
        page,
        limit: 48,
        sort: "newest",
      });
      setItems(data.items);
      setTotal(data.total);
    } catch {
      toast({ variant: "destructive", title: "Failed to load media" });
    } finally {
      setLoading(false);
    }
  }, [activeFolder, search, tagFilter, page, toast]);

  useEffect(() => {
    fetchMediaFolders().then(setFolders).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setUsage([]); return; }
    setTagInput((selected.tags ?? []).join(", "));
    fetchMediaUsage(selected.id).then(setUsage).catch(() => setUsage([]));
  }, [selected?.id]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!list.length) {
        toast({ variant: "destructive", title: "No valid images selected" });
        return;
      }
      const result = await uploadMediaBulk(list, { folderSlug: activeFolder });
      toast({
        title: "Upload complete",
        description: `${result.ok} uploaded, ${result.duplicate} duplicates reused, ${result.failed} failed`,
      });
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setUploading(false);
    }
  };

  const saveTags = async () => {
    if (!selected) return;
    const tags = tagInput.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    try {
      const updated = await updateMediaAsset(selected.id, { tags });
      setSelected(updated);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      toast({ title: "Tags saved" });
    } catch {
      toast({ variant: "destructive", title: "Could not save tags" });
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await deleteMediaAsset(selected.id, deleteForce);
      toast({ title: "Deleted" });
      setSelected(null);
      setDeleteOpen(false);
      await load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Cannot delete",
        description: e instanceof Error ? e.message : "Image may be in use",
      });
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-7 w-7 text-primary" />
            Media Library
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload once, reuse everywhere. Auto WebP/AVIF + 5 responsive sizes.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload images
          </Button>
          <Button size="sm" variant="secondary" onClick={() => folderInputRef.current?.click()} disabled={uploading}>
            Folder upload
          </Button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => handleFiles(e.target.files)} />
      <input ref={folderInputRef} type="file" accept="image/*" multiple className="hidden"
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => handleFiles(e.target.files)} />

      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">Drag & drop hundreds of images here</p>
        <p className="text-xs text-muted-foreground">Bulk upload · Duplicate detection · Auto compression</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar folders */}
        <aside className="lg:w-52 shrink-0 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">Folders</p>
          {folders.map((f) => (
            <button
              key={f.slug}
              type="button"
              onClick={() => { setActiveFolder(f.slug); setPage(1); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                activeFolder === f.slug
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted"
              }`}
            >
              {f.name}
            </button>
          ))}
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search filename, alt text…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
            </div>
            <Input
              placeholder="Filter by tag"
              className="w-40"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
            <Button onClick={() => { setPage(1); load(); }}>Search</Button>
          </div>

          <p className="text-xs text-muted-foreground">{total} assets in {activeFolder}</p>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto opacity-30 mb-3" />
              <p>No media in this folder</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3">
              {items.map((item) => {
                const thumb = item.variants?.thumbnail?.path ?? item.objectPath;
                const isSel = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className={`group relative aspect-square rounded-xl overflow-hidden border-2 bg-muted transition-all ${
                      isSel ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-primary/40"
                    }`}
                  >
                    <img src={mediaSrc(thumb)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white truncate">{item.originalFilename}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {total > 48 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm self-center">Page {page}</span>
              <Button variant="outline" size="sm" disabled={page * 48 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="lg:w-80 shrink-0 border rounded-xl p-4 space-y-4 h-fit sticky top-4">
            <img
              src={mediaSrc(selected.variants?.medium?.path ?? selected.objectPath)}
              alt=""
              className="w-full rounded-lg aspect-video object-cover bg-muted"
            />
            <div>
              <p className="font-medium text-sm truncate">{selected.originalFilename}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <HardDrive className="h-3 w-3" />
                {formatBytes(selected.originalSize)} → {formatBytes(selected.processedSize)}
                {selected.width && ` · ${selected.width}×${selected.height}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Tag className="h-3 w-3" /> Tags (comma-separated)</Label>
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="badam, eid, banner" />
              <Button size="sm" variant="secondary" className="w-full" onClick={saveTags}>Save tags</Button>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Responsive variants</p>
              <div className="flex flex-wrap gap-1">
                {Object.keys(selected.variants ?? {}).map((k) => (
                  <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Used in ({usage.length})
              </p>
              {usage.length === 0 ? (
                <p className="text-xs text-muted-foreground">Not linked to any entity yet</p>
              ) : (
                <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
                  {usage.map((u, i) => (
                    <li key={i} className="text-muted-foreground">{u.label}</li>
                  ))}
                </ul>
              )}
            </div>

            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => { setDeleteForce(false); setDeleteOpen(true); }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </aside>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              {usage.length > 0 ? (
                <>
                  This image is used in <strong>{usage.length}</strong> place(s):
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {usage.slice(0, 8).map((u, i) => <li key={i}>{u.label}</li>)}
                    {usage.length > 8 && <li>…and {usage.length - 8} more</li>}
                  </ul>
                  <p className="mt-2">Remove links first, or force delete (may break those pages).</p>
                </>
              ) : (
                "This image is not linked anywhere. It will be removed from the library."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {usage.length > 0 && (
              <Button variant="outline" onClick={() => { setDeleteForce(true); handleDelete(); }}>
                Force delete
              </Button>
            )}
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {usage.length > 0 ? "Delete anyway" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
