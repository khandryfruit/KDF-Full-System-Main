import { useState } from "react";
import { 
  useListCoupons, 
  useCreateCoupon, 
  useUpdateCoupon, 
  useDeleteCoupon
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
import { Plus, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CouponsPage() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: coupons, isLoading } = useListCoupons();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateCoupon();
  const updateMutation = useUpdateCoupon();
  const deleteMutation = useDeleteCoupon();

  const [formData, setFormData] = useState({
    code: "",
    description: "",
    type: "percentage" as any,
    value: "",
    minOrder: "",
    maxUses: undefined as number | undefined,
    expiresAt: "",
    active: true,
  });

  const handleOpenAdd = () => {
    setFormData({
      code: "",
      description: "",
      type: "percentage",
      value: "",
      minOrder: "",
      maxUses: undefined,
      expiresAt: "",
      active: true,
    });
    setEditingId(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (coupon: any) => {
    setFormData({
      code: coupon.code,
      description: coupon.description || "",
      type: coupon.type,
      value: coupon.value,
      minOrder: coupon.minOrder || "",
      maxUses: coupon.maxUses,
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().split('T')[0] : "",
      active: coupon.active,
    });
    setEditingId(coupon.id);
    setIsAddOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
          setIsAddOpen(false);
          toast({ title: "Coupon updated" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to update coupon" })
      });
    } else {
      createMutation.mutate({ data: payload as any }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
          setIsAddOpen(false);
          toast({ title: "Coupon created" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to create coupon" })
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this coupon?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
          toast({ title: "Coupon deleted" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to delete coupon" })
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Coupons</h1>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenAdd}>
              <Plus className="w-4 h-4 mr-2" /> Add Coupon
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Coupon" : "Add Coupon"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} placeholder="e.g. SUMMER20" />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (Rs.)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Value</Label>
                  <Input required type="number" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} placeholder={formData.type === 'percentage' ? "20" : "500"} />
                </div>
                <div className="space-y-2">
                  <Label>Min Order (Rs.)</Label>
                  <Input type="number" value={formData.minOrder} onChange={e => setFormData({...formData, minOrder: e.target.value})} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Description</Label>
                  <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Max Uses</Label>
                  <Input type="number" value={formData.maxUses || ''} onChange={e => setFormData({...formData, maxUses: e.target.value ? parseInt(e.target.value) : undefined})} placeholder="Unlimited" />
                </div>
                <div className="space-y-2">
                  <Label>Expires At</Label>
                  <Input type="date" value={formData.expiresAt} onChange={e => setFormData({...formData, expiresAt: e.target.value})} />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch checked={formData.active} onCheckedChange={c => setFormData({...formData, active: c})} />
                  <Label>Active</Label>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Update" : "Save"} Coupon
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : coupons?.length ? (
              coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <div className="font-bold text-primary">{coupon.code}</div>
                    <div className="text-xs text-muted-foreground">{coupon.description}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {coupon.type === 'percentage' ? `${coupon.value}% OFF` : `Rs. ${coupon.value} OFF`}
                    </div>
                    {coupon.minOrder && <div className="text-xs text-muted-foreground">Min: Rs. {coupon.minOrder}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{coupon.usedCount} used</div>
                    {coupon.maxUses && <div className="text-xs text-muted-foreground">Max: {coupon.maxUses}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {coupon.active ? (
                        <Badge variant="outline" className="w-fit bg-green-50 text-green-700 border-green-200">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="w-fit bg-gray-50 text-gray-700 border-gray-200">Inactive</Badge>
                      )}
                      {coupon.expiresAt && new Date(coupon.expiresAt) < new Date() && (
                        <Badge variant="destructive" className="w-fit">Expired</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(coupon)}>
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(coupon.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No coupons found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
