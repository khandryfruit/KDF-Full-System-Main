import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBlogPosts,
  useCreateBlogPost,
  useUpdateBlogPost,
  useDeleteBlogPost,
  getListBlogPostsQueryKey,
} from "@workspace/api-client-react";
import type { BlogPost } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { AIGenerateWithPreview, AIGenerateButton } from "@/components/AIGenerateButton";
import { RichDescriptionEditor } from "@/components/RichDescriptionEditor";
import { uploadFile } from "@/lib/upload";
import { MediaPicker } from "@/components/media/MediaPicker";
import { getProductImageSrc } from "@/lib/imageUrl";

const EMPTY_FORM = {
  title: "",
  slug: "",
  content: "",
  excerpt: "",
  featuredImagePath: "",
  metaTitle: "",
  metaDescription: "",
  keywords: "",
  tags: "",
  status: "draft" as "draft" | "published",
};

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function FeaturedImageUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const path = await uploadFile(file, "blog");
      onChange(path);
    } catch {
      // silently ignore
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Featured Image</Label>
        <Button type="button" size="sm" variant="outline" onClick={() => setLibraryOpen(true)}>
          <ImageIcon className="h-3.5 w-3.5 mr-1" /> Media Library
        </Button>
      </div>
      <MediaPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        folderSlug="blogs"
        title="Choose featured image"
        onSelect={(path) => onChange(path)}
      />
      {value ? (
        <div className="relative rounded-lg overflow-hidden border">
          <img
            src={getProductImageSrc(value)}
            alt="Featured"
            className="w-full h-40 object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={() => onChange("")}
          >
            Remove
          </Button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {uploading ? "Uploading…" : "Click to upload featured image"}
          </p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

function BlogPostForm({
  initial,
  isEditing,
  onSubmit,
  isPending,
}: {
  initial: typeof EMPTY_FORM;
  isEditing: boolean;
  onSubmit: (data: typeof EMPTY_FORM) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(initial);

  function set(key: keyof typeof EMPTY_FORM, val: string) {
    setForm((prev) => {
      const updated = { ...prev, [key]: val };
      if (key === "title" && !isEditing) {
        updated.slug = slugify(val);
        if (!updated.metaTitle) updated.metaTitle = val;
      }
      return updated;
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-5"
    >
      <Tabs defaultValue="content">
        <TabsList className="w-full">
          <TabsTrigger value="content" className="flex-1">Content</TabsTrigger>
          <TabsTrigger value="seo" className="flex-1">SEO & Meta</TabsTrigger>
          <TabsTrigger value="image" className="flex-1">Image</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <AIGenerateWithPreview
              type="blog-post"
              context={{ name: form.title, keywords: form.keywords }}
              label="Generate Blog with AI"
              onResult={(r) => {
                if (r.title) set("title", r.title);
                if (r.content) set("content", r.content);
                if (r.excerpt) set("excerpt", r.excerpt);
                if (r.metaTitle) set("metaTitle", r.metaTitle);
                if (r.metaDescription) set("metaDescription", r.metaDescription);
                if (r.keywords) set("keywords", r.keywords);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Post title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                required
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="post-url-slug"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea
              id="excerpt"
              rows={2}
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              placeholder="Short summary shown in listings…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Content *</Label>
            <RichDescriptionEditor
              value={form.content}
              onChange={(v) => set("content", v)}
              productName={form.title}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="seo, nutrition, health (comma-separated)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as "draft" | "published")}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <AIGenerateButton
              type="product-seo"
              context={{ name: form.title, keywords: form.keywords }}
              label="Generate SEO (AI)"
              onResult={(r) => {
                if (r.metaTitle) set("metaTitle", r.metaTitle);
                if (r.metaDescription) set("metaDescription", r.metaDescription);
                if (r.keywords) set("keywords", r.keywords);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaTitle">Meta Title</Label>
            <Input
              id="metaTitle"
              value={form.metaTitle}
              onChange={(e) => set("metaTitle", e.target.value)}
              placeholder="SEO page title (50-60 chars recommended)"
            />
            <p className="text-xs text-muted-foreground">{form.metaTitle.length}/60 characters</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaDesc">Meta Description</Label>
            <Textarea
              id="metaDesc"
              rows={3}
              value={form.metaDescription}
              onChange={(e) => set("metaDescription", e.target.value)}
              placeholder="Brief description for search results (150-160 chars recommended)"
            />
            <p className="text-xs text-muted-foreground">{form.metaDescription.length}/160 characters</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="keywords">Keywords</Label>
            <Input
              id="keywords"
              value={form.keywords}
              onChange={(e) => set("keywords", e.target.value)}
              placeholder="keyword1, keyword2, keyword3"
            />
          </div>
          <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
            <p className="font-medium text-muted-foreground">Google Preview</p>
            <p className="text-blue-600 font-medium truncate">
              {form.metaTitle || form.title || "Post Title"}
            </p>
            <p className="text-green-700 text-xs">/blog/{form.slug || "post-slug"}</p>
            <p className="text-gray-600 text-xs line-clamp-2">
              {form.metaDescription || form.excerpt || "No description provided"}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="image" className="mt-4">
          <FeaturedImageUploader
            value={form.featuredImagePath}
            onChange={(p) => set("featuredImagePath", p)}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Post"}
        </Button>
      </div>
    </form>
  );
}

export default function BlogPostsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");

  const { data, isLoading } = useListBlogPosts(
    statusFilter !== "all" ? { status: statusFilter } : {}
  );
  const createMutation = useCreateBlogPost();
  const updateMutation = useUpdateBlogPost();
  const deleteMutation = useDeleteBlogPost();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListBlogPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListBlogPostsQueryKey({ status: "published" }) });
    queryClient.invalidateQueries({ queryKey: getListBlogPostsQueryKey({ status: "draft" }) });
  }

  async function handleSubmit(data: typeof EMPTY_FORM) {
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: {
            title: data.title,
            slug: data.slug,
            content: data.content,
            excerpt: data.excerpt || undefined,
            featuredImagePath: data.featuredImagePath || undefined,
            metaTitle: data.metaTitle || undefined,
            metaDescription: data.metaDescription || undefined,
            keywords: data.keywords || undefined,
            tags: data.tags || undefined,
            status: data.status,
          },
        });
        toast({ title: "Post updated" });
      } else {
        await createMutation.mutateAsync({
          data: {
            title: data.title,
            slug: data.slug,
            content: data.content,
            excerpt: data.excerpt || undefined,
            featuredImagePath: data.featuredImagePath || undefined,
            metaTitle: data.metaTitle || undefined,
            metaDescription: data.metaDescription || undefined,
            keywords: data.keywords || undefined,
            tags: data.tags || undefined,
            status: data.status,
          },
        });
        toast({ title: "Post created" });
      }
      invalidate();
      setOpen(false);
      setEditing(null);
    } catch (err: any) {
      toast({
        title: err?.message ?? "Failed to save post",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast({ title: "Post deleted" });
      invalidate();
    } catch {
      toast({ title: "Failed to delete post", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  }

  const posts = data?.posts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Blog / Posts</h1>
          <p className="text-muted-foreground mt-1">
            Manage blog content to improve SEO and organic traffic.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Post
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {(["all", "published", "draft"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
        <span className="text-sm text-muted-foreground ml-2">
          {data?.total ?? 0} post{data?.total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Posts list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-xl">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No posts yet. Create your first blog post.</p>
          <Button
            className="mt-4 gap-2"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Create Post
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex items-start gap-4 p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors"
            >
              {post.featuredImagePath ? (
                <img
                  src={`/api/storage${post.featuredImagePath}`}
                  alt={post.title}
                  className="w-20 h-14 rounded-lg object-cover shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-20 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium truncate">{post.title}</h3>
                  <Badge
                    variant={post.status === "published" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {post.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  /blog/{post.slug}
                  {post.tags && (
                    <span className="ml-2 text-muted-foreground/70">
                      #{post.tags.split(",").map((t) => t.trim()).join(" #")}
                    </span>
                  )}
                </p>
                {post.excerpt && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                    {post.excerpt}
                  </p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {new Date(post.createdAt ?? Date.now()).toLocaleDateString()} · {post.views} views
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {post.status === "published" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Preview"
                    onClick={() => window.open(`/blog/${post.slug}`, "_blank")}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(post);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(post.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Post" : "New Blog Post"}</DialogTitle>
          </DialogHeader>
          <BlogPostForm
            initial={
              editing
                ? {
                    title: editing.title,
                    slug: editing.slug,
                    content: editing.content,
                    excerpt: editing.excerpt ?? "",
                    featuredImagePath: editing.featuredImagePath ?? "",
                    metaTitle: editing.metaTitle ?? "",
                    metaDescription: editing.metaDescription ?? "",
                    keywords: editing.keywords ?? "",
                    tags: editing.tags ?? "",
                    status: editing.status as "draft" | "published",
                  }
                : EMPTY_FORM
            }
            isEditing={!!editing}
            onSubmit={handleSubmit}
            isPending={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The post will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
