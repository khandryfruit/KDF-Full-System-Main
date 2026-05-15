import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { erpFetch } from "@/lib/adminErpApi";
import { useToast } from "@/hooks/use-toast";

export default function ErpSupplierDetailPage() {
  const [, params] = useRoute("/erp/suppliers/:id");
  const id = params?.id;
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [payAmt, setPayAmt] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setData(await erpFetch(`/parties/${id}`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const recordPayment = async () => {
    const amount = parseFloat(payAmt);
    if (!amount || amount <= 0) return;
    try {
      await erpFetch(`/parties/${id}/payments`, { method: "POST", body: JSON.stringify({ amount }) });
      toast({ title: "Payment recorded" });
      setPayAmt("");
      load();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Failed" });
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!data?.party) {
    return <div className="p-8">Not found</div>;
  }

  const { party, outstanding, ledger, purchases } = data;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Link href="/erp/suppliers">
        <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Suppliers</Button>
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{party.name}</h1>
          <p className="text-muted-foreground text-sm">{party.phone} · {party.city}</p>
        </div>
        <div className="rounded-xl border p-4 bg-amber-50 border-amber-200">
          <p className="text-xs text-amber-800 font-medium">Outstanding</p>
          <p className="text-2xl font-bold text-amber-900">Rs.{Number(outstanding).toLocaleString("en-PK")}</p>
        </div>
      </div>

      <div className="flex gap-2 max-w-sm">
        <Input type="number" placeholder="Payment amount" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
        <Button onClick={recordPayment}><Wallet className="w-4 h-4 mr-1" /> Pay</Button>
      </div>

      <div>
        <h2 className="font-semibold mb-2">Ledger</h2>
        <div className="border rounded-xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Type</th>
                <th className="text-right p-2">Debit</th>
                <th className="text-right p-2">Credit</th>
                <th className="text-right p-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(ledger ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="p-2">{r.entryType}</td>
                  <td className="p-2 text-right">{r.debit}</td>
                  <td className="p-2 text-right">{r.credit}</td>
                  <td className="p-2 text-right font-medium">{r.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-2">Purchases</h2>
        <ul className="space-y-2">
          {(purchases ?? []).map((p: any) => (
            <li key={p.id} className="flex justify-between border rounded-lg p-3 text-sm">
              <span>{p.purchaseNo}</span>
              <span className="font-semibold">Rs.{Number(p.grandTotal).toLocaleString("en-PK")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
