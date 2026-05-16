import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, ImageIcon, Search, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  fetchMediaFolders,
  fetchMediaList,
  mediaSrc,
  uploadMediaFile,
  type MediaAsset,
  type MediaFolder,
} from "@/lib/mediaApi";

export interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (objectPath: string, asset?: MediaAsset) => void;
  folderSlug?: string;
  title?: string;
  multiple?: boolean;
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  folderSlug = "general",
  title = "Choose image",
  multiple = false,
}: MediaPickerProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState(folderSlug);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [tab, setTab] = useState<"library" | "upload">("library");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMediaList({
        folderSlug: activeFolder,
        search: search.trim() || undefined,
        limit: 60,
        sort: "newest",
      });
      setItems(data.items);
    } catch {
      toast({ variant: "destructive", title: "Could not load media library" });
    } finally {
      setLoading(false);
    }
  }, [activeFolder, search, toast]);

  useEffect(() => {
    if (!open) return;
    setActiveFolder(folderSlug);
    fetchMediaFolders().then(setFolders).catch(() => {});
    load();
  }, [open, folderSlug, load]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadMediaFile(file, { folderSlug: activeFolder });
        if (!multiple) {
          onSelect(result.objectPath, result.asset);
          onOpenChange(false);
          return;
        }
      }
      await load();
      setTab("library");
      toast({ title: "Uploaded", description: `${files.length} file(s) added to library` });
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

  const confirmPick = () => {
    if (!selected) return;
    onSelect(selected.objectPath, selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "library" | "upload")} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 flex items-center gap-3 border-b pb-3">
            <TabsList>
              <TabsTrigger value="library">Media Library</TabsTrigger>
              <TabsTrigger value="upload">Upload New</TabsTrigger>
            </TabsList>
            {tab === "library" && (
              <div className="flex-1 flex gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search filename, tags…"
                    className="pl-9 h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && load()}
                  />
                </div>
                <Button size="sm" variant="secondary" onClick={load}>Search</Button>
              </div>
            )}
          </div>

          <TabsContent value="library" className="flex-1 flex flex-col min-h-0 mt-0 px-6 pb-2 data-[state=inactive]:hidden">
            <div className="flex gap-2 flex-wrap py-2 max-h-24 overflow-y-auto">
              {folders.map((f) => (
                <Button
                  key={f.slug}
                  size="sm"
                  variant={activeFolder === f.slug ? "default" : "outline"}
                  onClick={() => setActiveFolder(f.slug)}
                >
                  {f.name}
                </Button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[50vh] border rounded-lg bg-muted/30 p-3">
              {loading ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <ImageIcon className="h-10 w-10 opacity-40" />
                  <p className="text-sm">No images in this folder yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                  {items.map((item) => {
                    const thumb = item.variants?.thumbnail?.path ?? item.objectPath;
                    const isSel = selected?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelected(item)}
                        onDoubleClick={() => {
                          onSelect(item.objectPath, item);
                          onOpenChange(false);
                        }}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSel ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/50"
                        }`}
                      >
                        <img
                          src={mediaSrc(thumb)}
                          alt={item.altText ?? item.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isSel && (
                          <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        {item.tags?.length > 0 && (
                          <Badge className="absolute bottom-1 left-1 text-[9px] px-1 py-0 max-w-[90%] truncate">
                            {item.tags[0]}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 py-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!selected} onClick={confirmPick}>Use selected image</Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-0 px-6 pb-6 data-[state=inactive]:hidden">
            <div
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                handleUpload(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple={multiple}
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              {uploading ? (
                <Loader2 className="h-10 w-10 mx-auto animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">Drag & drop or click to upload</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Auto WebP/AVIF · 5 responsive sizes · Folder: {activeFolder}
                  </p>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
