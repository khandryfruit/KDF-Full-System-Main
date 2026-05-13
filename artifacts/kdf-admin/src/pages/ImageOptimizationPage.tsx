import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Zap, Image as ImageIcon, Maximize2, FileImage,
  CheckCircle2, AlertCircle, Loader2, Info, Save,
  TrendingDown,
} from "lucide-react";
import { API_BASE } from "@/lib/apiBase";

interface ImageOptSettings {
  enabled: boolean;
  convertToWebP: boolean;
  quality: number;
  maxWidthPx: number;
  generateThumbs: boolean;
  thumbWidthPx: number;
}

const DEFAULTS: ImageOptSettings = {
  enabled: true,
  convertToWebP: true,
  quality: 82,
  maxWidthPx: 1200,
  generateThumbs: false,
  thumbWidthPx: 300,
};

function getAuthHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("kdf_admin_token") ?? ""}` };
}

export default function ImageOptimizationPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ImageOptSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testResult, setTestResult] = useState<{
    objectPath: string;
    originalSize: number;
    processedSize: number;
    savedBytes: number;
    savedPct: number;
    contentType: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/image-settings", { headers: getAuthHeader() })
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .then((data) => setSettings({ ...DEFAULTS, ...data }))
      .catch(() => setSettings(DEFAULTS))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/image-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: "Settings saved!", description: "Image optimization settings updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!testFile) return;
    setTesting(true);
    setTestResult(null);
    try {
      const fd = new FormData();
      fd.append("file", testFile);
      const r = await fetch(`${API_BASE}/api/storage/uploads/image`, {
        method: "POST",
        headers: getAuthHeader(),
        body: fd,
      });
      if (!r.ok) throw new Error("Upload failed");
      const data = await r.json();
      setTestResult(data);
      toast({ title: "Test complete!", description: `Saved ${data.savedPct}% (${formatBytes(data.savedBytes)})` });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const set = <K extends keyof ImageOptSettings>(key: K, val: ImageOptSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#5FA800]" />
            Image Optimization
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-convert, compress and resize product images for faster page loads.
          </p>
        </div>
        <Button onClick={save} disabled={saving} style={{ backgroundColor: "#5FA800" }} className="text-white gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
      </div>

      {/* Master toggle */}
      <div className={`rounded-2xl border p-5 transition-all ${settings.enabled ? "border-[#5FA800]/30 bg-[#5FA800]/5" : "border-border bg-muted/20"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.enabled ? "bg-[#5FA800] text-white" : "bg-muted text-muted-foreground"}`}>
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Auto Optimization</p>
              <p className="text-xs text-muted-foreground">Process all uploaded images automatically</p>
            </div>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>
        {!settings.enabled && (
          <div className="mt-4 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Optimization is disabled — images will be stored as-is.
          </div>
        )}
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* WebP Conversion */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <FileImage className="w-4 h-4 text-[#5FA800]" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Convert to WebP</p>
              <p className="text-xs text-muted-foreground">PNG and JPG → WebP (30–50% smaller)</p>
            </div>
            <Switch
              checked={settings.convertToWebP}
              onCheckedChange={(v) => set("convertToWebP", v)}
              disabled={!settings.enabled}
            />
          </div>
          {settings.convertToWebP && settings.enabled && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#5FA800] bg-[#5FA800]/5 px-2.5 py-1.5 rounded-lg">
              <CheckCircle2 className="w-3 h-3" />
              PNG &amp; JPG will be converted. WebP and SVG kept as-is.
            </div>
          )}
        </div>

        {/* Thumbnail generation */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <ImageIcon className="w-4 h-4 text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Generate Thumbnails</p>
              <p className="text-xs text-muted-foreground">Extra small version for listings</p>
            </div>
            <Switch
              checked={settings.generateThumbs}
              onCheckedChange={(v) => set("generateThumbs", v)}
              disabled={!settings.enabled}
            />
          </div>
          {settings.generateThumbs && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Thumbnail width: {settings.thumbWidthPx}px</Label>
              <Slider
                min={100} max={600} step={50}
                value={[settings.thumbWidthPx]}
                onValueChange={([v]) => set("thumbWidthPx", v)}
                disabled={!settings.enabled}
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Quality control */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <TrendingDown className="w-4 h-4 text-orange-500" />
          <div>
            <p className="text-sm font-semibold">Compression Quality</p>
            <p className="text-xs text-muted-foreground">Higher = better quality, larger file. Recommended: 80–85%</p>
          </div>
          <Badge variant="outline" className="ml-auto font-mono text-sm px-3">
            {settings.quality}%
          </Badge>
        </div>
        <Slider
          min={40} max={100} step={1}
          value={[settings.quality]}
          onValueChange={([v]) => set("quality", v)}
          disabled={!settings.enabled}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>40% — Max compression</span>
          <span className="text-[#5FA800] font-semibold">80–85% recommended</span>
          <span>100% — No compression</span>
        </div>
      </div>

      {/* Max width */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Maximize2 className="w-4 h-4 text-purple-500" />
          <div>
            <p className="text-sm font-semibold">Max Image Width</p>
            <p className="text-xs text-muted-foreground">Images wider than this are resized (aspect ratio preserved)</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Input
              type="number"
              min={400} max={4000} step={100}
              value={settings.maxWidthPx}
              onChange={(e) => set("maxWidthPx", Number(e.target.value))}
              disabled={!settings.enabled}
              className="w-24 h-8 text-sm text-right"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </div>
        <Slider
          min={400} max={3000} step={100}
          value={[settings.maxWidthPx]}
          onValueChange={([v]) => set("maxWidthPx", v)}
          disabled={!settings.enabled}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>400px</span>
          <span className="text-[#5FA800] font-semibold">1200px recommended</span>
          <span>3000px</span>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-1 leading-relaxed">
          <p className="font-semibold">How it works</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>When you upload a product image, the server automatically processes it before saving.</li>
            <li>PNG and JPG are converted to WebP — the modern format used by Google, Amazon, and Daraz.</li>
            <li>Images wider than {settings.maxWidthPx}px are resized to exactly {settings.maxWidthPx}px width.</li>
            <li>If processing fails for any reason, the original image is saved as a safe fallback.</li>
            <li>SVG and GIF files are never modified.</li>
          </ul>
        </div>
      </div>

      {/* Live test */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Zap className="w-4 h-4 text-[#5FA800]" />
          <p className="text-sm font-semibold">Test Image Optimization</p>
        </div>
        <p className="text-xs text-muted-foreground">Upload a test image to see how much it gets optimized with the current settings.</p>
        <div className="flex items-center gap-3">
          <label className="flex-1">
            <div className="border-2 border-dashed border-border rounded-xl px-4 py-3 text-center cursor-pointer hover:border-[#5FA800]/50 transition-colors">
              {testFile ? (
                <p className="text-sm font-medium truncate">{testFile.name} — {formatBytes(testFile.size)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Click to select image…</p>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { setTestFile(e.target.files?.[0] ?? null); setTestResult(null); }}
            />
          </label>
          <Button
            onClick={runTest}
            disabled={!testFile || testing}
            style={testFile && !testing ? { backgroundColor: "#5FA800" } : {}}
            className="text-white gap-2 shrink-0"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {testing ? "Processing…" : "Test"}
          </Button>
        </div>

        {testResult && (
          <div className="bg-[#5FA800]/5 border border-[#5FA800]/20 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-[#5FA800]">✅ Test passed!</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Original", value: formatBytes(testResult.originalSize), color: "text-muted-foreground" },
                { label: "Optimized", value: formatBytes(testResult.processedSize), color: "text-[#5FA800] font-bold" },
                { label: "Saved", value: formatBytes(testResult.savedBytes), color: "text-green-600 font-bold" },
                { label: "Reduction", value: `${testResult.savedPct}%`, color: "text-green-600 font-bold" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl p-3 text-center border border-[#5FA800]/10">
                  <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                  <p className={`text-sm ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Output format: <span className="font-semibold">{testResult.contentType}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
