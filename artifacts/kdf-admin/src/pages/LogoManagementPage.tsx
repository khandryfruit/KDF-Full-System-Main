import { useState, useRef } from "react";
import { Upload, ImageIcon, Trash2, RefreshCw, Globe, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSiteSettings, useUpdateSiteSettings, requestUploadUrl, uploadFileToGcs } from "@/hooks/useSiteSettings";
import { SiteSeoSettingsPanel, type SiteSeoFormState } from "@/components/seo/SiteSeoSettingsPanel";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const EMPTY_SEO: SiteSeoFormState = {
  metaTitle: "",
  metaDescription: "",
  primaryKeywords: "",
  secondaryKeywords: "",
  longTailKeywords: "",
  ogTitle: "",
  ogDescription: "",
  twitterCardType: "summary_large_image",
  robotsIndex: true,
  schemaOrgEnabled: true,
  schemaBreadcrumbEnabled: true,
  schemaFaqEnabled: false,
};

const LOGO_BASE = "/api/storage";
const ALLOWED_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_MB = 2;

function logoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${LOGO_BASE}${path}`;
}

interface UploadAreaProps {
  label: string;
  description: string;
  currentPath: string | null | undefined;
  onUploaded: (path: string) => void;
  onRemove: () => void;
  badge?: string;
}

function UploadArea({ label, description, currentPath, onUploaded, onRemove, badge }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const url = preview ?? logoUrl(currentPath);

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload PNG, SVG, JPG or WebP.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({ title: "File too large", description: `Max size is ${MAX_SIZE_MB}MB.`, variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl(file);
      await uploadFileToGcs(file, uploadURL);
      const localPreview = URL.createObjectURL(file);
      setPreview(localPreview);
      onUploaded(objectPath);
      toast({ title: "Uploaded successfully", description: "Save settings to apply the change." });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Label className="text-base font-semibold">{label}</Label>
            {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
        {url && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => { setPreview(null); onRemove(); }}
          >
            <Trash2 size={14} className="mr-1" /> Remove
          </Button>
        )}
      </div>

      <div
        className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept={ALLOWED_TYPES.join(",")} className="hidden" onChange={handleChange} />

        {url ? (
          <div className="flex items-center gap-4 p-4">
            <div className="w-20 h-20 rounded-lg border bg-white flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
              <img src={url} alt="logo preview" className="max-w-full max-h-full object-contain p-1" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Current logo</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{currentPath ?? "preview"}</p>
              <p className="text-xs text-primary mt-2 flex items-center gap-1">
                <Upload size={12} /> Click or drag to replace
              </p>
            </div>
            {uploading && <Loader2 size={20} className="animate-spin text-primary shrink-0" />}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
            {uploading ? (
              <Loader2 size={28} className="animate-spin text-primary" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-1">
                <Upload size={22} className="text-muted-foreground" />
              </div>
            )}
            <p className="text-sm font-medium text-foreground">
              {uploading ? "Uploading…" : "Click or drag & drop to upload"}
            </p>
            <p className="text-xs text-muted-foreground">PNG, SVG, JPG, WebP — max {MAX_SIZE_MB}MB</p>
            <p className="text-xs text-muted-foreground">Recommended: 150–250px wide, transparent background</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LogoManagementPage() {
  const { data: settings, isLoading } = useSiteSettings();
  const { mutate: updateSettings, isPending: saving } = useUpdateSiteSettings();
  const { toast } = useToast();

  const [siteName, setSiteName] = useState<string>("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [faviconPath, setFaviconPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [seo, setSeo] = useState<SiteSeoFormState>(EMPTY_SEO);

  // Initialise local state once settings load
  const initialized = useRef(false);
  if (settings && !initialized.current) {
    setSiteName(settings.siteName ?? "KDF NUTS");
    setLogoPath(settings.logoPath ?? null);
    setFaviconPath(settings.faviconPath ?? null);
    setSeo({
      metaTitle: settings.metaTitle ?? "",
      metaDescription: settings.metaDescription ?? "",
      primaryKeywords: settings.primaryKeywords ?? "",
      secondaryKeywords: settings.secondaryKeywords ?? "",
      longTailKeywords: settings.longTailKeywords ?? "",
      ogTitle: settings.ogTitle ?? "",
      ogDescription: settings.ogDescription ?? "",
      twitterCardType: settings.twitterCardType ?? "summary_large_image",
      robotsIndex: settings.robotsIndex ?? true,
      schemaOrgEnabled: settings.schemaOrgEnabled ?? true,
      schemaBreadcrumbEnabled: settings.schemaBreadcrumbEnabled ?? true,
      schemaFaqEnabled: settings.schemaFaqEnabled ?? false,
    });
    initialized.current = true;
  }

  function markDirty() { setDirty(true); }

  function handleSave() {
    updateSettings(
      {
        siteName: siteName || undefined,
        logoPath: logoPath ?? undefined,
        faviconPath: faviconPath ?? undefined,
        ...seo,
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast({ title: "Settings saved", description: "Logo and branding updated successfully." });
        },
        onError: () => {
          toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Website Settings</h1>
        <p className="text-muted-foreground mt-1">
          Branding, logo, favicon, and AI-powered SEO for your storefront homepage.
        </p>
      </div>

      {/* Live preview banner */}
      {(logoPath ?? settings?.logoPath) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 size={18} className="text-green-600 shrink-0" />
          <div className="flex items-center gap-3 flex-1">
            <img
              src={`${LOGO_BASE}${logoPath ?? settings?.logoPath}`}
              alt="logo"
              className="h-8 max-w-[120px] object-contain"
            />
            <div>
              <p className="text-sm font-semibold text-green-800">Logo is active</p>
              <p className="text-xs text-green-600">Displaying on all storefronts</p>
            </div>
          </div>
        </div>
      )}

      {/* Site name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe size={17} className="text-muted-foreground" />
            Site Name
          </CardTitle>
          <CardDescription>Shown in browser tab and as text fallback when logo is not set.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="siteName">Site Name</Label>
            <Input
              id="siteName"
              value={siteName}
              onChange={(e) => { setSiteName(e.target.value); markDirty(); }}
              placeholder="KDF NUTS"
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Logo upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon size={17} className="text-muted-foreground" />
            Website Logo
          </CardTitle>
          <CardDescription>Displays in the header of all storefronts and the mobile app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <UploadArea
            label="Primary Logo"
            description="Header logo across all pages. Best: transparent PNG or SVG, 150–250px wide."
            badge="Recommended"
            currentPath={logoPath ?? settings?.logoPath}
            onUploaded={(p) => { setLogoPath(p); markDirty(); }}
            onRemove={() => { setLogoPath(""); markDirty(); }}
          />

          <Separator />

          <UploadArea
            label="Favicon"
            description="Browser tab icon. Use a square image (32×32 or 64×64px), PNG or ICO format."
            badge="Optional"
            currentPath={faviconPath ?? settings?.faviconPath}
            onUploaded={(p) => { setFaviconPath(p); markDirty(); }}
            onRemove={() => { setFaviconPath(""); markDirty(); }}
          />
        </CardContent>
      </Card>

      <Separator />

      <SiteSeoSettingsPanel
        siteName={siteName}
        form={seo}
        onChange={(patch) => {
          setSeo((s) => ({ ...s, ...patch }));
          markDirty();
        }}
      />

      {/* Guidelines */}
      <Card className="bg-muted/40 border-dashed">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">File guidelines</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Use <strong>PNG or SVG</strong> for transparent backgrounds (best quality)</li>
                <li>Recommended logo width: <strong>150–250px</strong></li>
                <li>Max file size: <strong>2MB</strong></li>
                <li>Supported formats: PNG, SVG, JPG, WebP</li>
                <li>Logo updates are instant — no cache clearing needed</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <p className="text-sm text-muted-foreground">
          {dirty ? (
            <span className="flex items-center gap-1.5 text-amber-600">
              <RefreshCw size={13} className="animate-spin" /> Unsaved changes
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 size={13} /> All changes saved
            </span>
          )}
        </p>
        <Button onClick={handleSave} disabled={saving || !dirty} size="lg" className="min-w-[140px]">
          {saving ? (
            <><Loader2 size={16} className="mr-2 animate-spin" /> Saving…</>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>
    </div>
  );
}
