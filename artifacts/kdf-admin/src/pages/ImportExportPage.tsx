import React, { useState, useRef } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2, FileDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";

const TEMPLATE_HEADERS = ["name","price","original_price","stock","description","category_id","images","variants","tags","weight","unit","featured"];

function downloadTemplate(format: "csv" | "xlsx") {
  if (format === "csv") {
    const csv = TEMPLATE_HEADERS.join(",") + "\n" + "Roasted Almonds,899,1099,50,Premium roasted almonds,,/objects/uploads/example.jpg,[],nuts,200g,g,false";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "products-template.csv"; a.click();
  }
}

interface ImportResult {
  jobId: number;
  totalItems: number;
  successCount: number;
  failedCount: number;
  errors: string[];
}

export default function ImportExportPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      toast({ variant: "destructive", title: "Unsupported file", description: "Please upload a CSV or Excel file (.csv, .xlsx, .xls)" });
      return;
    }
    setSelectedFile(file);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch("/api/admin/import/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      toast({ title: `Import complete: ${data.successCount} products added` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import failed", description: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/export/products?format=${format}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN()}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Products exported as .${format.toUpperCase()}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export failed", description: err.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import / Export</h1>
        <p className="text-muted-foreground text-sm mt-1">Bulk import products from CSV or Excel, or export your catalog</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Import Card */}
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <Upload className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Import Products</h2>
                <p className="text-xs text-muted-foreground">Upload CSV or Excel (.xlsx) file</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              } ${selectedFile ? "border-green-400 bg-green-50" : ""}`}
            >
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="w-10 h-10 text-green-500" />
                  <p className="font-semibold text-green-700">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB · Click to change</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="w-10 h-10 opacity-40" />
                  <p className="font-medium">Drop your file here or click to browse</p>
                  <p className="text-xs">Supports .csv, .xlsx, .xls — max 10MB</p>
                </div>
              )}
            </div>

            {/* Template Download */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Need a template?</span>
              <button onClick={() => downloadTemplate("csv")} className="text-primary font-semibold hover:underline">Download CSV template</button>
            </div>

            <Button onClick={handleImport} disabled={!selectedFile || importing} className="w-full h-11">
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : <><Upload className="w-4 h-4 mr-2" />Import Products</>}
            </Button>

            {/* Result */}
            {result && (
              <div className={`rounded-xl border p-4 space-y-3 ${result.failedCount === 0 ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
                <div className="flex items-center gap-2">
                  {result.failedCount === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-sm">Import Summary</span>
                  <Badge variant="outline" className="ml-auto text-xs">Job #{result.jobId}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 text-center border">
                    <div className="text-2xl font-bold">{result.totalItems}</div>
                    <div className="text-xs text-muted-foreground">Total Rows</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                    <div className="text-2xl font-bold text-green-600">{result.successCount}</div>
                    <div className="text-xs text-muted-foreground">Imported</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center border border-red-200">
                    <div className="text-2xl font-bold text-red-500">{result.failedCount}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <div className="bg-white rounded-lg border border-red-200 p-3 max-h-32 overflow-y-auto">
                    <p className="text-xs font-semibold text-red-600 mb-1">Errors:</p>
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-red-600 py-0.5">
                        <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {e}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Export Card */}
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
                <Download className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Export Products</h2>
                <p className="text-xs text-muted-foreground">Download your full product catalog</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-muted/30 rounded-xl p-5 space-y-2">
              <p className="text-sm font-medium">What's included in the export:</p>
              {["Product name, slug, description", "Price & original price", "Stock quantity", "Category ID", "Images (pipe-separated)", "Variants (JSON)", "Tags, weight, unit", "Featured, active status", "Ratings & review count", "Created date"].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  {item}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => handleExport("csv")} disabled={exporting} className="h-12 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <FileDown className="w-4 h-4" />
                  <span className="font-semibold">CSV</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-normal">Universal format</span>
              </Button>
              <Button onClick={() => handleExport("xlsx")} disabled={exporting} className="h-12 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="font-semibold">Excel</span>
                </div>
                <span className="text-[10px] opacity-70 font-normal">Opens in Excel</span>
              </Button>
            </div>

            {exporting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating export file...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Field Reference */}
      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">CSV / Excel Field Reference</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Column headers your import file must use</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left px-4 py-2.5 font-semibold text-xs">Column</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs">Required</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs">Example</th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { col: "name", req: true, ex: "Roasted Almonds", note: "Product title" },
                { col: "price", req: true, ex: "899", note: "Selling price in PKR" },
                { col: "original_price", req: false, ex: "1099", note: "For showing discount" },
                { col: "stock", req: false, ex: "50", note: "Defaults to 0" },
                { col: "description", req: false, ex: "Premium quality...", note: "Plain text" },
                { col: "category_id", req: false, ex: "3", note: "Numeric category ID" },
                { col: "images", req: false, ex: "/objects/uploads/abc.jpg", note: "Multiple: use | separator" },
                { col: "variants", req: false, ex: '[]', note: "JSON array of variant objects" },
                { col: "tags", req: false, ex: "nuts,premium", note: "Comma-separated" },
                { col: "weight", req: false, ex: "200g", note: "Free-text" },
                { col: "featured", req: false, ex: "true", note: "true or false" },
              ].map(row => (
                <tr key={row.col} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5"><code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{row.col}</code></td>
                  <td className="px-4 py-2.5">{row.req ? <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-xs">Required</Badge> : <span className="text-muted-foreground text-xs">Optional</span>}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">{row.ex}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
