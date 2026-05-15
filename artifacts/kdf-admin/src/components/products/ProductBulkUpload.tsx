import React, { useRef, useState, useEffect } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle,
  Loader2, Eye, Info, Building2, ShoppingBag, Package, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiPublicUrl } from "@/lib/apiBase";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

type PreviewRow = {
  rowNum: number;
  productName: string;
  sku: string;
  category?: string;
  brand?: string;
  salePrice: number;
  purchasePrice?: number | null;
  stock: number;
  branch: string;
  unit: string;
  tax?: string;
  barcode?: string;
  metaTitle?: string;
  slug?: string;
};

type PreviewData = {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  warningCount: number;
  vyaparDetected?: boolean;
  duplicateSkuInFile?: string[];
  newCategories?: string[];
  newBrands?: string[];
  preview: PreviewRow[];
  invalid: { rowNum: number; errors: string[] }[];
  warnings: { rowNum: number; sku: string; messages: string[] }[];
};

type ImportResult = {
  jobId?: number;
  totalItems: number;
  successCount: number;
  failedCount: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  vyaparDetected?: boolean;
  canRollback?: boolean;
  errors: string[];
};

type Props = {
  compact?: boolean;
  onSuccess?: () => void;
};

export function ProductBulkUpload({ compact = false, onSuccess }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const [syncEcommerce, setSyncEcommerce] = useState(true);
  const [syncBranches, setSyncBranches] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [autoCreateCategories, setAutoCreateCategories] = useState(true);
  const [generateSeo, setGenerateSeo] = useState(true);

  const authHeaders = () => ({ Authorization: `Bearer ${ADMIN_TOKEN()}` });

  const pickFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      toast({ variant: "destructive", title: "Use CSV or Excel (.csv, .xlsx)" });
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
    setImportProgress(0);
  };

  const downloadTemplate = async (format: "csv" | "xlsx") => {
    const res = await fetch(apiPublicUrl(`/api/admin/import/catalog/template?format=${format}`), {
      headers: authHeaders(),
    });
    if (!res.ok) { toast({ variant: "destructive", title: "Template download failed" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kdf-catalog-template.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runPreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiPublicUrl("/api/admin/import/catalog/preview"), {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data);
      toast({
        title: data.vyaparDetected ? "Vyapar file detected" : "Preview ready",
        description: `${data.validCount} valid · ${data.invalidCount} errors · ${data.warningCount} warnings`,
      });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Preview failed" });
    } finally {
      setPreviewing(false);
    }
  };

  const pollJob = async (jobId: number, total: number) => {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 800));
      const res = await fetch(apiPublicUrl(`/api/admin/import/catalog/job/${jobId}`), {
        headers: authHeaders(),
      });
      if (!res.ok) continue;
      const job = await res.json();
      if (job.totalItems && job.successCount != null) {
        const pct = Math.min(99, Math.round((job.successCount / Math.max(total, 1)) * 100));
        setImportProgress(pct);
      }
      if (job.status === "completed" || job.status === "failed") {
        setImportProgress(100);
        return job;
      }
    }
    return null;
  };

  const runImport = async () => {
    if (!file) return;
    setImporting(true);
    setImportProgress(5);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("syncEcommerce", String(syncEcommerce));
      form.append("syncBranches", String(syncBranches));
      form.append("skipDuplicates", String(skipDuplicates));
      form.append("autoCreateCategories", String(autoCreateCategories));
      form.append("generateSeo", String(generateSeo));

      const res = await fetch(apiPublicUrl("/api/admin/import/catalog"), {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      if (data.jobId && data.totalItems > 100) {
        await pollJob(data.jobId, data.totalItems);
      } else {
        setImportProgress(100);
      }

      setResult(data);
      toast({
        title: "Import complete",
        description: `${data.successCount} ok · ${data.createdCount ?? 0} new · ${data.updatedCount ?? 0} updated`,
      });
      onSuccess?.();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setImporting(false);
    }
  };

  const runRollback = async () => {
    if (!result?.jobId) return;
    setRollingBack(true);
    try {
      const res = await fetch(apiPublicUrl(`/api/admin/import/catalog/rollback/${result.jobId}`), {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Rollback failed");
      toast({
        title: "Import rolled back",
        description: `Removed ${data.deletedEcommerce} products, restored ${data.restoredEcommerce} updates`,
      });
      setResult(null);
      onSuccess?.();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Rollback failed" });
    } finally {
      setRollingBack(false);
    }
  };

  useEffect(() => {
    if (!importing && importProgress >= 100) {
      const t = setTimeout(() => setImportProgress(0), 2000);
      return () => clearTimeout(t);
    }
  }, [importing, importProgress]);

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!compact && (
        <div className="rounded-xl border bg-gradient-to-br from-emerald-50/80 to-white p-5 dark:from-emerald-950/20">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            Vyapar &amp; Catalog Import
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload Vyapar export (Excel/CSV). Maps item name, item code, prices, stock, GST, barcode, and images.
            Syncs website, branches, and POS. SEO and categories are auto-created.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="gap-1"><ShoppingBag className="w-3 h-3" /> E-commerce</Badge>
            <Badge variant="outline" className="gap-1"><Building2 className="w-3 h-3" /> Branches</Badge>
            <Badge variant="outline">POS</Badge>
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
        onClick={() => fileRef.current?.click()}
        onKeyDown={e => { if (e.key === "Enter") fileRef.current?.click(); }}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        } ${file ? "border-emerald-400 bg-emerald-50/50" : ""}`}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet className="w-10 h-10 text-emerald-600" />
            <p className="font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="w-10 h-10 opacity-40" />
            <p className="font-medium">Drop Vyapar / Excel / CSV or click to browse</p>
            <p className="text-xs">Max 15MB · thousands of rows supported</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">Template:</span>
        <button type="button" onClick={() => downloadTemplate("csv")} className="text-primary font-semibold hover:underline">CSV</button>
        <span>·</span>
        <button type="button" onClick={() => downloadTemplate("xlsx")} className="text-primary font-semibold hover:underline">Excel</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm border rounded-lg p-4 bg-muted/20">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="sync-ec">Sync e-commerce</Label>
          <Switch id="sync-ec" checked={syncEcommerce} onCheckedChange={setSyncEcommerce} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="sync-br">Sync branches / POS</Label>
          <Switch id="sync-br" checked={syncBranches} onCheckedChange={setSyncBranches} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="auto-cat">Auto-create categories</Label>
          <Switch id="auto-cat" checked={autoCreateCategories} onCheckedChange={setAutoCreateCategories} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="seo">Auto SEO (title, slug, keywords)</Label>
          <Switch id="seo" checked={generateSeo} onCheckedChange={setGenerateSeo} />
        </div>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <Label htmlFor="skip-dup" className="text-muted-foreground">Skip existing SKUs (do not update)</Label>
          <Switch id="skip-dup" checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!file || previewing} onClick={runPreview} className="gap-2">
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Preview &amp; validate
        </Button>
        <Button type="button" disabled={!file || importing} onClick={runImport} className="gap-2">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Import products
        </Button>
        {result?.canRollback && result.jobId && (
          <Button type="button" variant="destructive" disabled={rollingBack} onClick={runRollback} className="gap-2">
            {rollingBack ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Undo import
          </Button>
        )}
      </div>

      {(importing || importProgress > 0) && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Import progress</span>
            <span>{importProgress}%</span>
          </div>
          <Progress value={importProgress} className="h-2" />
        </div>
      )}

      {preview && (
        <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-semibold flex-wrap">
            <Eye className="w-4 h-4" /> Preview
            {preview.vyaparDetected && <Badge variant="secondary">Vyapar format</Badge>}
            <Badge className="bg-emerald-600">{preview.validCount} valid</Badge>
            {preview.invalidCount > 0 && <Badge variant="destructive">{preview.invalidCount} errors</Badge>}
            {preview.warningCount > 0 && <Badge variant="outline" className="text-amber-700">{preview.warningCount} warnings</Badge>}
          </div>

          {(preview.duplicateSkuInFile?.length ?? 0) > 0 && (
            <p className="text-xs text-amber-700">
              Duplicate SKUs in file: {preview.duplicateSkuInFile!.slice(0, 5).join(", ")}
              {preview.duplicateSkuInFile!.length > 5 ? "…" : ""}
            </p>
          )}
          {preview.newCategories?.length ? (
            <p className="text-xs text-muted-foreground">New categories: {preview.newCategories.slice(0, 6).join(", ")}</p>
          ) : null}

          {preview.invalid.length > 0 && (
            <div className="max-h-24 overflow-y-auto text-xs text-red-600 space-y-1">
              {preview.invalid.slice(0, 10).map((inv, i) => (
                <div key={i}>Row {inv.rowNum}: {inv.errors.join(", ")}</div>
              ))}
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="max-h-20 overflow-y-auto text-xs text-amber-700 space-y-1">
              {preview.warnings.slice(0, 6).map((w, i) => (
                <div key={i}>Row {w.rowNum} ({w.sku}): {w.messages.join("; ")}</div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left py-1 pr-2">Product</th>
                  <th className="text-left py-1 pr-2">SKU</th>
                  <th className="text-left py-1 pr-2">Category</th>
                  <th className="text-right py-1 pr-2">Price</th>
                  <th className="text-right py-1 pr-2">Stock</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.slice(0, 15).map(r => (
                  <tr key={r.rowNum} className="border-b border-border/50">
                    <td className="py-1.5 pr-2">{r.rowNum}</td>
                    <td className="py-1.5 pr-2 font-medium max-w-[140px] truncate">{r.productName}</td>
                    <td className="py-1.5 pr-2 font-mono">{r.sku}</td>
                    <td className="py-1.5 pr-2">{r.category || "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{r.salePrice}</td>
                    <td className="py-1.5 pr-2 text-right">{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border p-4 space-y-3 ${result.failedCount === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-2">
            {result.failedCount === 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
            <span className="font-semibold text-sm">Import summary</span>
            {result.vyaparDetected && <Badge variant="secondary" className="text-xs">Vyapar</Badge>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-white rounded-lg p-2 border"><div className="text-xl font-bold">{result.totalItems}</div><div className="text-[10px] text-muted-foreground">Rows</div></div>
            <div className="bg-white rounded-lg p-2 border border-emerald-200"><div className="text-xl font-bold text-emerald-600">{result.successCount}</div><div className="text-[10px] text-muted-foreground">Success</div></div>
            <div className="bg-white rounded-lg p-2 border"><div className="text-xl font-bold text-blue-600">{result.createdCount ?? 0}</div><div className="text-[10px] text-muted-foreground">Created</div></div>
            <div className="bg-white rounded-lg p-2 border"><div className="text-xl font-bold text-violet-600">{result.updatedCount ?? 0}</div><div className="text-[10px] text-muted-foreground">Updated</div></div>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-28 overflow-y-auto text-xs text-red-600">
              {result.errors.slice(0, 20).map((e, i) => (
                <div key={i} className="flex gap-1 py-0.5"><XCircle className="w-3 h-3 shrink-0 mt-0.5" />{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
