import { useCallback, useEffect, useState } from "react";
import { Factory, Plus, Search, Phone, Mail, Loader2, ChevronRight, Wallet } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { erpFetch } from "@/lib/adminErpApi";

type Party = {
  id: number;
  name: string;
  code?: string;
  phone?: string;
  email?: string;
  city?: string;
  creditLimit?: string;
  paymentTermsDays?: number;
  outstanding?: number;
  purchaseCount?: number;
};

const EMPTY = { name: "", phone: "", email: "", city: "", code: "", paymentTermsDays: 30, openingBalance: 0 };

export default function SuppliersPage() {
  const { toast } = useToast();
  const [parties, setParties] = useState<Party[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await erpFetch<{ parties: Party[] }>(`/parties?q=${encodeURIComponent(q)}`);
      setParties(d.parties ?? []);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Load failed" });
    } finally {
      setLoading(false);
    }
  }, [q, toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await erpFetch("/parties", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Supplier added" });
      setModal(false);
      setForm(EMPTY);
      load();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="w-7 h-7 text-teal-600" /> Suppliers & Parties
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Ledger, outstanding dues, purchase history</p>
        </div>
        <Button onClick={() => setModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Supplier
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search suppliers…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3">
          {parties.map(p => (
            <Link key={p.id} href={`/erp/suppliers/${p.id}`}
              className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:border-teal-300 hover:shadow-sm transition-all">
              <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Factory className="w-5 h-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{p.name}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-0.5">
                  {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                  {p.city && <span>{p.city}</span>}
                  {p.code && <span className="font-mono">{p.code}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {(p.outstanding ?? 0) > 0 ? (
                  <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                    <Wallet className="w-3 h-3 mr-1" />
                    Due Rs.{Number(p.outstanding).toLocaleString("en-PK")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-emerald-700">Clear</Badge>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{p.purchaseCount ?? 0} purchases</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          ))}
          {!parties.length && (
            <p className="text-center text-muted-foreground py-12">No suppliers yet — add your first vendor.</p>
          )}
        </div>
      )}

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Supplier</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Input placeholder="Supplier name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <Input placeholder="City" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <Input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Code (SKU prefix)" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Supplier"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
