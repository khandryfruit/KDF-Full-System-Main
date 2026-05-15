import { useEffect, useState } from "react";
import { ArrowRightLeft, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { erpFetch } from "@/lib/adminErpApi";
import { apiPublicUrl } from "@/lib/apiBase";

export default function BranchTransfersPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [lines, setLines] = useState<{ productId: number; qty: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const token = () => localStorage.getItem("kdf_admin_token") ?? "";

  const load = async () => {
    fetch(apiPublicUrl("/api/admin/branches"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setBranches(Array.isArray(d) ? d : d.branches ?? []));
    erpFetch<{ transfers: any[] }>("/transfers").then(d => setTransfers(d.transfers ?? []));
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!fromId) return;
    fetch(apiPublicUrl(`/api/admin/stock/products?branchId=${fromId}&limit=100`), {
      headers: { Authorization: `Bearer ${token()}` },
    }).then(r => r.json()).then(d => setProducts((d.products ?? []).filter((p: any) => p.source !== "shopify")));
  }, [fromId]);

  const addLine = () => {
    const p = products.find((x: any) => String(x.id) === productId);
    if (!p || !qty) return;
    setLines(l => [...l, { productId: p.id, qty: parseFloat(qty), name: p.name }]);
    setProductId("");
    setQty("1");
  };

  const createTransfer = async () => {
    if (!fromId || !toId || !lines.length) return;
    setSaving(true);
    try {
      await erpFetch("/transfers", {
        method: "POST",
        body: JSON.stringify({
          fromBranchId: parseInt(fromId),
          toBranchId: parseInt(toId),
          lines,
        }),
      });
      toast({ title: "Transfer created — pending approval" });
      setLines([]);
      load();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  };

  const approve = async (id: number) => {
    await erpFetch(`/transfers/${id}/approve`, { method: "POST" });
    toast({ title: "Approved" });
    load();
  };

  const receive = async (id: number) => {
    await erpFetch(`/transfers/${id}/receive`, { method: "POST" });
    toast({ title: "Received — stock moved" });
    load();
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ArrowRightLeft className="w-7 h-7" /> Branch Transfers
      </h1>
      <p className="text-sm text-muted-foreground">Move stock between branches with cost preserved & approval workflow.</p>

      <div className="border rounded-xl p-5 space-y-4 bg-card">
        <div className="grid sm:grid-cols-2 gap-3">
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger><SelectValue placeholder="From branch" /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger><SelectValue placeholder="To branch" /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              {products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.stockQty})</SelectItem>)}
            </SelectContent>
          </Select>
          <input className="border rounded-md px-3 w-20" type="number" value={qty} onChange={e => setQty(e.target.value)} />
          <Button type="button" variant="outline" onClick={addLine}>Add</Button>
        </div>
        {lines.map((l, i) => (
          <p key={i} className="text-sm">{l.name} × {l.qty}</p>
        ))}
        <Button onClick={createTransfer} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : "Create transfer"}</Button>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Transfers</h2>
        {transfers.map(t => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3 text-sm">
            <span>{t.transferNo} · {t.status}</span>
            <div className="flex gap-2">
              {t.status === "pending" && <Button size="sm" variant="outline" onClick={() => approve(t.id)}>Approve</Button>}
              {t.status === "approved" && <Button size="sm" onClick={() => receive(t.id)}><CheckCircle className="w-3 h-3 mr-1" />Receive</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
