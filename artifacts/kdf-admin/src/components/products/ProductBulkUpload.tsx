import React, { useRef, useState } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle,
  Loader2, Eye, Info, Building2, ShoppingBag, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiPublicUrl } from "@/lib/apiBase";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

type PreviewRow = {
  rowNum: number;
  productName: string;
  sku: string;
  salePrice: number;
  stock: number;
  branch: string;
  unit: string;
};

type ImportResult = {
  totalItems: number;
  successCount: number;
  failedCount: number;
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
  const [preview, setPreview] = useState<{
    validCount: number;
    invalidCount: number;
    preview: PreviewRow[];
    invalid: { rowNum: number; errors: string[] }[];
  } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

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
        title: data.invalidCount > 0
          ? `${data.validCount} valid · ${data.invalidCount} need fixes`
          : `Ready: ${data.validCount} products`,
      });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Preview failed" });
    } finally {
      setPreviewing(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiPublicUrl("/api/admin/import/catalog"), {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      toast({
        title: "Import complete",
        description: `${data.successCount} synced to POS, branches & e-commerce`,
      });
      onSuccess?.();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!compact && (
        <div className="rounded-xl border bg-gradient-to-br from-emerald-50/80 to-white p-5 dark:from-emerald-950/20">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-600" />
            Unified Bulk Upload
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            One file updates e-commerce, all branches, POS, and invoices. Vyapar / Excel / KDF template supported.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="outline" className="gap-1"><ShoppingBag className="w-3 h-3" /> Website</Badge>
            <Badge variant="outline" className="gap-1"><Building2 className="w-3 h-3" /> Branches</Badge>
            <Badge variant="outline">POS / Invoice</Badge>
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
            <p className="font-medium">Drop CSV / Excel or click to browse</p>
            <p className="text-xs">Max 15MB</p>
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

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!file || previewing} onClick={runPreview} className="gap-2">
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Preview & validate
        </Button>
        <Button type="button" disabled={!file || importing} onClick={runImport} className="gap-2">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Import to all systems
        </Button>
      </div>

      {preview && (
        <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-semibold flex-wrap">
            <Eye className="w-4 h-4" /> Preview
            <Badge className="bg-emerald-600">{preview.validCount} valid</Badge>
            {preview.invalidCount > 0 && <Badge variant="destructive">{preview.invalidCount} errors</Badge>}
          </div>
          {preview.invalid.length > 0 && (
            <div className="max-h-24 overflow-y-auto text-xs text-red-600 space-y-1">
              {preview.invalid.slice(0, 8).map((inv, i) => (
                <div key={i}>Row {inv.rowNum}: {inv.errors.join(", ")}</div>
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
                  <th className="text-right py-1 pr-2">Price</th>
                  <th className="text-right py-1 pr-2">Stock</th>
                  <th className="text-left py-1">Branch</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.slice(0, 12).map(r => (
                  <tr key={r.rowNum} className="border-b border-border/50">
                    <td className="py-1.5 pr-2">{r.rowNum}</td>
                    <td className="py-1.5 pr-2 font-medium">{r.productName}</td>
                    <td className="py-1.5 pr-2 font-mono">{r.sku}</td>
                    <td className="py-1.5 pr-2 text-right">{r.salePrice}</td>
                    <td className="py-1.5 pr-2 text-right">{r.stock}</td>
                    <td className="py-1.5">{r.branch}</td>
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
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded-lg p-2 border"><div className="text-xl font-bold">{result.totalItems}</div><div className="text-[10px] text-muted-foreground">Rows</div></div>
            <div className="bg-white rounded-lg p-2 border border-emerald-200"><div className="text-xl font-bold text-emerald-600">{result.successCount}</div><div className="text-[10px] text-muted-foreground">Success</div></div>
            <div className="bg-white rounded-lg p-2 border border-red-200"><div className="text-xl font-bold text-red-500">{result.failedCount}</div><div className="text-[10px] text-muted-foreground">Failed</div></div>
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-28 overflow-y-auto text-xs text-red-600">
              {result.errors.slice(0, 15).map((e, i) => (
                <div key={i} className="flex gap-1 py-0.5"><XCircle className="w-3 h-3 shrink-0 mt-0.5" />{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
