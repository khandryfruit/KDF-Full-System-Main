import React, { useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Package, TrendingUp, Boxes, Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ProductBulkUpload } from "@/components/products/ProductBulkUpload";
import { apiPublicUrl } from "@/lib/apiBase";

const ADMIN_TOKEN = () => localStorage.getItem("kdf_admin_token") ?? "";
const auth = () => ({ Authorization: `Bearer ${ADMIN_TOKEN()}` });

const VYAPAR_COLUMNS = [
  "Item Name", "Item Code", "Category", "Sale Price", "Purchase Price",
  "Opening Stock", "Unit", "GST(%)", "Description", "Barcode",
];

const CATALOG_FIELDS = [
  { col: "product_name", req: true, ex: "Premium Almonds", note: "Product title (Vyapar: Item Name)" },
  { col: "sku", req: true, ex: "ALM001", note: "Unique code (Vyapar: Item Code)" },
  { col: "barcode", req: false, ex: "1234567890123", note: "Scannable barcode" },
  { col: "category", req: false, ex: "Dry Fruits", note: "Category name" },
  { col: "subcategory", req: false, ex: "Nuts", note: "Optional subcategory" },
  { col: "purchase_price", req: false, ex: "1800", note: "Cost price PKR" },
  { col: "sale_price", req: true, ex: "2200", note: "Selling price PKR" },
  { col: "stock", req: false, ex: "50", note: "Quantity at branch" },
  { col: "unit", req: false, ex: "KG", note: "KG, Pcs, Box, etc." },
  { col: "branch", req: false, ex: "Lahore", note: "Branch name/city or 'all'" },
  { col: "brand", req: false, ex: "KDF", note: "Brand name" },
  { col: "description", req: false, ex: "Premium quality…", note: "Product description" },
  { col: "tax", req: false, ex: "0", note: "Tax/VAT %" },
  { col: "low_stock_alert", req: false, ex: "5", note: "Reorder alert level" },
  { col: "images", req: false, ex: "https://…", note: "URL(s), pipe-separated" },
];

function BulkFileAction({
  title,
  description,
  endpoint,
  acceptLabel,
}: {
  title: string;
  description: string;
  endpoint: string;
  acceptLabel: string;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{ successCount: number; failedCount: number; errors: string[] } | null>(null);

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiPublicUrl(endpoint), { method: "POST", headers: auth(), body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSummary(data);
      toast({ title: `${data.successCount} rows updated` });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-xl bg-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <p className="text-xs text-muted-foreground">{acceptLabel} — use columns: <code className="bg-muted px-1 rounded">sku</code>, <code className="bg-muted px-1 rounded">stock</code> or <code className="bg-muted px-1 rounded">sale_price</code>, optional <code className="bg-muted px-1 rounded">branch</code></p>
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          {file ? file.name : "Choose file"}
        </Button>
        <Button type="button" disabled={!file || loading} onClick={run}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Apply update
        </Button>
      </div>
      {summary && (
        <p className="text-sm">
          <span className="text-emerald-600 font-semibold">{summary.successCount} ok</span>
          {summary.failedCount > 0 && <span className="text-red-500 ml-2">{summary.failedCount} failed</span>}
        </p>
      )}
    </div>
  );
}

export default function ImportExportPage() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const res = await fetch(apiPublicUrl(`/api/admin/export/catalog?format=${format}`), { headers: auth() });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kdf-catalog-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Catalog exported" });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const generateBarcodes = async () => {
    try {
      const res = await fetch(apiPublicUrl("/api/admin/import/generate-barcodes"), {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `Generated ${data.count} barcodes` });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Failed" });
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Catalog Import / Export</h1>
        <p className="text-muted-foreground text-sm mt-1">
          One upload syncs <strong>POS</strong>, <strong>invoices</strong>, <strong>branch stock</strong>, and <strong>e-commerce</strong>.
          Import from Vyapar, Excel, or KDF template.
        </p>
      </div>

      <Tabs defaultValue="catalog" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="catalog" className="gap-1.5"><Package className="w-3.5 h-3.5" /> Full catalog</TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5"><Boxes className="w-3.5 h-3.5" /> Bulk stock</TabsTrigger>
          <TabsTrigger value="price" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Bulk price</TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5"><Download className="w-3.5 h-3.5" /> Export</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-6">
          <ProductBulkUpload />
        </TabsContent>

        <TabsContent value="stock">
          <BulkFileAction
            title="Bulk stock update"
            description="Update quantities across branches without changing product names or prices."
            endpoint="/api/admin/import/bulk-stock"
            acceptLabel="CSV / Excel"
          />
        </TabsContent>

        <TabsContent value="price">
          <BulkFileAction
            title="Bulk price update"
            description="Update sale and purchase prices for existing SKUs on POS and website."
            endpoint="/api/admin/import/bulk-price"
            acceptLabel="CSV / Excel"
          />
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <div className="border rounded-xl bg-card p-6 space-y-4">
            <h3 className="font-semibold">Export full catalog</h3>
            <p className="text-sm text-muted-foreground">Includes branch stock, SKUs, barcodes, and e-commerce-only products.</p>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <Button variant="outline" disabled={exporting} onClick={() => handleExport("csv")}>CSV</Button>
              <Button disabled={exporting} onClick={() => handleExport("xlsx")}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                Excel
              </Button>
            </div>
            <Button type="button" variant="secondary" onClick={generateBarcodes} className="gap-2">
              <Barcode className="w-4 h-4" /> Auto-generate missing barcodes
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <div className="border rounded-xl bg-muted/30 p-4 text-sm space-y-2">
        <h3 className="font-semibold">Vyapar export columns (auto-detected)</h3>
        <p className="text-muted-foreground text-xs">
          Export items from Vyapar as Excel/CSV. These headers map automatically:
        </p>
        <p className="text-xs font-mono break-words">{VYAPAR_COLUMNS.join(" · ")}</p>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold">KDF template columns</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Example: Premium Almonds | ALM001 | 123456 | Dry Fruits | 1800 | 2200 | 50 | KG | Lahore | KDF | Premium quality almonds</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Column</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Required</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Example</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CATALOG_FIELDS.map(row => (
                <tr key={row.col} className="hover:bg-muted/20">
                  <td className="px-4 py-2"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.col}</code></td>
                  <td className="px-4 py-2 text-xs">{row.req ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{row.ex}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
