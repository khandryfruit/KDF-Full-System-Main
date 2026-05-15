import { useEffect, useState } from "react";
import { ClipboardList, Plus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { erpFetch } from "@/lib/adminErpApi";
import { apiPublicUrl } from "@/lib/apiBase";

type Line = { name: string; itemCode: string; qty: string; unitCost: string; unit: string };

export default function ErpPurchasesPage() {
  const { toast } = useToast();
  const [parties, setParties] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [partyId, setPartyId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ name: "", itemCode: "", qty: "1", unitCost: "", unit: "KG" }]);
  const [paidAmount, setPaidAmount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("kdf_admin_token") ?? "";
    erpFetch<{ parties: any[] }>("/parties").then(d => setParties(d.parties ?? [])).catch(() => {});
    fetch(apiPublicUrl("/api/admin/branches"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setBranches(Array.isArray(d) ? d : d.branches ?? [])).catch(() => {});
    erpFetch<{ purchases: any[] }>("/purchases").then(d => setHistory(d.purchases ?? [])).catch(() => {});
  }, []);

  const addLine = () => setLines(l => [...l, { name: "", itemCode: "", qty: "1", unitCost: "", unit: "KG" }]);
  const updateLine = (i: number, patch: Partial<Line>) => setLines(l => l.map((row, j) => j === i ? { ...row, ...patch } : row));

  const submit = async () => {
    if (!partyId || !branchId) { toast({ variant: "destructive", title: "Select supplier and branch" }); return; }
    const parsed = lines.filter(l => l.name && l.unitCost).map(l => ({
      name: l.name,
      itemCode: l.itemCode || undefined,
      qty: parseFloat(l.qty) || 0,
      unitCost: parseFloat(l.unitCost) || 0,
      unit: l.unit,
    }));
    if (!parsed.length) return;
    setSaving(true);
    try {
      await erpFetch("/purchases", {
        method: "POST",
        body: JSON.stringify({
          partyId: parseInt(partyId),
          branchId: parseInt(branchId),
          lines: parsed,
          paidAmount: parseFloat(paidAmount) || 0,
          syncEcommerce: true,
        }),
      });
      toast({ title: "Purchase posted — stock & costs updated" });
      setLines([{ name: "", itemCode: "", qty: "1", unitCost: "", unit: "KG" }]);
      const d = await erpFetch<{ purchases: any[] }>("/purchases");
      setHistory(d.purchases ?? []);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-7 h-7 text-indigo-600" /> Smart Purchase
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Records purchase, weighted average cost, supplier ledger, branch stock & e-commerce sync.
        </p>
      </div>

      <div className="border rounded-xl p-5 space-y-4 bg-card">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Supplier</label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {parties.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Branch</label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                {branches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Line items</p>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-4" placeholder="Product" value={line.name} onChange={e => updateLine(i, { name: e.target.value })} />
              <Input className="col-span-2" placeholder="SKU" value={line.itemCode} onChange={e => updateLine(i, { itemCode: e.target.value })} />
              <Input className="col-span-2" placeholder="Qty" type="number" value={line.qty} onChange={e => updateLine(i, { qty: e.target.value })} />
              <Input className="col-span-3" placeholder="Cost/unit" type="number" value={line.unitCost} onChange={e => updateLine(i, { unitCost: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => setLines(l => l.filter((_, j) => j !== i))}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add line</Button>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Paid now (Rs.)</label>
            <Input type="number" className="w-32" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Post purchase & update inventory
          </Button>
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-2">Recent purchases</h2>
        <ul className="space-y-2 text-sm">
          {history.slice(0, 15).map(p => (
            <li key={p.id} className="flex justify-between border rounded-lg px-3 py-2">
              <span>{p.purchaseNo}</span>
              <span className="font-medium">Rs.{Number(p.grandTotal).toLocaleString("en-PK")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
