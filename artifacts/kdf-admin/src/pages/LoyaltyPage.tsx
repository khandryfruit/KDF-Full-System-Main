import { useState } from "react";
import { 
  useGetLoyaltyTransactions,
  useListUsers
} from "@workspace/api-client-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, ArrowDownRight, Award } from "lucide-react";

export default function LoyaltyPage() {
  const [page, setPage] = useState(1);
  const [filterUserId, setFilterUserId] = useState<number | undefined>();

  const { data: response, isLoading } = useGetLoyaltyTransactions({ userId: filterUserId, page });
  const { data: usersRes } = useListUsers({ limit: 100 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Award className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Loyalty Points</h1>
        </div>
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
              <TableHead className="text-right">Points</TableHead>
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
                    {tx.referenceId && <div className="text-xs text-muted-foreground">Order Ref: {tx.referenceId}</div>}
                  </TableCell>
                  <TableCell>
                    {tx.type === 'credit' ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <ArrowUpRight className="w-3 h-3 mr-1" /> Earned
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        <ArrowDownRight className="w-3 h-3 mr-1" /> Redeemed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{tx.points} pts
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No loyalty transactions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
