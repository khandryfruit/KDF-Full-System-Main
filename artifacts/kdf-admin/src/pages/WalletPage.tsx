import { useState } from "react";
import { 
  useGetWalletTransactions, 
  useAdjustWallet,
  useListUsers,
  getGetWalletTransactionsQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";

export default function WalletPage() {
  const [page, setPage] = useState(1);
  const [filterUserId, setFilterUserId] = useState<number | undefined>();
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  const { data: response, isLoading } = useGetWalletTransactions({ userId: filterUserId, page, limit: 20 });
  const { data: usersRes } = useListUsers({ limit: 100 });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const adjustMutation = useAdjustWallet();

  const [formData, setFormData] = useState({
    userId: undefined as number | undefined,
    amount: "",
    type: "credit" as "credit" | "debit",
    description: "",
  });

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.userId) {
      toast({ variant: "destructive", title: "Select a user" });
      return;
    }
    
    adjustMutation.mutate({ 
      data: {
        userId: formData.userId,
        amount: formData.amount,
        type: formData.type,
        description: formData.description
      } 
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
        setIsAdjustOpen(false);
        setFormData({ userId: undefined, amount: "", type: "credit", description: "" });
        toast({ title: "Wallet adjusted successfully" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to adjust wallet" })
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Wallet Operations</h1>
        
        <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
          <DialogTrigger asChild>
            <Button>
              <Wallet className="w-4 h-4 mr-2" /> Adjust Balance
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adjust User Wallet</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdjustSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>User</Label>
                <Select value={formData.userId?.toString()} onValueChange={(v) => setFormData({...formData, userId: parseInt(v)})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersRes?.items?.map(u => (
                      <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.phone})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Operation Type</Label>
                  <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Credit (Add)</SelectItem>
                      <SelectItem value="debit">Debit (Remove)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (Rs.)</Label>
                  <Input required type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description / Reason</Label>
                <Input required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="e.g. Refund for Order #123" />
              </div>
              <Button type="submit" className="w-full" disabled={adjustMutation.isPending}>
                Execute Adjustment
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center">
        <Select value={filterUserId?.toString() || "all"} onValueChange={(v) => setFilterUserId(v === "all" ? undefined : parseInt(v))}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Filter by User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {usersRes?.items?.map(u => (
              <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User ID</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : response?.items?.length ? (
              response.items.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm">#{tx.userId}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{tx.description}</div>
                    {tx.referenceId && <div className="text-xs text-muted-foreground">Ref: {tx.referenceId}</div>}
                  </TableCell>
                  <TableCell>
                    {tx.type === 'credit' ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <ArrowUpRight className="w-3 h-3 mr-1" /> Credit
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        <ArrowDownRight className="w-3 h-3 mr-1" /> Debit
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'credit' ? '+' : '-'}Rs. {tx.amount}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No wallet transactions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
